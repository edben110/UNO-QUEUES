import { GameServer } from './GameServer.js';
import { generateId } from '../utils/validators.js';
import { getLocalIp, buildRabbitUrl } from '../config/configuration.js';
import { MessageProtocol, MSG_TYPES } from '../messaging/MessageProtocol.js';
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
  if (card.type === 'DRAW2') return `${index}) ${color} ROBA2`;
  if (card.type === 'WILD') return `${index}) COMODIN`;
  if (card.type === 'WILD_DRAW4') return `${index}) COMODIN ROBA4`;
  return `${index}) ${card.type}`;
}

function isWild(card) {
  return card.type === 'WILD' || card.type === 'WILD_DRAW4';
}

class HostInterface {
  constructor(rl, server, ip) {
    this.rl = rl;
    this.server = server;
    this.ip = ip;
    this.awaitingColor = null;
    this.message = null;
    this.lastRender = '';
    this.started = false;

    server.onUpdate = () => this.render();

    rl.on('line', (line) => this.handleInput(line.trim()));
    rl.on('close', () => {
      console.log('\nCerrando host...');
      process.exit(0);
    });
  }

  setMessage(type, text) {
    this.message = { type, text };
  }

  get hand() {
    return this.server.game.getPlayerHand(this.server.hostId);
  }

