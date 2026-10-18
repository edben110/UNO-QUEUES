import readline from 'readline';
import { GameClient } from './GameClient.js';
import { generateId } from '../utils/validators.js';

function ask(rl, q) {
  return new Promise((res) => rl.question(q, res));
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const gameId = await ask(rl, 'Game ID: ');
    const hostHost = await ask(rl, 'RabbitMQ host (IP of host): ');
    const playerName = await ask(rl, 'Your name: ');
    const client = new GameClient({
      gameId: gameId || process.env.GAME_ID,
      hostRabbitHost: hostHost || process.env.RABBITMQ_HOST,
      playerId: generateId('p'),
      playerName: playerName || 'Player',
    });
    await client.connect();
    console.log('Connected. Use commands: play <cardId> [color], draw, uno, state, quit');
    rl.on('line', async (line) => {
      const parts = line.trim().split(/\s+/);
      if (parts.length === 0 || parts[0] === '') return;
      const cmd = parts[0].toLowerCase();
      if (cmd === 'quit' || cmd === 'exit') {
        rl.close();
        process.exit(0);
      }
      if (cmd === 'state') {
        console.log(JSON.stringify(client.getState(), null, 2));
        return;
      }
      if (cmd === 'draw') {
        await client.drawCard();
        return;
      }
      if (cmd === 'uno') {
        await client.announceUno();
        return;
      }
      if (cmd === 'play') {
        if (parts.length < 2) {
          console.log('Usage: play <cardId> [RED|BLUE|GREEN|YELLOW]');
          return;
        }
        const cardId = parts[1];
        const color = parts[2] ? parts[2].toUpperCase() : null;
        await client.playCard(cardId, color);
        return;
      }
      console.log('Unknown command');
    });
  } catch (e) {
    console.error('Client error:', e);
    rl.close();
  }
}
main();
