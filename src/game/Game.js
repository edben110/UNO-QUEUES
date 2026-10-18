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
    this.turnManager.setPlayers(Array.from(this.players.values()));
  }

  getStatePublic() {
    return {
      gameId: this.gameId,
      status: this.status,
      players: Array.from(this.players.values()).map((p) => p.toJSON()),
      topCard: this.discardPile.length > 0 ? this.discardPile[this.discardPile.length - 1].toJSON() : null,
      currentColor: this.currentColor,
      currentPlayerId: this.turnManager.getCurrentPlayer()?.id || null,
      direction: this.turnManager.direction,
      pendingDraw: this.pendingDraw,
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
      if (this.players.size > 2) {
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
    player.unoAnnounced = (player.hand.length === 1) ? player.unoAnnounced : false;
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
    this.turnManager.advanceToNext();
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
}
