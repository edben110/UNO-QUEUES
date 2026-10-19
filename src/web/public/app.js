(() => {
  const $ = (id) => document.getElementById(id);
  const COLORS = { RED: '#e5383b', BLUE: '#2f6fed', GREEN: '#2eb872', YELLOW: '#f5c518' };
  const COLOR_NAMES = { RED: 'rojo', BLUE: 'azul', GREEN: 'verde', YELLOW: 'amarillo' };

  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
  };
  // el id de jugador es por pestaña: recargar reconecta, otra pestaña es otro jugador
  const pid = {
    get: () => { try { return sessionStorage.getItem('uno.playerId'); } catch (e) { return null; } },
    set: (v) => { try { sessionStorage.setItem('uno.playerId', v); } catch (e) {} },
  };

  let ws = null;
  let session = null; // { playerId, isHost, config }
  let state = null;
  let hand = [];
  let clockOffset = 0;
  let pendingWild = null;
  let toastTimer = null;
  let retried = false;

  // ---------- conexion ----------
  function connect(autoJoin) {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}`);
    ws.onopen = () => {
      $('conn').className = 'dot on';
      const name = store.get('uno.name');
      if (autoJoin && name) join(name);
    };
    ws.onclose = () => {
      $('conn').className = 'dot off';
      session = null;
      showToast('Conexión perdida. Reconectando…', true);
      setTimeout(() => connect(true), 1500);
    };
    ws.onmessage = (ev) => onMessage(JSON.parse(ev.data));
  }

  function send(obj) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
    else if (ws && ws.readyState === 0) ws.addEventListener('open', () => ws.send(JSON.stringify(obj)), { once: true });
  }

  function join(name) {
    store.set('uno.name', name);
    send({ type: 'join', name, playerId: pid.get() });
  }

  function onMessage(m) {
    if (m.type === 'session') {
      session = m;
      pid.set(m.playerId);
      retried = false;
    } else if (m.type === 'fatal') {
      if (!retried) { retried = true; setTimeout(() => join(store.get('uno.name') || 'Jugador'), 1200); return; }
      $('joinError').textContent = m.error;
    } else if (m.type === 'update') {
      if (m.state) {
        state = m.state;
        clockOffset = state.serverTime - Date.now();
      }
      if (m.hand) hand = m.hand;
      if (m.message) {
        if (m.message.type === 'ERROR') {
          showToast(translate(m.message.text), true);
          if (!inGame()) $('joinError').textContent = translate(m.message.text);
        }
      }
      render();
    }
  }

  const ERR = {
    NOT_YOUR_TURN: 'No es tu turno',
    INVALID_PLAY: 'Esa carta no se puede jugar ahora',
    CARD_NOT_FOUND: 'No tienes esa carta',
    PLAYER_NOT_FOUND: 'Jugador no encontrado',
  };
  const translate = (t) => ERR[t] || t;

  // ---------- helpers ----------
  const me = () => state && session && state.players.find((p) => p.id === session.playerId);
  const inGame = () => !!(state && me());
  const myTurn = () => state && session && state.status === 'STARTED' && state.currentPlayerId === session.playerId;

  function canPlay(card) {
    if (!myTurn()) return false;
    if (state.pendingDraw) {
      return card.type === 'WILD_DRAW4' || (card.type === 'DRAW2' && state.pendingDraw.topType === 'DRAW2');
    }
    const top = state.topCard;
    const topColor = state.currentColor || top.color;
    if (card.type === 'WILD' || card.type === 'WILD_DRAW4') return true;
    if (topColor !== 'WILD' && card.color === topColor) return true;
    if (top.type === 'NUMBER' && card.type === 'NUMBER' && card.value === top.value) return true;
    if (card.type !== 'NUMBER' && card.symbol && top.symbol && card.symbol === top.symbol) return true;
    if (card.type !== 'NUMBER' && top.type !== 'NUMBER' && card.type === top.type) return true;
    return false;
  }

  function cardFace(card) {
    switch (card.type) {
      case 'NUMBER': return String(card.value);
      case 'SKIP': return '⊘';
      case 'REVERSE': return '⇄';
      case 'DRAW2': return '+2';
      case 'WILD': return '★';
      case 'WILD_DRAW4': return '+4';
      default: return '?';
    }
  }

  function cardEl(card, label) {
    const el = document.createElement('div');
    el.className = `card ${card.color}`;
    const face = cardFace(card);
    el.innerHTML = '<span class="corner"></span><span class="v"></span>';
    el.querySelector('.corner').textContent = face;
    el.querySelector('.v').textContent = face;
    el.setAttribute('aria-label', label || face);
    return el;
  }

  function showToast(text, err) {
    const t = $('toast');
    t.textContent = text;
    t.className = 'toast' + (err ? ' err' : '');
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  function show(id) {
    ['screenJoin', 'screenLobby', 'screenTable'].forEach((s) => { $(s).hidden = s !== id; });
  }

  // ---------- render ----------
  function render() {
    const joined = inGame();
    $('leaveBtn').hidden = !joined;
    $('gameInfo').textContent = state ? `Partida ${state.gameId}` : '';

    if (!joined) {
      show('screenJoin');
      closeModals();
      return;
    }
    if (state.status === 'WAITING') {
      show('screenLobby');
      renderLobby();
      closeModals();
      return;
    }
    show('screenTable');
    if (!myTurn() && pendingWild) { pendingWild = null; $('colorModal').hidden = true; }
    renderTable();
    renderModals();
  }

  function renderLobby() {
    const ul = $('lobbyPlayers');
    ul.innerHTML = '';
    state.players.forEach((p) => {
      const li = document.createElement('li');
      li.textContent = p.name + (p.id === session.playerId ? ' (tú)' : '');
      if (!p.active) li.className = 'away';
      ul.appendChild(li);
    });
    const enough = state.players.filter((p) => p.active).length >= 2;
    $('startBtn').hidden = !session.isHost;
    $('startBtn').disabled = !enough;
    $('lobbyHint').textContent = session.isHost
      ? (enough ? '' : 'Esperando a más jugadores…')
      : 'Esperando a que el anfitrión inicie la partida…';
  }

  function renderTable() {
    const mine = myTurn();
    const cur = state.players.find((p) => p.id === state.currentPlayerId);

    // oponentes
    const opp = $('opponents');
    opp.innerHTML = '';
    state.players.filter((p) => p.id !== session.playerId).forEach((p) => {
      const li = document.createElement('li');
      li.className = 'opponent' + (p.id === state.currentPlayerId && state.status === 'STARTED' ? ' turn' : '') + (p.active ? '' : ' away');
      const n = document.createElement('div'); n.className = 'n'; n.textContent = p.name;
      const c = document.createElement('div'); c.className = 'c';
      c.textContent = p.active ? `${p.handSize} carta${p.handSize === 1 ? '' : 's'}` : 'desconectado';
      li.append(n, c);
      if (p.active && p.handSize === 1) {
        const u = document.createElement('div'); u.className = 'uno'; u.textContent = '¡UNO!'; li.appendChild(u);
      }
      opp.appendChild(li);
    });

    // centro
    const top = $('topCard');
    top.innerHTML = '';
    if (state.topCard) top.appendChild(cardEl(state.topCard));
    $('colorDot').style.background = COLORS[state.currentColor] || '#888';
    $('colorDot').title = COLOR_NAMES[state.currentColor] || '';
    $('dirLabel').textContent = state.direction === 1 ? '↻ sentido normal' : '↺ sentido inverso';

    const pile = $('drawPile');
    pile.disabled = !mine;
    pile.classList.toggle('mine', !!mine);
    $('drawLabel').textContent = state.pendingDraw ? `Robar ${state.pendingDraw.amount}` : 'Robar';

    const pend = $('pending');
    pend.hidden = !state.pendingDraw;
    if (state.pendingDraw) pend.textContent = `Robo acumulado: +${state.pendingDraw.amount} — apila un ${state.pendingDraw.topType === 'DRAW2' ? '+2 o +4' : '+4'} o roba`;

    const tl = $('turnLabel');
    tl.className = 'turn-label' + (mine ? ' mine' : '');
    tl.textContent = state.status === 'STARTED' ? (mine ? '¡Es tu turno!' : `Turno de ${cur ? cur.name : '…'}`) : '';

    // mano
    const h = $('hand');
    h.innerHTML = '';
    hand.forEach((card) => {
      const ok = canPlay(card);
      const el = cardEl(card);
      el.classList.add(ok ? 'playable' : (mine ? 'dim' : 'idle'));
      if (!ok && !mine) el.classList.remove('idle');
      el.onclick = () => onCardClick(card, ok);
      h.appendChild(el);
    });
  }

  function renderModals() {
    const finished = state.status === 'FINISHED';
    const mePlayer = me();
    $('awayModal').hidden = !(mePlayer && !mePlayer.active && !finished);

    $('endModal').hidden = !finished;
    if (finished) {
      const winner = state.players.find((p) => p.id === state.winnerId);
      const won = winner && winner.id === session.playerId;
      $('endTitle').textContent = !winner ? 'Partida terminada' : (won ? '¡Ganaste! 🎉' : `Ganó ${winner.name}`);
      $('endText').textContent = state.endReason === 'ABANDONED'
        ? 'Los demás jugadores abandonaron la partida.'
        : '';
      $('againBtn').hidden = !session.isHost;
      $('againHint').hidden = session.isHost;
    }
  }

  function closeModals() {
    ['colorModal', 'endModal', 'awayModal'].forEach((m) => { $(m).hidden = true; });
  }

  // ---------- timer ----------
  function tick() {
    const fill = $('timerFill');
    const txt = $('timerText');
    if (state && state.status === 'STARTED' && state.turnDeadline && !$('screenTable').hidden) {
      const total = state.turnTimeoutMs || 10000;
      const left = Math.max(0, state.turnDeadline - (Date.now() + clockOffset));
      const ratio = Math.min(1, left / total);
      fill.style.transform = `scaleX(${ratio})`;
      fill.className = ratio < 0.25 ? 'danger' : ratio < 0.5 ? 'warn' : '';
      txt.textContent = `${Math.ceil(left / 1000)} s`;
    } else {
      fill.style.transform = 'scaleX(1)';
      fill.className = '';
      txt.textContent = '';
    }
    requestAnimationFrame(tick);
  }

  // ---------- acciones ----------
  function onCardClick(card, ok) {
    if (!myTurn()) { showToast('No es tu turno', true); return; }
    if (!ok) { showToast('Esa carta no se puede jugar ahora', true); return; }
    if (card.type === 'WILD' || card.type === 'WILD_DRAW4') {
      pendingWild = card.id;
      $('colorModal').hidden = false;
      return;
    }
    send({ type: 'play', cardId: card.id });
  }

  $('joinForm').addEventListener('submit', (e) => {
    e.preventDefault();
    $('joinError').textContent = '';
    join($('nameInput').value.trim() || 'Jugador');
  });
  $('startBtn').onclick = () => send({ type: 'start' });
  $('againBtn').onclick = () => send({ type: 'start' });
  $('drawPile').onclick = () => { if (myTurn()) send({ type: 'draw' }); };
  $('rejoinBtn').onclick = () => send({ type: 'rejoin' });
  $('leaveBtn').onclick = () => {
    send({ type: 'leave' });
    pid.set('');
    state = null; hand = []; session = null;
    render();
  };
  $('colorCancel').onclick = () => { pendingWild = null; $('colorModal').hidden = true; };
  document.querySelectorAll('.swatch').forEach((b) => {
    b.onclick = () => {
      if (pendingWild) send({ type: 'play', cardId: pendingWild, color: b.dataset.color });
      pendingWild = null;
      $('colorModal').hidden = true;
    };
  });

  // ---------- inicio ----------
  $('nameInput').value = store.get('uno.name') || '';
  show('screenJoin');
  connect(true);
  requestAnimationFrame(tick);
})();
