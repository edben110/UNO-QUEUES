import { GameServer } from './GameServer.js';
import { generateId } from '../utils/validators.js';
import readline from 'readline';

function getLocalIp() {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const hostName = await new Promise((res) => rl.question('Host name: ', res));
  rl.close();
  const gameId = process.env.GAME_ID || generateId('game');
  const hostId = generateId('host');
  const server = new GameServer({
    gameId,
    hostId,
    hostName: hostName || 'Host',
    rabbit: {
      url: process.env.RABBITMQ_URL || `amqp://${process.env.RABBITMQ_USER || 'guest'}:${process.env.RABBITMQ_PASS || 'guest'}@${process.env.RABBITMQ_HOST || 'localhost'}:${process.env.RABBITMQ_PORT || 5672}/`,
    },
  });
  await server.start();
  const ip = getLocalIp();
  const port = process.env.RABBITMQ_PORT || 5672;
  console.log('\n=== HOST READY ===');
  console.log(`Game ID: ${server.getGameId()}`);
  console.log(`Host ID: ${hostId}`);
  console.log(`Connect using: RABBITMQ_HOST=${ip} GAME_ID=${server.getGameId()}`);
  console.log(`AMQP URL: amqp://${process.env.RABBITMQ_USER || 'guest'}:${process.env.RABBITMQ_PASS || 'guest'}@${ip}:${port}/`);
  console.log('==================\n');
}
main().catch((e) => {
  console.error('Host error:', e);
  process.exit(1);
});
