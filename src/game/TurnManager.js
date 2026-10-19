export class TurnManager {
  constructor(players = []) {
    this.players = players.slice();
    this.currentIndex = 0;
    this.direction = 1; // +1 forward, -1 reverse
    this.activePlayerIds = new Set(this.players.filter((p) => p.active !== false).map((p) => p.id));
  }

  setPlayers(players) {
    this.players = players.slice();
    this.activePlayerIds = new Set(this.players.filter((p) => p.active !== false).map((p) => p.id));
    if (this.currentIndex >= this.players.length) {
      this.currentIndex = 0;
    }
  }

  getCurrentPlayer() {
    if (this.players.length === 0) return null;
    return this.players[this.currentIndex];
  }

  getNextPlayer() {
    let idx = this.currentIndex;
    for (let step = 0; step < this.players.length; step++) {
      idx = (idx + this.direction + this.players.length) % this.players.length;
      if (this.activePlayerIds.has(this.players[idx].id)) {
        return this.players[idx];
      }
    }
    return this.players[this.currentIndex];
  }

  advanceToNext() {
    const next = this.getNextPlayer();
    if (!next) return null;
    this.currentIndex = this.players.findIndex((p) => p.id === next.id);
    return this.players[this.currentIndex];
  }

  reverse() {
    this.direction *= -1;
  }

  skip() {
    this.advanceToNext();
  }

  setActive(playerId, active) {
    if (active) {
      this.activePlayerIds.add(playerId);
    } else {
      this.activePlayerIds.delete(playerId);
    }
  }

  activeCount() {
    return this.activePlayerIds.size;
  }

  isValidTurn(playerId) {
    const cur = this.getCurrentPlayer();
    return cur && cur.id === playerId;
  }
}
