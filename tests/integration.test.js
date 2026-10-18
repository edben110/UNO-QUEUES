import test from 'node:test';
import assert from 'node:assert/strict';
import { GameServer } from '../src/server/GameServer.js';
import { GameClient } from '../src/client/GameClient.js';
import { buildRabbitUrl } from '../src/config/configuration.js';

const hasRabbit = await (async () => {
  try {
    const url = new URL(buildRabbitUrl());
    const net = await import('net');
    return await new Promise((res) => {
      const s = net.connect({ host: url.hostname, port: Number(url.port) || 5672 }, () => {
        s.end();
        res(true);
      });
      s.on('error', () => res(false));
      s.setTimeout(1500, () => {
        s.destroy();
        res(false);
      });
    });
  } catch (e) {
    return false;
  }
})();

test('integracion: host y dos clientes sincronizan estado', { skip: !hasRabbit, timeout: 20000 }, async (t) => {
  const gameId = 'itest-' + Date.now();
  const server = new GameServer({
    gameId,
    hostId: 'host-it',
    hostName: 'HostIT',
    rabbit: { url: buildRabbitUrl() },
  });
  await server.start();

  const c1 = new GameClient({ gameId, playerId: 'p-one', playerName: 'Alice' });
  const c2 = new GameClient({ gameId, playerId: 'p-two', playerName: 'Bob' });

  try {
    const c1Update = new Promise((res) => c1.once('update', res));
    const c2Update = new Promise((res) => c2.once('update', res));

    await c1.connect();
    await c2.connect();
    await Promise.race([c1Update, new Promise((r) => setTimeout(r, 4000))]);
    await Promise.race([c2Update, new Promise((r) => setTimeout(r, 4000))]);
    await new Promise((r) => setTimeout(r, 800));

    assert.ok(c1.state, 'cliente 1 debe recibir estado');
    assert.ok(c2.state, 'cliente 2 debe recibir estado');
    assert.equal(server.game.getStatePublic().players.length, 3, 'host + 2 clientes en el servidor');
    assert.equal(c1.state.status, 'WAITING', 'aun no inicia hasta que el host arranca');

    // el host inicia la partida
    server.game.start();
    await server.broadcastState();
    await new Promise((r) => setTimeout(r, 600));

    assert.equal(c1.state.status, 'STARTED', 'cliente 1 ve partida iniciada');
    assert.equal(c2.state.status, 'STARTED', 'cliente 2 ve partida iniciada');

    await c1.requestHand();
    await new Promise((r) => setTimeout(r, 800));
    assert.equal(c1.hand.length, 7, 'mano inicial de 7 cartas');

    const state = server.game.getStatePublic();
    const turnId = state.currentPlayerId;
    const actor = turnId === 'p-one' ? c1 : turnId === 'p-two' ? c2 : null;

    if (actor) {
      await actor.requestHand();
      await new Promise((r) => setTimeout(r, 600));
      await actor.drawCard();
      await new Promise((r) => setTimeout(r, 800));
      const after = server.game.getStatePublic();
      assert.notEqual(after.currentPlayerId, turnId, 'el turno debe avanzar tras robar');
      const other = actor === c1 ? c2 : c1;
      assert.ok(other.state, 'el otro cliente tiene estado');
      assert.equal(other.state.currentPlayerId, after.currentPlayerId, 'el otro cliente ve el nuevo turno');
    }
  } finally {
    await c1.rabbit.disconnect();
    await c2.rabbit.disconnect();
    await server.rabbit.disconnect();
  }
});
