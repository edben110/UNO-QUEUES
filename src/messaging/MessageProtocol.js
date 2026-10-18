import { generateId } from '../utils/validators.js';

const PROTOCOL_VERSION = process.env.AMQP_PROTOCOL_VERSION || '1.0.0';

export class MessageProtocol {
  static create(type, gameId, playerId, payload = {}, requestId = null) {
    return {
      type,
      gameId,
      playerId: playerId || null,
      requestId: requestId || generateId('req'),
      payload,
      timestamp: Date.now(),
      version: PROTOCOL_VERSION,
    };
  }

  static validate(msg) {
    if (!msg || typeof msg !== 'object') return false;
    if (!msg.type) return false;
    return true;
  }
}

export const MSG_TYPES = {
  JOIN_GAME: 'JOIN_GAME',
  LEAVE_GAME: 'LEAVE_GAME',
  GAME_STATE: 'GAME_STATE',
  PLAYER_HAND: 'PLAYER_HAND',
  PLAY_CARD: 'PLAY_CARD',
  DRAW_CARD: 'DRAW_CARD',
  CHOOSE_COLOR: 'CHOOSE_COLOR',
  ANNOUNCE_UNO: 'ANNOUNCE_UNO',
  ACTION_RESULT: 'ACTION_RESULT',
  NOTIFICATION: 'NOTIFICATION',
  ERROR: 'ERROR',
  PING: 'PING',
  PONG: 'PONG',
  DISCONNECT: 'DISCONNECT',
};
