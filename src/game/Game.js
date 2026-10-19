import { Deck } from './Deck.js';
import { Player } from './Player.js';
import { TurnManager } from './TurnManager.js';
import { RulesEngine } from './RulesEngine.js';

export class Game {
  constructor(gameId, hostPlayer) {
    this.gameId = gameId;
    this.hostId = hostPlayer.id;
    this.players = new Map();
    this.deck = new Deck();
    this.discardPile = [];
    this.turnManager = new TurnManager([]);
    this.rules = new RulesEngine();
    this.currentColor = null;
    this.status = 'WAITING'; // WAITING, STARTED, FINISHED
    this.winnerId = null;
    this.pendingDraw = null; // { amount, topType: 'DRAW2' | 'WILD_DRAW4' }
    this.pendingWildColor = false;
    this._requestIdMap = new Map();
    this.turnSeq = 0; // se incrementa en cada cambio de turno (lo usa el temporizador)
    this.turnDeadline = null; // timestamp ms limite del turno actual (lo fija el servidor)
    this.turnTimeoutMs = null;
    this.endReason = null;
    this.onBeforeState = null; // gancho del servidor para sincronizar el temporizador
    this.addPlayer(hostPlayer);
    this._initialTopCardSetup();
  }

  _initialTopCardSetup() {
    // draw until we get a non-wild top card to start? simple approach
    let top = this.deck.draw(1)[0];
    while (top && top.type === 'WILD_DRAW4') {
      this.deck.addToTop(top);
      this.deck.shuffle();
      top = this.deck.draw(1)[0];
    }
    this.discardPile.push(top);
    this.currentColor = top.color;
  }

  addPlayer(player) {
    if (this.status !== 'WAITING') throw new Error('Game already started');
    this.players.set(player.id, player);
    this.turnManager.setPlayers(Array.from(this.players.values()));
  }

  start() {
    if (this.status !== 'WAITING' || this.players.size < 2) {
      // allow starting with 1? spec says multiplayer; but implement flexibly
    }
    // deal 7 cards each
    for (const p of this.players.values()) {
      p.addCards(this.deck.draw(7));
    }
    this.status = 'STARTED';
    this.endReason = null;
    this.turnSeq++;
    this.turnManager.setPlayers(Array.from(this.players.values()));
    const cur = this.turnManager.getCurrentPlayer();
    if (cur && !cur.active) this.turnManager.advanceToNext();
  }

  getStatePublic() {
    if (typeof this.onBeforeState === 'function') this.onBeforeState();
    return {
      gameId: this.gameId,
      status: this.status,
      players: Array.from(this.players.values()).map((p) => p.toJSON()),
      topCard: this.discardPile.length > 0 ? this.discardPile[this.discardPile.length - 1].toJSON() : null,
      currentColor: this.currentColor,
      currentPlayerId: this.turnManager.getCurrentPlayer()?.id || null,
      direction: this.turnManager.direction,
      pendingDraw: this.pendingDraw,
      winnerId: this.winnerId,
      turnDeadline: this.turnDeadline,
      turnTimeoutMs: this.turnTimeoutMs,
      serverTime: Date.now(),
      endReason: this.endReason,
    };
  }

  getPlayerHand(playerId) {
    const p = this.players.get(playerId);
    return p ? p.getHandPublicView() : [];
  }

  playCard(playerId, cardId, chosenColor = null) {
    if (!this.turnManager.isValidTurn(playerId)) {
      throw new Error('NOT_YOUR_TURN');
    }
    const player = this.players.get(playerId);
    if (!player) throw new Error('PLAYER_NOT_FOUND');
    const card = player.hand.find((c) => c.id === cardId);
    if (!card) throw new Error('CARD_NOT_FOUND');
    const topCard = this.discardPile[this.discardPile.length - 1];
    if (this.pendingDraw) {
      // Forzado: con robo pendiente solo se puede apilar con carta de robo valida
      if (!this.rules.canStackResponse(card, this.pendingDraw.topType)) {
        throw new Error('INVALID_PLAY');
      }
    } else {
      if (!this.rules.canPlay(card, topCard, this.currentColor)) {
        throw new Error('INVALID_PLAY');
      }
    }
    // remove card
    player.removeCard(cardId);
    this.discardPile.push(card);
    this.currentColor = card.color !== 'WILD' ? card.color : (chosenColor || topCard.color);
    // handle effects
    if (card.type === 'REVERSE') {
      this.turnManager.reverse();
      if (this.turnManager.activeCount() > 2) {
        this.turnManager.advanceToNext();
      }
      // con 2 jugadores reverse = skip: mismo jugador continua
    } else if (card.type === 'SKIP') {
      this.turnManager.advanceToNext(); // mover al jugador que es saltado
      this.turnManager.advanceToNext(); // saltarlo
    } else if (card.type === 'DRAW2') {
      if (this.pendingDraw) {
        this.pendingDraw.amount += 2;
        // topType sigue siendo DRAW2
      } else {
        this.pendingDraw = { amount: 2, topType: 'DRAW2' };
      }
      this.turnManager.advanceToNext();
    } else if (card.type === 'WILD_DRAW4') {
      if (this.pendingDraw) {
        this.pendingDraw.amount += 4;
        this.pendingDraw.topType = 'WILD_DRAW4';
      } else {
        this.pendingDraw = { amount: 4, topType: 'WILD_DRAW4' };
      }
      this.turnManager.advanceToNext();
    } else {
      // NUMBER, WILD: avanzar normalmente
      this.turnManager.advanceToNext();
    }
    // check win
    if (player.hand.length === 0) {
      this.status = 'FINISHED';
      this.winnerId = playerId;
    }
    // UNO automatico: al quedar con 1 carta se asigna solo
    player.unoAnnounced = player.hand.length === 1;
    player.timeouts = 0;
    this.turnSeq++;
    return { success: true };
  }

