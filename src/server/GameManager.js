import { MessageProtocol, MSG_TYPES } from '../messaging/MessageProtocol.js';
import { Player } from '../game/Player.js';
import { generateId } from '../utils/validators.js';

export class GameManager {
  constructor(game) {
    this.game = game;
  }

  handleMessage(msg) {
    if (!MessageProtocol.validate(msg)) {
      return MessageProtocol.create(MSG_TYPES.ERROR, msg?.gameId, msg?.playerId, { error: 'INVALID_MESSAGE' });
    }
    // cualquier mensaje es señal de vida
    const sender = msg.playerId ? this.game.players.get(msg.playerId) : null;
    if (sender) sender.lastActionTimestamp = Date.now();
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
      case MSG_TYPES.GET_HAND:
        return this._handleGetHand(msg);
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
      const existing = this.game.players.get(playerId);
      if (existing) {
        // reconexion: recupera el asiento
        existing.lastActionTimestamp = Date.now();
        if (!existing.active) this.game.setPlayerActive(playerId, true);
      } else {
        if (this.game.status !== 'WAITING') {
          return MessageProtocol.create(MSG_TYPES.ACTION_RESULT, this.game.gameId, playerId, {
            success: false,
            error: 'La partida ya esta en curso',
          });
        }
        const player = new Player(playerId, playerName || playerId);
        this.game.addPlayer(player);
        joined = true;
      }
      return MessageProtocol.create(MSG_TYPES.ACTION_RESULT, this.game.gameId, playerId, {
        success: true,
        playerId,
        joined,
        hand: this.game.getPlayerHand(playerId),
        gameState: this.game.getStatePublic(),
      });
    } catch (e) {
      return MessageProtocol.create(MSG_TYPES.ERROR, this.game.gameId, msg.playerId, { error: e.message });
    }
  }

  _handleLeave(msg) {
    const player = this.game.players.get(msg.playerId);
    if (player) {
      if (this.game.status === 'WAITING' && msg.playerId !== this.game.hostId) {
        this.game.removePlayer(msg.playerId);
      } else {
        this.game.setPlayerActive(msg.playerId, false);
      }
    }
    return MessageProtocol.create(MSG_TYPES.ACTION_RESULT, this.game.gameId, msg.playerId, { success: true });
  }

  _handlePlay(msg) {
    try {
      const { cardId, chosenColor } = msg.payload || {};
      const res = this.game.playCard(msg.playerId, cardId, chosenColor);
      return MessageProtocol.create(MSG_TYPES.ACTION_RESULT, this.game.gameId, msg.playerId, {
        success: res.success,
        hand: this.game.getPlayerHand(msg.playerId),
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
        hand: this.game.getPlayerHand(msg.playerId),
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
        hand: this.game.getPlayerHand(msg.playerId),
        gameState: this.game.getStatePublic(),
      });
    } catch (e) {
      return MessageProtocol.create(MSG_TYPES.ERROR, this.game.gameId, msg.playerId, { error: e.message });
    }
  }

  _handleGetHand(msg) {
    const playerId = msg.playerId;
    if (!this.game.players.has(playerId)) {
      return MessageProtocol.create(MSG_TYPES.ERROR, this.game.gameId, playerId, { error: 'PLAYER_NOT_FOUND' });
    }
    return MessageProtocol.create(MSG_TYPES.PLAYER_HAND, this.game.gameId, playerId, {
      hand: this.game.getPlayerHand(playerId),
      gameState: this.game.getStatePublic(),
    });
  }
}
