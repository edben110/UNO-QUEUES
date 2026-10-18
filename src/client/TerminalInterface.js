import readline from 'readline';

const COLOR_LABELS = {
  RED: 'ROJO',
  BLUE: 'AZUL',
  GREEN: 'VERDE',
  YELLOW: 'AMARILLO',
  WILD: 'COMODIN',
};

function cardLabel(card, index) {
  const color = COLOR_LABELS[card.color] || card.color;
  if (card.type === 'NUMBER') return `${index}) ${color} ${card.value}`;
  if (card.type === 'SKIP') return `${index}) ${color} SALTO`;
  if (card.type === 'REVERSE') return `${index}) ${color} CAMBIO`;
  if (card.type === 'DRAW2') return `${color} ROBA2`;
  if (card.type === 'WILD') return `${index}) COMODIN`;
  if (card.type === 'WILD_DRAW4') return `${index}) COMODIN ROBA4`;
  return `${index}) ${card.type}`;
}

function isWild(card) {
  return card.type === 'WILD' || card.type === 'WILD_DRAW4';
}

export class TerminalInterface {
  constructor(rl, client) {
    this.rl = rl;
    this.client = client;
    this.awaitingColor = null;
    this.message = null;
    this.lastRender = '';

    client.on('update', () => this.render());
    rl.on('line', (line) => this.handleInput(line.trim()));
    rl.on('close', () => {
      console.log('\nSaliendo...');
      process.exit(0);
    });
  }

  setMessage(type, text) {
    this.message = { type, text };
  }

  buildBoard() {
    const s = this.client.state;
    const lines = [];
    lines.push('==================== UNO.js ====================');

    if (!s) {
      lines.push('Conectado. Esperando estado de la partida...');
      lines.push('');
      lines.push('Opciones: p=ver jugadores | s=salir');
      return lines;
    }

    const top = s.topCard;
    const topLabel = top
      ? `${COLOR_LABELS[top.color] || top.color} ${top.type === 'NUMBER' ? top.value : top.type}`
      : '-';
    const turnPlayer = (s.players || []).find((p) => p.id === s.currentPlayerId);
    const myTurn = turnPlayer && turnPlayer.id === this.client.playerId;

    lines.push(`Partida: ${s.gameId} | Estado: ${s.status} | Sentido: ${s.direction === 1 ? 'normal' : 'inverso'}`);
    lines.push(`Carta activa: ${topLabel} | Color: ${COLOR_LABELS[s.currentColor] || s.currentColor}`);
    lines.push(`Turno: ${turnPlayer ? turnPlayer.name : '-'}${myTurn ? '  <== TU TURNO' : ''}`);
    if (s.pendingDraw) {
      const t = s.pendingDraw.topType === 'WILD_DRAW4' ? '+4' : '+2';
      lines.push(`ROBO PENDIENTE: +${s.pendingDraw.amount} (ultimo: ${t}). Apila con +4 o roba [d]`);
    }
    if (s.status === 'FINISHED') {
      const winner = (s.players || []).find((p) => p.id === s.winnerId);
      lines.push(`*** GANADOR: ${winner ? winner.name : s.winnerId} ***`);
    }
    lines.push('');
    lines.push('Jugadores:');
    (s.players || []).forEach((p) => {
      const turn = p.id === s.currentPlayerId ? '  <== turno' : '';
      const me = p.id === this.client.playerId ? ' (tu)' : '';
      lines.push(`  - ${p.name}${me} | cartas: ${p.handSize} | uno: ${p.unoAnnounced ? 'si' : 'no'}${turn}`);
    });
    lines.push('');
    lines.push('Tu mano:');
    if (this.client.hand && this.client.hand.length > 0) {
      this.client.hand.forEach((c, i) => lines.push('  ' + cardLabel(c, i + 1)));
    } else {
      lines.push('  (sin cartas todavia)');
    }
    lines.push('');

    if (this.message) {
      const prefix = this.message.type === 'ERROR' ? '[ERROR] ' : '[OK] ';
      lines.push(prefix + this.message.text);
      lines.push('');
    }

    if (this.awaitingColor) {
      lines.push('Elige color: r=rojo  b=azul  g=verde  y=amarillo');
      lines.push('  (o escribe "cancel" para anular la jugada)');
    } else if (s.status === 'FINISHED') {
      lines.push('Partida terminada. Espera a que el host empiece otra.');
      lines.push('Otros: p=jugadores  s=salir');
    } else {
      lines.push('Escribe el NUMERO de una carta para jugarla.');
      lines.push('Otros: d=robar  u=uno  p=jugadores  s=salir');
    }
    return lines;
  }

  render() {
    const lines = this.buildBoard();
    const text = lines.join('\n');
    if (text === this.lastRender) return;
    this.lastRender = text;

    const buf = this.rl.line || '';
    process.stdout.write('\x1b[2J\x1b[H');
    process.stdout.write(text + '\n');
    process.stdout.write('> ' + buf);
  }

  async handleInput(raw) {
    if (!raw) {
      this.render();
      return;
    }

    if (this.awaitingColor) {
      const map = { r: 'RED', b: 'BLUE', g: 'GREEN', y: 'YELLOW', rojo: 'RED', azul: 'BLUE', verde: 'GREEN', amarillo: 'YELLOW' };
      const cmd = raw.toLowerCase();
      if (cmd === 'cancel' || cmd === 'c' || cmd === 'x') {
        this.awaitingColor = null;
        this.setMessage('OK', 'Jugada anulada');
        this.render();
        return;
      }
      const color = map[cmd];
      if (!color) {
        this.setMessage('ERROR', 'Color invalido. Usa r, b, g o y');
        this.render();
        return;
      }
      const cardId = this.awaitingColor;
      this.awaitingColor = null;
      await this.client.playCard(cardId, color);
      this.render();
      return;
    }

    const cmd = raw.toLowerCase();

    if (cmd === 's' || cmd === 'salir' || cmd === 'q' || cmd === 'quit' || cmd === 'exit') {
      this.rl.close();
      return;
    }
    if (cmd === 'p' || cmd === 'jugadores' || cmd === 'players' || cmd === 'estado' || cmd === 'state') {
      this.lastRender = '';
      this.render();
      return;
    }
    if (cmd === 'd' || cmd === 'robar' || cmd === 'draw') {
      await this.client.drawCard();
      this.render();
      return;
    }
    if (cmd === 'u' || cmd === 'uno') {
      await this.client.announceUno();
      this.render();
      return;
    }
    if (cmd === 'r' || cmd === 'ayuda' || cmd === 'help') {
      this.lastRender = '';
      this.render();
      return;
    }

    const n = parseInt(raw, 10);
    if (!isNaN(n) && n > 0) {
      const hand = this.client.hand || [];
      const card = hand[n - 1];
      if (!card) {
        this.setMessage('ERROR', `No tienes la carta numero ${n}`);
        this.render();
        return;
      }
      if (isWild(card)) {
        this.awaitingColor = card.id;
        this.lastRender = '';
        this.render();
        return;
      }
      await this.client.playCard(card.id, null);
      this.render();
      return;
    }

    this.setMessage('ERROR', `Comando no reconocido: ${raw}`);
    this.render();
  }
}
