import { GameServer } from './GameServer.js';
import { generateId } from '../utils/validators.js';
import { getLocalIp, buildRabbitUrl } from '../config/configuration.js';
import { MessageProtocol, MSG_TYPES } from '../messaging/MessageProtocol.js';
import readline from 'readline';

function formatState(state) {
  if (!state) return 'Sin estado.';
  const players = state.players || [];
  let out = `Juego: ${state.gameId} | Estado: ${state.status} | Sentido: ${state.direction === 1 ? '>' : '<'}\n`;
  out += `Jugador actual: ${state.currentPlayerId || 'N/A'}\n`;
  out += `Carta superior: ${state.topCard ? state.topCard.type + (state.topCard.value !== null ? ' ' + state.topCard.value : '') + ' ' + state.topCard.color : 'N/A'} | Color activo: ${state.currentColor || 'N/A'}\n`;
  out += 'Jugadores:\n';
  players.forEach((p, i) => {
    out += `  ${i + 1}. ${p.name} [${p.id.slice(-6)}] cartas:${p.handSize} uno:${p.unoAnnounced ? 'SI' : 'NO'} ${p.id === state.currentPlayerId ? '(TURNO)' : ''}\n`;
  });
  return out.trim();
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const gameId = process.env.GAME_ID || generateId('game');
  const hostId = generateId('host');
  let hostName = process.env.HOST_NAME || '';
  let server = null;
  let ready = false;
  const pending = [];

  const processLine = async (line) => {
    const parts = line.trim().split(/\s+/);
    if (!parts[0]) return;
    const cmd = parts[0].toLowerCase();
    if (cmd === 'quit' || cmd === 'exit') {
      rl.close();
      process.exit(0);
    }
    if (!server) return;
    if (cmd === 'state' || cmd === 'players' || cmd === 'list' || cmd === 'who') {
      console.log(formatState(server.game.getStatePublic()));
      return;
    }
    if (cmd === 'start') {
      try {
        if (server.game.status === 'STARTED') {
          console.log('Ya iniciada');
          console.log(formatState(server.game.getStatePublic()));
          return;
        }
        server.game.start();
        const state = server.game.getStatePublic();
        const msg = MessageProtocol.create(MSG_TYPES.GAME_STATE, server.game.gameId, null, { state });
        await server.qm.publish(server.eventExchange, '', msg);
        console.log('Partida iniciada. Estado enviado a todos.');
        console.log(formatState(server.game.getStatePublic()));
      } catch (e) {
        console.log('Error:', e.message);
      }
      return;
    }
    if (cmd === 'draw') {
      try {
        const pid = parts[1] || server.hostId;
        const res = server.game.drawCard(pid);
        console.log(res);
        const state = server.game.getStatePublic();
        const msg = MessageProtocol.create(MSG_TYPES.GAME_STATE, server.game.gameId, null, { state });
        await server.qm.publish(server.eventExchange, '', msg);
      } catch (e) {
        console.log('Error:', e.message);
      }
      return;
    }
    if (cmd === 'play') {
      if (parts.length < 2) {
        console.log('Uso: play <cardId> [COLOR]');
        return;
      }
      try {
        const cardId = parts[1];
        const color = parts.find((x) => /^(RED|BLUE|GREEN|YELLOW)$/i.test(x))?.toUpperCase() || null;
        const pid = parts.find((x) => x.startsWith('pid='))?.slice(4) || server.hostId;
        const res = server.game.playCard(pid, cardId, color);
        console.log(res);
        const state = server.game.getStatePublic();
        const msg = MessageProtocol.create(MSG_TYPES.GAME_STATE, server.game.gameId, null, { state });
        await server.qm.publish(server.eventExchange, '', msg);
      } catch (e) {
        console.log('Error:', e.message);
      }
      return;
    }
    if (cmd === 'hand') {
      try {
        const pid = parts[1] || server.hostId;
        const h = server.game.getPlayerHand(pid);
        console.log(JSON.stringify(h, null, 2));
      } catch (e) {
        console.log('Error:', e.message);
      }
      return;
    }
    if (cmd === 'uno') {
      try {
        const pid = parts[1] || server.hostId;
        const res = server.game.announceUno(pid);
        console.log(res);
      } catch (e) {
        console.log('Error:', e.message);
      }
      return;
    }
    console.log('Comandos: state/players, start, hand [pid], draw [pid], play <cardId> [pid=...] [COLOR], uno [pid], quit');
  };

  rl.on('line', (line) => {
    if (!hostName && !server) {
      hostName = line.trim() || 'Host';
      initializeServer();
      return;
    }
    if (!ready) {
      pending.push(line);
      return;
    }
    processLine(line);
  });

  async function initializeServer() {
    server = new GameServer({
      gameId,
      hostId,
      hostName: hostName || 'Host',
      rabbit: { url: buildRabbitUrl() },
    });
    try {
      await server.start();
    } catch (e) {
      console.error('Error conectando:', e.message);
      process.exit(1);
    }
    const ip = getLocalIp();
    const port = process.env.RABBITMQ_PORT || 5672;
    console.log('\n=== HOST LISTO ===');
    console.log(`Game ID: ${server.getGameId()}`);
    console.log(`IP: ${ip}:${port}`);
    console.log('Comandos: state/players/list (ver), start (iniciar), hand/draw/play/uno (jugar), quit/exit');
    console.log('=================\n');
    ready = true;
    for (const p of pending) {
      await processLine(p);
    }
    pending.length = 0;
  }

  if (hostName) {
    await initializeServer();
  } else {
    console.log('Nombre del host: ');
  }
}

main().catch((err) => {
  console.error('Host error:', err);
  process.exit(1);
});