  _drawFromDeck(n) {
    const cards = [];
    for (let i = 0; i < n; i++) {
      if (this.deck.cards.length === 0) {
        this._refillDeck();
      }
      const drawn = this.deck.draw(1);
      if (drawn.length === 0) break;
      cards.push(...drawn);
    }
    return cards;
  }

  _refillDeck() {
    if (this.discardPile.length <= 1) return; // nada que reciclar (se conserva la carta superior)
    const top = this.discardPile.pop();
    const toRecycle = this.discardPile.splice(0, this.discardPile.length);
    for (const c of toRecycle) {
      this.deck.addToTop(c);
    }
    this.deck.shuffle();
    this.discardPile.push(top);
  }

  drawCard(playerId) {
    if (!this.turnManager.isValidTurn(playerId)) {
      throw new Error('NOT_YOUR_TURN');
    }
    const player = this.players.get(playerId);
    if (!player) throw new Error('PLAYER_NOT_FOUND');
    let count = 1;
    if (this.pendingDraw) {
      count = this.pendingDraw.amount;
      this.pendingDraw = null;
    }
    const cards = this._drawFromDeck(count);
    if (cards.length > 0) {
      player.addCards(cards);
    }
    player.unoAnnounced = false;
    player.timeouts = 0;
    this.turnManager.advanceToNext();
    this.turnSeq++;
    return { success: true, drawn: cards.length };
  }

  announceUno(playerId) {
    const player = this.players.get(playerId);
    if (!player) throw new Error('PLAYER_NOT_FOUND');
    if (player.hand.length === 1) {
      player.unoAnnounced = true;
      return { success: true };
    }
    return { success: false, reason: 'NOT_ONE_CARD' };
  }

  registerRequestId(requestId) {
    const now = Date.now();
    this._requestIdMap.set(requestId, now);
  }

  isDuplicateRequest(requestId, windowMs = 5000) {
    return this._requestIdMap.has(requestId);
  }

  // Marca a un jugador como presente/ausente sin romper la partida.
  // Ausente en partida: conserva su asiento (puede volver) y el turno pasa al siguiente.
  setPlayerActive(playerId, active) {
    const player = this.players.get(playerId);
    if (!player) return false;
    const wasActive = player.active;
    player.active = active;
    player.timeouts = 0;
    if (active) player.lastActionTimestamp = Date.now();
    this.turnManager.setActive(playerId, active);
    if (!active && wasActive && this.status === 'STARTED') {
      if (this.turnManager.getCurrentPlayer()?.id === playerId) {
        // el robo pendiente iba dirigido a quien se fue
        this.pendingDraw = null;
        this.turnManager.advanceToNext();
        this.turnSeq++;
      }
      this._checkAbandonment();
    }
    return true;
  }

  // Quita a un jugador antes de empezar (nunca al host).
  removePlayer(playerId) {
    if (this.status === 'STARTED' || playerId === this.hostId) return false;
    const removed = this.players.delete(playerId);
    if (removed) this.turnManager.setPlayers(Array.from(this.players.values()));
    return removed;
  }

  activePlayers() {
    return Array.from(this.players.values()).filter((p) => p.active);
  }

  // Si queda menos de 2 jugadores activos la ronda termina sin bloquearse.
  _checkAbandonment() {
    if (this.status !== 'STARTED') return;
    const alive = this.activePlayers();
    if (alive.length >= 2) return;
    this.status = 'FINISHED';
    this.winnerId = alive.length === 1 ? alive[0].id : null;
    this.endReason = 'ABANDONED';
    this.pendingDraw = null;
    this.turnSeq++;
  }

  resetForNewRound() {
    for (const [id, p] of Array.from(this.players.entries())) {
      if (!p.active && id !== this.hostId) this.players.delete(id);
    }
    this.endReason = null;
    this.deck = new Deck();
    this.discardPile = [];
    this._initialTopCardSetup();
    this.pendingDraw = null;
    this.winnerId = null;
    this.currentColor = this.discardPile[0].color;
    for (const p of this.players.values()) {
      p.hand = [];
      p.unoAnnounced = false;
    }
    this.turnManager = new TurnManager(Array.from(this.players.values()));
    this.status = 'WAITING';
  }
}
