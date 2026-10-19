import { RabbitMQConnection } from '../messaging/RabbitMQConnection.js';
import { QueueManager } from '../messaging/QueueManager.js';
import { MessageProtocol, MSG_TYPES } from '../messaging/MessageProtocol.js';
import { Game } from '../game/Game.js';
import { Player } from '../game/Player.js';
import { generateId } from '../utils/validators.js';
import { GameManager } from './GameManager.js';

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
    this.onUpdate = null;
    this.turnTimeoutMs = Number(config.turnTimeoutMs ?? process.env.TURN_TIMEOUT_MS ?? 10000);
    this.playerTimeoutMs = Number(config.playerTimeoutMs ?? process.env.PLAYER_TIMEOUT_MS ?? 12000);
    this.maxConsecutiveTimeouts = config.maxConsecutiveTimeouts ?? 3;
    this.hostIsLocal = !!config.hostIsLocal; // host sin cliente de red (CLI): no se vigila su latido
    this._turnTimer = null;
    this._timedSeq = -1;
    this._sweeper = null;
    this._sentHands = new Map();
    this.game.turnTimeoutMs = this.turnTimeoutMs > 0 ? this.turnTimeoutMs : null;
    this.game.onBeforeState = () => this._syncTurnTimer();
  }

  _notifyUpdate() {
    if (typeof this.onUpdate === 'function') {
      try {
        this.onUpdate();
      } catch (e) {}
    }
  }

  async start() {
    await this.rabbit.connect();
    this.qm = new QueueManager(this.rabbit.getChannel());
    await this.qm.assertQueue(this.commandQueue, { durable: false });
    await this.qm.assertExchange(this.eventExchange, 'fanout', { durable: false });
    await this.qm.assertQueue(this.replyQueue, { exclusive: true });
    this._startConsuming();
    this._sweeper = setInterval(() => this._sweepPlayers(), 2000);
    this._sweeper.unref?.();
    console.log(`[HOST] Game ${this.gameId} started. Command queue: ${this.commandQueue}`);
  }

  _startConsuming() {
    this.qm.consume(this.commandQueue, async (msg) => {
      try {
        const resp = this.gameManager.handleMessage(msg);
        if (resp && msg && msg.playerId) {
          await this.qm.publish('', `uno.player.${msg.playerId}`, resp);
        }
      } catch (e) {
        console.error('[HOST] Error procesando mensaje:', e.message);
      }
      await this.broadcastState();
    }, { noAck: true });
  }

  // Inicia (o reinicia tras terminar) la partida. Devuelve { success, error }.
  async startRound() {
    const g = this.game;
    if (g.status === 'STARTED') return { success: false, error: 'La partida ya esta en curso' };
    if (g.status === 'FINISHED') g.resetForNewRound();
    if (g.activePlayers().length < 2) return { success: false, error: 'Se necesitan al menos 2 jugadores' };
    g.start();
    await this.broadcastState();
    return { success: true };
  }

  // Latido: quien no da señales de vida se marca ausente y la partida sigue sin el.
  _sweepPlayers() {
    const now = Date.now();
    let changed = false;
    for (const p of this.game.players.values()) {
      if (!p.active) continue;
      if (this.hostIsLocal && p.id === this.hostId) continue;
      if (now - p.lastActionTimestamp > this.playerTimeoutMs) {
        if (this.game.status === 'WAITING' && p.id !== this.hostId) {
          this.game.removePlayer(p.id);
        } else {
          this.game.setPlayerActive(p.id, false);
        }
        changed = true;
      }
    }
    if (changed) this.broadcastState().catch(() => {});
  }

  // Arma/cancela el temporizador segun el turno actual.
  _syncTurnTimer() {
    const g = this.game;
    if (g.status !== 'STARTED' || !(this.turnTimeoutMs > 0)) {
      this._clearTurnTimer();
      g.turnDeadline = null;
      return;
    }
    if (g.turnSeq === this._timedSeq && this._turnTimer) return;
    this._clearTurnTimer();
    this._timedSeq = g.turnSeq;
    g.turnDeadline = Date.now() + this.turnTimeoutMs;
    const seq = g.turnSeq;
    this._turnTimer = setTimeout(() => this._onTurnTimeout(seq), this.turnTimeoutMs);
    this._turnTimer.unref?.();
  }

  _clearTurnTimer() {
    if (this._turnTimer) clearTimeout(this._turnTimer);
    this._turnTimer = null;
    this._timedSeq = -1;
  }

  async _onTurnTimeout(seq) {
    this._turnTimer = null;
    const g = this.game;
    if (g.status !== 'STARTED' || g.turnSeq !== seq) return; // el turno ya cambio
    const cur = g.turnManager.getCurrentPlayer();
    if (!cur) return;
    try {
      const previous = cur.timeouts || 0;
      g.drawCard(cur.id); // robar (o cobrar el robo pendiente) y pasar turno; reinicia el contador
      cur.timeouts = previous + 1;
      if (cur.timeouts >= this.maxConsecutiveTimeouts) {
        g.setPlayerActive(cur.id, false);
      }
    } catch (e) {
      console.error('[HOST] Error en timeout de turno:', e.message);
    }
    await this.broadcastState();
  }

  // Envia la mano privada a quien le cambio sin que lo pidiera (robo por timeout, reparto).
  async _pushChangedHands() {
    for (const p of this.game.players.values()) {
      const key = p.hand.map((c) => c.id).join(',');
      if (this._sentHands.get(p.id) === key) continue;
      this._sentHands.set(p.id, key);
      if (p.id === this.hostId && this.hostIsLocal) continue;
      const m = MessageProtocol.create(MSG_TYPES.PLAYER_HAND, this.game.gameId, p.id, {
        hand: this.game.getPlayerHand(p.id),
      });
      await this.qm.publish('', `uno.player.${p.id}`, m);
    }
  }

  async broadcastState() {
    try {
      this._syncTurnTimer();
      if (this.qm) {
        await this._pushChangedHands();
        const state = this.game.getStatePublic();
        const notification = MessageProtocol.create(MSG_TYPES.GAME_STATE, this.game.gameId, null, { state });
        await this.qm.publish(this.eventExchange, '', notification);
      }
    } catch (e) {
      console.error('[HOST] Error difundiendo estado:', e.message);
    }
    this._notifyUpdate();
  }

  async stop() {
    this._clearTurnTimer();
    if (this._sweeper) clearInterval(this._sweeper);
    await this.rabbit.disconnect();
  }

  getGameId() {
    return this.game.gameId;
  }
}
