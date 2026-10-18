export const CARD_COLORS = ['RED', 'BLUE', 'GREEN', 'YELLOW'];
export const WILD_COLORS = ['WILD'];

export class Card {
  constructor({ type, color, value, symbol }) {
    this.type = type;
    this.color = color;
    this.value = value ?? null;
    this.symbol = symbol ?? null;
    this.id = this._generateId();
  }

  _generateId() {
    const parts = [this.type];
    if (this.color) parts.push(this.color);
    if (this.value !== null && this.value !== undefined) parts.push(this.value);
    if (this.symbol) parts.push(this.symbol);
    return parts.join('-') + '-' + Math.random().toString(36).substr(2, 6);
  }

  toJSON() {
    return {
      type: this.type,
      color: this.color,
      value: this.value,
      symbol: this.symbol,
    };
  }
}
