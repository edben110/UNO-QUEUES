import { GameServer } from './GameServer.js';
import { WebBridge } from '../web/WebBridge.js';
import { generateId } from '../utils/validators.js';
import { getLocalIp, buildRabbitUrl } from '../config/configuration.js';

// Lanzador del host con interfaz web. (La version de terminal sigue en hostCli.js)
// un error de un jugador/canal no debe tumbar el proceso
process.on('unhandledRejection', (e) => console.error('[WARN]', e && e.message ? e.message : e));

async function main() {
  const gameId = process.env.GAME_ID || generateId('game');
  const port = Number(process.env.WEB_PORT || 3000);
  const server = new GameServer({
    gameId,
    hostName: process.env.HOST_NAME || 'Host',
    rabbit: { url: buildRabbitUrl() },
  });
  try {
    await server.start();
  } catch (e) {
    console.error('Error conectando a RabbitMQ:', e.message);
    process.exit(1);
  }
  const bridge = new WebBridge({ server, gameId, port, rabbitHost: process.env.RABBITMQ_HOST });
  await bridge.listen();
  const ip = getLocalIp();
  console.log('\n=========== UNO.js HOST (web) ===========');
  console.log(`Game ID:        ${gameId}`);
  console.log(`Tu (anfitrion): http://localhost:${port}`);
  console.log(`Otros jugadores: http://${ip}:${port}`);
  console.log(`Tiempo por turno: ${server.turnTimeoutMs / 1000}s`);
  console.log('Ctrl+C para cerrar.\n');

  const shutdown = async () => {
    await bridge.close();
    await server.stop().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Host error:', err);
  process.exit(1);
});
