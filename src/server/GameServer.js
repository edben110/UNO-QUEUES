import { RabbitMQConnection } from '../messaging/RabbitMQConnection.js';
import { QueueManager } from '../messaging/QueueManager.js';
import { MessageProtocol, MSG_TYPES } from '../messaging/MessageProtocol.js';
import { Game } from '../game/Game.js';
import { Player } from '../game/Player.js';
import { generateId } from '../utils/validators.js';
import GameManager from './GameManager.js';

export class GameServer {
  constructor(config = {}) {
    this.gameId = config.gameId || generateId('game');
    this.hostId = config.hostId || generateId('host');
    this.hostPlayer = new Player(this.hostId, config.hostName || 'Host');
    this.game = new Game(this.gameId, this.hostPlayer);
    this.gameManager = new GameManager(this.game);
    this.rabbit = new RabbitMQConnection(config.rabbit);
    this.qm = null;
    this.commandQueue = `uno.cmd.${this.gameId}`;
    this.eventExchange = `uno.events.${this.gameId}`;
    this.replyQueue = `uno.reply.${this.hostId}`;
  }

  async start() {
    await this.rabbit.connect();
    this.qm = new QueueManager(this.rabbit.getChannel());
    await this.qm.assertQueue(this.commandQueue, { durable: false });
    await this.qm.assertExchange(this.eventExchange, 'fanout', { durable: false });
    await this.qm.assertQueue(this.replyQueue, { exclusive: true });
    this._startConsuming();
    console.log(`[HOST] Game ${this.gameId} started. Command queue: ${this.commandQueue}`);
  }

  _startConsuming() {
    this.qm.consume(this.commandQueue, async (msg, raw) => {
      const resp = this.gameManager.handleMessage(msg);
      if (resp && msg.playerId) {
        await this.qm.publish('', `uno.player.${msg.playerId}`, resp);
      }
    }, { noAck: true });
  }

  broadcastState() {
    const state = this.game.getStatePublic();
    const notification = MessageProtocol.create(MSG_TYPES.GAME_STATE, this.game.gameId, null, { state });
    return this.qm.publish(this.eventExchange, '', notification);
  }

  getGameId() {
    return this.game.gameId;
  }
}
