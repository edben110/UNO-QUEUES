import readline from 'readline';
import { RabbitMQConnection } from '../messaging/RabbitMQConnection.js';
import { QueueManager } from '../messaging/QueueManager.js';
import { MessageProtocol, MSG_TYPES } from '../messaging/MessageProtocol.js';
import { generateId } from '../utils/validators.js';
import { getLocalIp, buildRabbitUrl } from '../config/configuration.js';

export class GameClient {
  constructor(config = {}) {
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
  }

  async connect() {
    await this.rabbit.connect();
    this.qm = new QueueManager(this.rabbit.getChannel());
    await this.qm.assertExchange(this.eventExchange, 'fanout', { durable: false });
    await this.qm.assertQueue(this.replyQueue, { exclusive: true });
    await this.qm.assertQueue(this.commandQueue, { durable: false });
    const evtQ = await this.qm.assertQueue('', { exclusive: true });
    await this.qm.bindQueue(evtQ, this.eventExchange, '');
    this._listen(evtQ);
    this.sendJoin();
  }

  _listen() {
    this.qm.consume(this.replyQueue, (msg) => {
      if (msg && (msg.type === MSG_TYPES.GAME_STATE || (msg.payload && msg.payload.state))) {
        this.state = msg.payload.state || msg.state;
      }
      if (msg && msg.type === MSG_TYPES.ACTION_RESULT) {
        if (msg.payload && msg.payload.error) {
          console.log('[ERROR]', msg.payload.error);
        } else {
          console.log('[OK]', msg.payload && msg.payload.success ? 'success' : 'done');
        }
        if (msg.payload && msg.payload.gameState) {
          this.state = msg.payload.gameState;
        }
      }
      if (msg && msg.type === MSG_TYPES.ERROR) {
        console.log('[ERROR]', (msg.payload && msg.payload.error) || 'unknown');
      }
    }, { noAck: true });
    // listen to fanout events
    this.qm.consume('', async (msg) => {
      if (msg && (msg.type === MSG_TYPES.GAME_STATE || (msg.payload && msg.payload.state))) {
        this.state = msg.payload.state || msg.state;
      }
    }, { noAck: true });
    // bind event queue? simpler: create temp queue and bind to event exchange
  }

  async sendJoin() {
    const join = MessageProtocol.create(MSG_TYPES.JOIN_GAME, this.gameId, this.playerId, { playerName: this.playerName });
    await this.qm.publish('', this.commandQueue, join);
  }

  async playCard(cardId, chosenColor = null) {
    const play = MessageProtocol.create(MSG_TYPES.PLAY_CARD, this.gameId, this.playerId, { cardId, chosenColor });
    await this.qm.publish('', this.commandQueue, play);
  }

  async drawCard() {
    const draw = MessageProtocol.create(MSG_TYPES.DRAW_CARD, this.gameId, this.playerId, {});
    await this.qm.publish('', this.commandQueue, draw);
  }

  async announceUno() {
    const uno = MessageProtocol.create(MSG_TYPES.ANNOUNCE_UNO, this.gameId, this.playerId, {});
    await this.qm.publish('', this.commandQueue, uno);
  }

  getState() {
    return this.state;
  }
}
