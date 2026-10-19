import { EventEmitter } from 'events';
import { RabbitMQConnection } from '../messaging/RabbitMQConnection.js';
import { QueueManager } from '../messaging/QueueManager.js';
import { MessageProtocol, MSG_TYPES } from '../messaging/MessageProtocol.js';
import { generateId } from '../utils/validators.js';
import { buildRabbitUrl } from '../config/configuration.js';

export class GameClient extends EventEmitter {
  constructor(config = {}) {
    super();
    this.gameId = config.gameId || process.env.GAME_ID;
    this.hostRabbitHost = config.hostRabbitHost || process.env.RABBITMQ_HOST;
    this.playerId = config.playerId || generateId('p');
    this.playerName = config.playerName || 'Player';
    this.rabbit = new RabbitMQConnection({ url: buildRabbitUrl({ host: this.hostRabbitHost }) });
    this.qm = null;
    this.commandQueue = `uno.cmd.${this.gameId}`;
    this.eventExchange = `uno.events.${this.gameId}`;
    this.replyQueue = `uno.player.${this.playerId}`;
    this.state = null;
    this.hand = [];
    this.lastMessage = null;
    this.connected = false;
    this._pingTimer = null;
  }

  async connect() {
    await this.rabbit.connect();
    this.qm = new QueueManager(this.rabbit.getChannel());
    await this.qm.assertExchange(this.eventExchange, 'fanout', { durable: false });
    await this.qm.assertQueue(this.replyQueue, { exclusive: true });
    await this.qm.assertQueue(this.commandQueue, { durable: false });
    const evtQ = await this.qm.assertQueue('', { exclusive: true });
    await this.qm.bindQueue(evtQ, this.eventExchange, '');
    await this._listen(evtQ);
    this.connected = true;
    await this.sendJoin();
    this._pingTimer = setInterval(() => this.ping(), 3000);
    this._pingTimer.unref?.();
  }

  ping() {
    if (!this.connected) return;
    this._send(MSG_TYPES.PING, {}).catch(() => {});
  }

  async leave() {
    if (!this.connected) return;
    try {
      await this._send(MSG_TYPES.LEAVE_GAME, {});
    } catch (e) {}
  }

  // Cierra la conexion. announce=true avisa al servidor que sales; con false
  // el servidor te marca ausente por falta de latido (permite recargar sin perder el asiento).
  async stop(announce = true) {
    if (this._pingTimer) clearInterval(this._pingTimer);
    if (announce) await this.leave();
    this.connected = false;
    await this.rabbit.disconnect();
  }

  _handleIncoming(msg) {
    if (!msg) return;
    let updated = false;

    if (msg.type === MSG_TYPES.GAME_STATE) {
      const s = msg.payload && msg.payload.state;
      if (s) {
        this.state = s;
        updated = true;
      }
    }

    if (msg.type === MSG_TYPES.PLAYER_HAND) {
      if (msg.payload && msg.payload.hand) this.hand = msg.payload.hand;
      if (msg.payload && msg.payload.gameState) this.state = msg.payload.gameState;
      updated = true;
    }

    if (msg.type === MSG_TYPES.ACTION_RESULT) {
      const p = msg.payload || {};
      if (p.gameState) {
        this.state = p.gameState;
        updated = true;
      }
      if (p.hand) {
        this.hand = p.hand;
        updated = true;
      }
      if (p.error) {
        this.lastMessage = { type: 'ERROR', text: p.error };
      } else {
        this.lastMessage = { type: 'OK', text: p.success ? 'Accion realizada' : 'Listo' };
      }
      updated = true;
    }

    if (msg.type === MSG_TYPES.ERROR) {
      this.lastMessage = { type: 'ERROR', text: (msg.payload && msg.payload.error) || 'Error desconocido' };
      updated = true;
    }

    if (updated) {
      this.emit('update');
    }
  }

  async _listen(evtQ) {
    await this.qm.consume(this.replyQueue, (msg) => this._handleIncoming(msg), { noAck: true });
    if (evtQ) {
      await this.qm.consume(evtQ, (msg) => this._handleIncoming(msg), { noAck: true });
    }
  }

  _send(type, payload = {}) {
    const m = MessageProtocol.create(type, this.gameId, this.playerId, payload);
    return this.qm.publish('', this.commandQueue, m);
  }

  async sendJoin() {
    return this._send(MSG_TYPES.JOIN_GAME, { playerName: this.playerName });
  }

  async playCard(cardId, chosenColor = null) {
    return this._send(MSG_TYPES.PLAY_CARD, { cardId, chosenColor });
  }

  async drawCard() {
    return this._send(MSG_TYPES.DRAW_CARD, {});
  }

  async announceUno() {
    return this._send(MSG_TYPES.ANNOUNCE_UNO, {});
  }

  async requestHand() {
    return this._send(MSG_TYPES.GET_HAND, {});
  }

  getState() {
    return this.state;
  }
}
