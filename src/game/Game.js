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
    this.draw2Stack = 0;
    this.draw4Stack = 0;
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
      draw2Stack: this.draw2Stack,
      draw4Stack: this.draw4Stack,
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
    if (!this.rules.canPlay(card, topCard, this.currentColor)) {
      throw new Error('INVALID_PLAY');
    }
    // remove card
    player.removeCard(cardId);
    this.discardPile.push(card);
    this.currentColor = card.color !== 'WILD' ? card.color : (chosenColor || topCard.color);
    // handle effects
    if (card.type === 'REVERSE') {
      this.turnManager.reverse();
    }
    if (card.type === 'SKIP') {
      this.turnManager.advanceToNext();
    }
    if (card.type === 'DRAW2') {
      this.draw2Stack += 2;
      this.turnManager.advanceToNext();
    }
    if (card.type === 'WILD_DRAW4') {
      this.draw4Stack += 4;
      this.turnManager.advanceToNext();
    }
    if (card.type === 'NUMBER' || card.type === 'WILD') {
      // advance normally
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

  drawCard(playerId) {
    if (!this.turnManager.isValidTurn(playerId)) {
      throw new Error('NOT_YOUR_TURN');
    }
    const player = this.players.get(playerId);
    if (!player) throw new Error('PLAYER_NOT_FOUND');
    const cards = this.deck.draw(1);
    if (cards.length > 0) {
      player.addCards(cards);
    }
    // after drawing, player can play? implementation choice: turn passes by default? simple: advance
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
