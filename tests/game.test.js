import test from 'node:test';
import assert from 'node:assert/strict';
import { Deck } from '../src/game/Deck.js';
import { Player } from '../src/game/Player.js';
import { TurnManager } from '../src/game/TurnManager.js';

test('Deck tiene 108 cartas', () => {
  const d = new Deck();
  assert.equal(d.count(), 108);
});

test('Reparto inicial 7 cartas', () => {
  const p = new Player('p1', 'A');
  p.addCards(new Deck().draw(7));
  assert.equal(p.hand.length, 7);
});

test('TurnManager avanza correctamente', () => {
  const p1 = new Player('p1', 'A');
  const p2 = new Player('p2', 'B');
  const tm = new TurnManager([p1, p2]);
  const cur = tm.getCurrentPlayer();
  tm.advanceToNext();
  assert.notEqual(cur.id, tm.getCurrentPlayer().id);
});
