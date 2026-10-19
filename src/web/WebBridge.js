import http from 'http';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { GameClient } from '../client/GameClient.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function localAddresses() {
  const set = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const n of list || []) {
      set.add(n.address);
      set.add(`::ffff:${n.address}`);
    }
  }
  return set;
}

/**
 * Puente navegador <-> RabbitMQ. Cada socket abre un GameClient (el mismo
 * que usa la CLI), asi el protocolo y las reglas no cambian.
 * Solo se conecta al servidor por la cola; el unico acceso directo al
 * GameServer es iniciar partida, reservado a quien abre la pagina desde el host.
 */
export class WebBridge {
  constructor({ server, gameId, port = 3000, rabbitHost }) {
    this.server = server; // GameServer (solo en el proceso del host)
    this.gameId = gameId;
    this.port = port;
    this.rabbitHost = rabbitHost;
    this.local = localAddresses();
    this.active = new Map(); // playerId -> funcion que cierra su cliente actual
    this.http = http.createServer((req, res) => this._serve(req, res));
    this.wss = new WebSocketServer({ server: this.http });
    this.wss.on('error', () => {}); // errores de listen los maneja listen()
    this.wss.on('connection', (ws, req) => this._onSocket(ws, req));
  }

  listen() {
    return new Promise((resolve, reject) => {
      this.http.once('error', reject);
      this.http.listen(this.port, '0.0.0.0', () => resolve());
    });
  }

  async close() {
    for (const ws of this.wss.clients) ws.close();
    this.http.close();
  }

  _serve(req, res) {
    const url = new URL(req.url, 'http://x');
    const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const file = path.normalize(path.join(PUBLIC_DIR, rel));
    if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  }

  _onSocket(ws, req) {
    const isLocalViewer = this.server && this.local.has(req.socket.remoteAddress);
    let client = null;
    let lastKey = '';
    let joinSeq = 0;
    const send = (obj) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
    };

    // announce=false: cierre por socket caido/recarga; el servidor decide por falta de latido
    const closeClient = async (announce = true) => {
      const c = client;
      client = null;
      if (this._hostSocket === ws) this._hostSocket = null;
      if (c) {
        if (this.active.get(c.playerId) === closeClient) this.active.delete(c.playerId);
        try { await c.stop(announce); } catch (e) {}
      }
    };

    const push = () => {
      if (!client) return;
      const msg = client.lastMessage;
      client.lastMessage = null;
      const key = JSON.stringify([client.state, client.hand]);
      if (key === lastKey && !msg) return;
      lastKey = key;
      send({ type: 'update', state: client.state, hand: client.hand, message: msg });
    };

    const join = async ({ name, playerId }) => {
      const seq = ++joinSeq;
      await closeClient(false);
      if (seq !== joinSeq) return;
      // el host reclama su asiento ya creado (o lo recupera al recargar); el resto recibe un id propio
      const isHostId = playerId && playerId === this.server?.hostId;
      const wantsHost = isLocalViewer && this.server && (isHostId || (!this._hostSeatTaken() && !this.server.game.players.has(playerId)));
      if (process.env.DEBUG_UNO) console.log('[bridge] join', { remote: req.socket.remoteAddress, isLocalViewer, playerId, isHostId, seatTaken: this._hostSeatTaken(), wantsHost });
      const id = wantsHost ? this.server.hostId : (playerId && !isHostId ? playerId : undefined);
      // si el mismo jugador sigue conectado desde otro socket (recarga), cerrar ese primero
      if (id && this.active.has(id)) await this.active.get(id)(false);
      if (seq !== joinSeq) return; // llego otro join mientras esperabamos
      const c = new GameClient({
        gameId: this.gameId,
        hostRabbitHost: this.rabbitHost,
        playerId: id,
        playerName: String(name || 'Jugador').slice(0, 20),
      });
      c.on('update', push);
      client = c;
      this.active.set(c.playerId, closeClient);
      try {
        await c.connect();
        if (seq !== joinSeq || client !== c) { await c.stop(false).catch(() => {}); return; }
        if (wantsHost) {
          this._hostSocket = ws;
          const seat = this.server.game.players.get(this.server.hostId);
          if (seat && name) seat.name = String(name).slice(0, 20);
        }
        send({
          type: 'session',
          playerId: c.playerId,
          isHost: c.playerId === this.server?.hostId,
          config: { turnTimeoutMs: this.server?.turnTimeoutMs ?? null },
        });
      } catch (e) {
        if (client === c) client = null;
        this.active.delete(c.playerId);
        c.stop(false).catch(() => {});
        send({ type: 'fatal', error: `No se pudo conectar al servidor: ${e.message}` });
      }
    };

    ws.on('message', async (raw) => {
      let m;
      try { m = JSON.parse(raw.toString()); } catch (e) { return; }
      try {
        switch (m.type) {
          case 'join': await join(m); break;
          case 'rejoin': if (client) await client.sendJoin(); break;
          case 'play': if (client) await client.playCard(m.cardId, m.color || null); break;
          case 'draw': if (client) await client.drawCard(); break;
          case 'start': {
            if (!client || client.playerId !== this.server?.hostId) {
              send({ type: 'update', state: client?.state, hand: client?.hand, message: { type: 'ERROR', text: 'Solo el anfitrion puede iniciar' } });
              break;
            }
            const r = await this.server.startRound();
            if (!r.success) send({ type: 'update', state: client.state, hand: client.hand, message: { type: 'ERROR', text: r.error } });
            break;
          }
          case 'leave': await closeClient(true); break;
          default: break;
        }
      } catch (e) {
        send({ type: 'update', state: client?.state, hand: client?.hand, message: { type: 'ERROR', text: e.message } });
      }
    });

    ws.on('close', () => {
      if (this._hostSocket === ws) this._hostSocket = null;
      closeClient(false);
    });
    ws.on('error', () => {});
  }

  _hostSeatTaken() {
    return !!this._hostSocket && this._hostSocket.readyState === 1;
  }
}
