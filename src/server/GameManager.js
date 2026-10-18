import { MessageProtocol, MSG_TYPES } from '../messaging/MessageProtocol.js';
import { Player } from '../game/Player.js';
import { generateId } from '../utils/validators.js';

export class GameManager {
  constructor(game) {
    this.game = game;
  }

  handleMessage(msg) {
    if (!MessageProtocol.validate(msg)) {
      return MessageProtocol.create(MSG_TYPES.ERROR, msg.gameId, msg.playerId, { error: 'INVALID_MESSAGE' });
    }
    switch (msg.type) {
      case MSG_TYPES.JOIN_GAME:
        return this._handleJoin(msg);
      case MSG_TYPES.LEAVE_GAME:
        return this._handleLeave(msg);
      case MSG_TYPES.PLAY_CARD:
        return this._handlePlay(msg);
      case MSG_TYPES.DRAW_CARD:
        return this._handleDraw(msg);
      case MSG_TYPES.ANNOUNCE_UNO:
        return this._handleUno(msg);
      case MSG_TYPES.PING:
        return MessageProtocol.create(MSG_TYPES.PONG, msg.gameId, msg.playerId, {});
      default:
        return MessageProtocol.create(MSG_TYPES.ERROR, msg.gameId, msg.playerId, { error: 'UNKNOWN_TYPE' });
    }
  }

  _handleJoin(msg) {
    try {
      const { playerName } = msg.payload || {};
      const playerId = msg.playerId || generateId('p');
      let joined = false;
      if (!this.game.players.has(playerId)) {
        const player = new Player(playerId, playerName || playerId);
        this.game.addPlayer(player);
        joined = true;
      }
      // auto-start when >=2 players and waiting
      if (this.game.status === 'WAITING' && this.game.players.size >= 2) {
        try {
          this.game.start();
        } catch (e) {}
      }
      return MessageProtocol.create(MSG_TYPES.ACTION_RESULT, this.game.gameId, playerId, {
        success: true,
        playerId,
        joined,
        gameState: this.game.getStatePublic(),
      });
    } catch (e) {
      return MessageProtocol.create(MSG_TYPES.ERROR, this.game.gameId, msg.playerId, { error: e.message });
    }
  }

  _handleLeave(msg) {
    return MessageProtocol.create(MSG_TYPES.ACTION_RESULT, this.game.gameId, msg.playerId, { success: true });
  }

  _handlePlay(msg) {
    try {
      const { cardId, chosenColor } = msg.payload || {};
      const res = this.game.playCard(msg.playerId, cardId, chosenColor);
      return MessageProtocol.create(MSG_TYPES.ACTION_RESULT, this.game.gameId, msg.playerId, {
        success: res.success,
        gameState: this.game.getStatePublic(),
      });
    } catch (e) {
      return MessageProtocol.create(MSG_TYPES.ERROR, this.game.gameId, msg.playerId, { error: e.message });
    }
  }

  _handleDraw(msg) {
    try {
      const res = this.game.drawCard(msg.playerId);
      return MessageProtocol.create(MSG_TYPES.ACTION_RESULT, this.game.gameId, msg.playerId, {
        success: res.success,
        drawn: res.drawn,
        gameState: this.game.getStatePublic(),
      });
    } catch (e) {
      return MessageProtocol.create(MSG_TYPES.ERROR, this.game.gameId, msg.playerId, { error: e.message });
    }
  }

  _handleUno(msg) {
    try {
      const res = this.game.announceUno(msg.playerId);
      return MessageProtocol.create(MSG_TYPES.ACTION_RESULT, this.game.gameId, msg.playerId, {
        success: res.success,
        reason: res.reason,
        gameState: this.game.getStatePublic(),
      });
    } catch (e) {
      return MessageProtocol.create(MSG_TYPES.ERROR, this.game.gameId, msg.playerId, { error: e.message });
    }
  }
}
