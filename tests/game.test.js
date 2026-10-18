import test from 'node:test';
import assert from 'node:assert/strict';
import { Deck } from '../src/game/Deck.js';
import { Card } from '../src/game/Card.js';
import { Player } from '../src/game/Player.js';
import { TurnManager } from '../src/game/TurnManager.js';
import { Game } from '../src/game/Game.js';

function setupGame(numPlayers, topCard) {
  const host = new Player('p1', 'Host');
  const game = new Game('g-test', host);
  for (let i = 2; i <= numPlayers; i++) {
    game.addPlayer(new Player('p' + i, 'P' + i));
  }
  for (const p of game.players.values()) p.hand = [];
  game.discardPile = [topCard];
  game.currentColor = topCard.color;
  game.status = 'STARTED';
  return game;
}

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

test('DRAW2 obliga al siguiente a robar 2 y pierde turno', () => {
  const top = new Card({ type: 'NUMBER', color: 'RED', value: 5 });
  const game = setupGame(3, top);
  const draw2 = new Card({ type: 'DRAW2', color: 'RED', symbol: 'DRAW2' });
  game.players.get('p1').hand = [draw2];
  game.playCard('p1', draw2.id, null);
  assert.deepEqual(game.pendingDraw, { amount: 2, topType: 'DRAW2' });
  assert.equal(game.turnManager.getCurrentPlayer().id, 'p2');
  const p2 = game.players.get('p2');
  const before = p2.hand.length;
  game.drawCard('p2');
  assert.equal(p2.hand.length, before + 2);
  assert.equal(game.pendingDraw, null);
  assert.equal(game.turnManager.getCurrentPlayer().id, 'p3');
});

test('+2 apilado con +2 acumula 4', () => {
  const top = new Card({ type: 'NUMBER', color: 'RED', value: 5 });
  const game = setupGame(3, top);
  const d1 = new Card({ type: 'DRAW2', color: 'RED', symbol: 'DRAW2' });
  const d2 = new Card({ type: 'DRAW2', color: 'BLUE', symbol: 'DRAW2' });
  game.players.get('p1').hand = [d1];
  game.players.get('p2').hand = [d2];
  game.playCard('p1', d1.id, null);
  assert.equal(game.turnManager.getCurrentPlayer().id, 'p2');
  game.playCard('p2', d2.id, null);
  assert.deepEqual(game.pendingDraw, { amount: 4, topType: 'DRAW2' });
  assert.equal(game.turnManager.getCurrentPlayer().id, 'p3');
});

test('+2 respondido con +4 acumula 6 y pasa a solo +4', () => {
  const top = new Card({ type: 'NUMBER', color: 'RED', value: 5 });
  const game = setupGame(3, top);
  const d2 = new Card({ type: 'DRAW2', color: 'RED', symbol: 'DRAW2' });
  const w4 = new Card({ type: 'WILD_DRAW4', color: 'WILD', symbol: 'WILD4' });
  game.players.get('p1').hand = [d2];
  game.players.get('p2').hand = [w4];
  game.playCard('p1', d2.id, null);
  game.playCard('p2', w4.id, 'BLUE');
  assert.deepEqual(game.pendingDraw, { amount: 6, topType: 'WILD_DRAW4' });
  assert.equal(game.currentColor, 'BLUE');
});

test('+4 apilado con +4 acumula 8', () => {
  const top = new Card({ type: 'NUMBER', color: 'RED', value: 5 });
  const game = setupGame(3, top);
  const w1 = new Card({ type: 'WILD_DRAW4', color: 'WILD', symbol: 'WILD4' });
  const w2 = new Card({ type: 'WILD_DRAW4', color: 'WILD', symbol: 'WILD4' });
  game.players.get('p1').hand = [w1];
  game.players.get('p2').hand = [w2];
  game.playCard('p1', w1.id, 'GREEN');
  assert.deepEqual(game.pendingDraw, { amount: 4, topType: 'WILD_DRAW4' });
  game.playCard('p2', w2.id, 'RED');
  assert.deepEqual(game.pendingDraw, { amount: 8, topType: 'WILD_DRAW4' });
});

test('Con robo pendiente no se puede jugar carta normal', () => {
  const top = new Card({ type: 'NUMBER', color: 'RED', value: 5 });
  const game = setupGame(3, top);
  const d2 = new Card({ type: 'DRAW2', color: 'RED', symbol: 'DRAW2' });
  const num = new Card({ type: 'NUMBER', color: 'RED', value: 7 });
  game.players.get('p1').hand = [d2];
  game.players.get('p2').hand = [num];
  game.playCard('p1', d2.id, null);
  assert.throws(() => game.playCard('p2', num.id, null), /INVALID_PLAY/);
});

test('SKIP salta al siguiente jugador', () => {
  const top = new Card({ type: 'NUMBER', color: 'RED', value: 5 });
  const game = setupGame(3, top);
  const skip = new Card({ type: 'SKIP', color: 'RED', symbol: 'SKIP' });
  game.players.get('p1').hand = [skip];
  game.playCard('p1', skip.id, null);
  assert.equal(game.turnManager.getCurrentPlayer().id, 'p3');
});

test('REVERSE con 3 jugadores pasa el turno al anterior', () => {
  const top = new Card({ type: 'NUMBER', color: 'RED', value: 5 });
  const game = setupGame(3, top);
  const rev = new Card({ type: 'REVERSE', color: 'RED', symbol: 'REV' });
  game.players.get('p1').hand = [rev];
  game.playCard('p1', rev.id, null);
  assert.equal(game.turnManager.direction, -1);
  assert.equal(game.turnManager.getCurrentPlayer().id, 'p3');
});

test('REVERSE con 2 jugadores mantiene el turno (actua como skip)', () => {
  const top = new Card({ type: 'NUMBER', color: 'RED', value: 5 });
  const game = setupGame(2, top);
  const rev = new Card({ type: 'REVERSE', color: 'RED', symbol: 'REV' });
  game.players.get('p1').hand = [rev];
  game.playCard('p1', rev.id, null);
  assert.equal(game.turnManager.direction, -1);
  assert.equal(game.turnManager.getCurrentPlayer().id, 'p1');
});

test('_refillDeck recicla el descarte cuando el mazo se vacia', () => {
  const top = new Card({ type: 'NUMBER', color: 'RED', value: 5 });
  const game = setupGame(3, top);
  game.deck.cards = [];
  game.discardPile.push(new Card({ type: 'NUMBER', color: 'BLUE', value: 1 }));
  game.discardPile.push(new Card({ type: 'NUMBER', color: 'GREEN', value: 2 }));
  game._refillDeck();
  assert.equal(game.deck.cards.length, 2);
  assert.equal(game.discardPile.length, 1);
});
