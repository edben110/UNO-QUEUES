import test from 'node:test';
import assert from 'node:assert/strict';
import { Card } from '../src/game/Card.js';
import { Player } from '../src/game/Player.js';
import { Game } from '../src/game/Game.js';
import { GameServer } from '../src/server/GameServer.js';
import { GameManager } from '../src/server/GameManager.js';
import { MSG_TYPES } from '../src/messaging/MessageProtocol.js';

function startedGame(n) {
  const game = new Game('g', new Player('p1', 'A'));
  for (let i = 2; i <= n; i++) game.addPlayer(new Player('p' + i, 'P' + i));
  game.start();
  game.discardPile = [new Card({ type: 'NUMBER', color: 'RED', value: 5 })];
  game.currentColor = 'RED';
  return game;
}

test('jugador ausente en su turno: el turno pasa al siguiente', () => {
  const g = startedGame(3);
  assert.equal(g.turnManager.getCurrentPlayer().id, 'p1');
  g.setPlayerActive('p1', false);
  assert.equal(g.turnManager.getCurrentPlayer().id, 'p2');
  assert.equal(g.status, 'STARTED');
});

test('jugadores ausentes se saltan en la rotacion', () => {
  const g = startedGame(3);
  g.setPlayerActive('p2', false);
  g.drawCard('p1');
  assert.equal(g.turnManager.getCurrentPlayer().id, 'p3');
});

test('con menos de 2 activos la partida termina y gana el que queda', () => {
  const g = startedGame(2);
  g.setPlayerActive('p2', false);
  assert.equal(g.status, 'FINISHED');
  assert.equal(g.winnerId, 'p1');
  assert.equal(g.endReason, 'ABANDONED');
});

test('el robo pendiente no pasa al siguiente si se va quien debia robar', () => {
  const g = startedGame(3);
  g.pendingDraw = { amount: 2, topType: 'DRAW2' };
  g.setPlayerActive('p1', false);
  assert.equal(g.pendingDraw, null);
});

test('LEAVE_GAME y reconexion con el mismo id', () => {
  const g = startedGame(3);
  const gm = new GameManager(g);
  gm.handleMessage({ type: MSG_TYPES.LEAVE_GAME, playerId: 'p3', payload: {} });
  assert.equal(g.players.get('p3').active, false);
  const handBefore = g.players.get('p3').hand.length;
  const res = gm.handleMessage({ type: MSG_TYPES.JOIN_GAME, playerId: 'p3', payload: {} });
  assert.equal(res.payload.success, true);
  assert.equal(g.players.get('p3').active, true);
  assert.equal(res.payload.hand.length, handBefore);
});

test('LEAVE_GAME en sala de espera quita al jugador', () => {
  const g = new Game('g', new Player('p1', 'A'));
  g.addPlayer(new Player('p2', 'B'));
  new GameManager(g).handleMessage({ type: MSG_TYPES.LEAVE_GAME, playerId: 'p2', payload: {} });
  assert.equal(g.players.has('p2'), false);
});

test('mensajes basura no lanzan excepcion', () => {
  const gm = new GameManager(startedGame(2));
  for (const bad of [null, undefined, 'x', 42, { raw: 'zz' }, { type: 'NOPE' }]) {
    assert.doesNotThrow(() => gm.handleMessage(bad));
  }
});

test('timeout de turno: roba y pasa el turno', async () => {
  const s = new GameServer({ gameId: 't1', turnTimeoutMs: 50 });
  const g = s.game;
  g.addPlayer(new Player('p2', 'B'));
  await s.startRound();
  const first = g.turnManager.getCurrentPlayer();
  const handBefore = first.hand.length;
  assert.ok(g.turnDeadline > Date.now() - 1);
  await s._onTurnTimeout(g.turnSeq);
  assert.equal(first.hand.length, handBefore + 1);
  assert.notEqual(g.turnManager.getCurrentPlayer().id, first.id);
  s._clearTurnTimer();
});

test('timeout con robo pendiente cobra el robo completo', async () => {
  const s = new GameServer({ gameId: 't2', turnTimeoutMs: 50 });
  const g = s.game;
  g.addPlayer(new Player('p2', 'B'));
  await s.startRound();
  const cur = g.turnManager.getCurrentPlayer();
  g.pendingDraw = { amount: 4, topType: 'WILD_DRAW4' };
  const before = cur.hand.length;
  await s._onTurnTimeout(g.turnSeq);
  assert.equal(cur.hand.length, before + 4);
  assert.equal(g.pendingDraw, null);
  s._clearTurnTimer();
});

test('tres timeouts seguidos marcan al jugador ausente y la partida sigue', async () => {
  const s = new GameServer({ gameId: 't3', turnTimeoutMs: 50 });
  const g = s.game;
  g.addPlayer(new Player('p2', 'B'));
  g.addPlayer(new Player('p3', 'C'));
  await s.startRound();
  const victim = g.turnManager.getCurrentPlayer();
  for (let i = 0; i < 3; i++) {
    // forzar que vuelva a ser su turno
    g.turnManager.currentIndex = g.turnManager.players.findIndex((p) => p.id === victim.id);
    g.turnSeq++;
    await s._onTurnTimeout(g.turnSeq);
  }
  assert.equal(victim.active, false);
  assert.equal(g.status, 'STARTED');
  assert.notEqual(g.turnManager.getCurrentPlayer().id, victim.id);
  s._clearTurnTimer();
});

test('un timeout de un turno viejo se ignora', async () => {
  const s = new GameServer({ gameId: 't4', turnTimeoutMs: 50 });
  const g = s.game;
  g.addPlayer(new Player('p2', 'B'));
  await s.startRound();
  const staleSeq = g.turnSeq;
  const cur = g.turnManager.getCurrentPlayer();
  g.drawCard(cur.id); // el turno cambio antes de que dispare el timer viejo
  const handSize = g.players.get('p2').hand.length + cur.hand.length;
  await s._onTurnTimeout(staleSeq);
  assert.equal(g.players.get('p2').hand.length + cur.hand.length, handSize);
  s._clearTurnTimer();
});

test('el barrido de latidos marca ausente a quien no da señales', () => {
  const s = new GameServer({ gameId: 't5', turnTimeoutMs: 0, playerTimeoutMs: 100 });
  const g = s.game;
  g.addPlayer(new Player('p2', 'B'));
  g.addPlayer(new Player('p3', 'C'));
  g.start();
  g.players.get('p2').lastActionTimestamp = Date.now() - 1000;
  g.players.get('p3').lastActionTimestamp = Date.now();
  g.players.get(s.hostId).lastActionTimestamp = Date.now();
  s._sweepPlayers();
  assert.equal(g.players.get('p2').active, false);
  assert.equal(g.players.get('p3').active, true);
});
