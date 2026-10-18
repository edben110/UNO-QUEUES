import { Card } from './Card.js';

export class Deck {
  constructor() {
    this.cards = [];
    this._buildDeck();
    this.shuffle();
  }

  _buildDeck() {
    const colors = ['RED', 'BLUE', 'GREEN', 'YELLOW'];
    for (const color of colors) {
      this.cards.push(new Card({ type: 'NUMBER', color, value: 0 }));
      for (let n = 1; n <= 9; n++) {
        this.cards.push(new Card({ type: 'NUMBER', color, value: n }));
        this.cards.push(new Card({ type: 'NUMBER', color, value: n }));
      }
      for (let i = 0; i < 2; i++) {
        this.cards.push(new Card({ type: 'SKIP', color, symbol: 'SKIP' }));
        this.cards.push(new Card({ type: 'REVERSE', color, symbol: 'REV' }));
        this.cards.push(new Card({ type: 'DRAW2', color, symbol: 'DRAW2' }));
      }
    }
    for (let i = 0; i < 4; i++) {
      this.cards.push(new Card({ type: 'WILD', color: 'WILD', symbol: 'WILD' }));
      this.cards.push(new Card({ type: 'WILD_DRAW4', color: 'WILD', symbol: 'WILD4' }));
    }
  }

  shuffle() {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  draw(n = 1) {
    const drawn = [];
    for (let i = 0; i < n; i++) {
      if (this.cards.length === 0) break;
      drawn.push(this.cards.shift());
    }
    return drawn;
  }

  addToTop(card) {
    this.cards.unshift(card);
  }

  count() {
    return this.cards.length;
  }
}