  buildBoard() {
    const s = this.server.game.getStatePublic();
    const lines = [];
    lines.push('================== UNO.js HOST ==================');
    lines.push(`Game ID: ${s.gameId} | IP: ${this.ip}:${process.env.RABBITMQ_PORT || 5672}`);
    lines.push(`Estado: ${s.status} | Sentido: ${s.direction === 1 ? 'normal' : 'inverso'} | Jugadores: ${(s.players || []).length}`);

    const top = s.topCard;
    const topLabel = top
      ? `${COLOR_LABELS[top.color] || top.color} ${top.type === 'NUMBER' ? top.value : top.type}`
      : '-';
    const turnPlayer = (s.players || []).find((p) => p.id === s.currentPlayerId);
    const myTurn = turnPlayer && turnPlayer.id === this.server.hostId;

    lines.push(`Carta activa: ${topLabel} | Color: ${COLOR_LABELS[s.currentColor] || s.currentColor}`);
    lines.push(`Turno: ${turnPlayer ? turnPlayer.name : '-'}${myTurn ? '  <== TU TURNO' : ''}`);
    if (s.pendingDraw) {
      const t = s.pendingDraw.topType === 'WILD_DRAW4' ? '+4' : '+2';
      lines.push(`ROBO PENDIENTE: +${s.pendingDraw.amount} (ultimo: ${t}). Apila con +4 o roba [d]`);
    }
    lines.push('');
    lines.push('Jugadores:');
    if ((s.players || []).length === 0) {
      lines.push('  (nadie conectado aun)');
    }
    (s.players || []).forEach((p) => {
      const turn = p.id === s.currentPlayerId ? '  <== turno' : '';
      const me = p.id === this.server.hostId ? ' (tu)' : '';
      lines.push(`  - ${p.name}${me} | cartas: ${p.handSize} | uno: ${p.unoAnnounced ? 'si' : 'no'}${turn}`);
    });
    lines.push('');

    if (s.status === 'WAITING') {
      lines.push('Esperando jugadores. Minimo 2 para iniciar.');
    } else if (s.status === 'FINISHED') {
      const winner = (s.players || []).find((p) => p.id === s.winnerId);
      lines.push(`*** GANADOR: ${winner ? winner.name : s.winnerId} ***`);
      lines.push('La partida termino. Pulsa [i] para empezar otra partida.');
    } else {
      lines.push('Tu mano:');
      const h = this.hand;
      if (h && h.length > 0) {
        h.forEach((c, i) => lines.push('  ' + cardLabel(c, i + 1)));
      } else {
        lines.push('  (sin cartas)');
      }
      lines.push('');
    }

    if (this.message) {
      const prefix = this.message.type === 'ERROR' ? '[ERROR] ' : '[OK] ';
      lines.push(prefix + this.message.text);
      lines.push('');
    }

    if (this.awaitingColor) {
      lines.push('Elige color: r=rojo  b=azul  g=verde  y=amarillo');
      lines.push('  (o "cancel" para anular)');
    } else if (s.status === 'FINISHED') {
      lines.push('Comandos: i=otra partida  p=jugadores  s=salir');
    } else {
      if (s.status === 'WAITING') {
        lines.push('Comandos: i=iniciar partida  p=ver jugadores  s=salir');
      } else {
        lines.push('Escribe el NUMERO de una carta para jugarla.');
        lines.push('Otros: i=iniciar  d=robar  u=uno  p=jugadores  s=salir');
      }
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

  async broadcast() {
    await this.server.broadcastState();
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
      this._playCard(cardId, color);
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
    if (cmd === 'i' || cmd === 'iniciar' || cmd === 'start') {
      await this._start();
      return;
    }
    if (cmd === 'd' || cmd === 'robar' || cmd === 'draw') {
      this._draw();
      return;
    }
    if (cmd === 'u' || cmd === 'uno') {
      try {
        this.server.game.announceUno(this.server.hostId);
        this.setMessage('OK', 'UNO anunciado');
      } catch (e) {
        this.setMessage('ERROR', e.message);
      }
      this.render();
      return;
    }

    const n = parseInt(raw, 10);
    if (!isNaN(n) && n > 0) {
      const h = this.hand || [];
      const card = h[n - 1];
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
      this._playCard(card.id, null);
      return;
    }

    this.setMessage('ERROR', `Comando no reconocido: ${raw}`);
    this.render();
  }

  async _start() {
    try {
      const g = this.server.game;
      if (g.status === 'STARTED') {
        this.setMessage('ERROR', 'La partida ya esta en curso');
        this.render();
        return;
      }
      if (g.status === 'FINISHED') {
        g.resetForNewRound();
      }
      if (g.players.size < 2) {
        this.setMessage('ERROR', 'Se necesitan al menos 2 jugadores');
        this.render();
        return;
      }
      const r = await this.server.startRound();
      if (!r.success) {
        this.setMessage('ERROR', r.error);
        this.render();
        return;
      }
      this.setMessage('OK', 'Partida iniciada');
    } catch (e) {
      this.setMessage('ERROR', e.message);
      this.render();
    }
  }

  _playCard(cardId, color) {
    try {
      this.server.game.playCard(this.server.hostId, cardId, color);
      this.setMessage('OK', 'Carta jugada');
    } catch (e) {
      this.setMessage('ERROR', e.message);
    }
    this.broadcast();
  }

  _draw() {
    try {
      const res = this.server.game.drawCard(this.server.hostId);
      this.setMessage('OK', `Robaste ${res.drawn} carta(s)`);
    } catch (e) {
      this.setMessage('ERROR', e.message);
    }
    this.broadcast();
  }
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const gameId = process.env.GAME_ID || generateId('game');
  const hostId = generateId('host');
  let hostName = process.env.HOST_NAME || '';
  let server = null;
  let ready = false;
  const pending = [];

  const initializeServer = async () => {
    server = new GameServer({
      gameId,
      hostId,
      hostName: hostName || 'Host',
      hostIsLocal: true,
      rabbit: { url: buildRabbitUrl() },
    });
    try {
      await server.start();
    } catch (e) {
      console.error('Error conectando a RabbitMQ:', e.message);
      process.exit(1);
    }
    const ip = getLocalIp();
    const ui = new HostInterface(rl, server, ip);
    ready = true;
    ui.render();
    for (const p of pending) {
      await ui.handleInput(p);
    }
    pending.length = 0;
  };

  rl.on('line', (line) => {
    if (!hostName && !server) {
      hostName = line.trim() || 'Host';
      initializeServer();
      return;
    }
    if (!ready) {
      pending.push(line);
      return;
    }
    // handled by HostInterface's own line listener
  });

  if (hostName) {
    await initializeServer();
  } else {
    console.log('Nombre del host: ');
  }
}

main().catch((err) => {
  console.error('Host error:', err);
  process.exit(1);
});
