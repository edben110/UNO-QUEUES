export class Player {
  constructor(id, name) {
    this.id = id;
    this.name = name;
    this.hand = [];
    this.unoAnnounced = false;
    this.active = true;
    this.lastActionTimestamp = Date.now();
  }

  addCards(cards) {
    for (const c of cards) {
      this.hand.push(c);
    }
  }

  removeCard(cardId) {
    const idx = this.hand.findIndex((c) => (c.id === cardId));
    if (idx >= 0) {
      return this.hand.splice(idx, 1)[0];
    }
    return null;
  }

  hasCard(cardId) {
    return this.hand.some((c) => c.id === cardId);
  }

  getHandPublicView() {
    return this.hand.map((c) => ({ ...c.toJSON(), id: c.id }));
  }

  getHandSize() {
    return this.hand.length;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      handSize: this.hand.length,
      unoAnnounced: this.unoAnnounced,
      active: this.active,
    };
  }
}
