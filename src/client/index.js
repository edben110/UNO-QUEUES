import readline from 'readline';
import { GameClient } from './GameClient.js';
import { TerminalInterface } from './TerminalInterface.js';
import { generateId } from '../utils/validators.js';

function ask(rl, q, def) {
  return new Promise((res) => {
    rl.question(q + (def ? ` [${def}]: ` : ': '), (ans) => {
      res(ans.trim() || def || '');
    });
  });
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const envGame = process.env.GAME_ID;
    const envHost = process.env.RABBITMQ_HOST;
    const gameId = envGame || (await ask(rl, 'Game ID'));
    const hostHost = envHost || (await ask(rl, 'RabbitMQ host (IP del anfitrion)', 'localhost'));
    const playerName = (await ask(rl, 'Tu nombre', 'Jugador')) || 'Jugador';

    if (!gameId) {
      console.log('Falta Game ID.');
      rl.close();
      return;
    }

    const client = new GameClient({
      gameId,
      hostRabbitHost: hostHost,
      playerId: generateId('p'),
      playerName,
    });

    const ui = new TerminalInterface(rl, client);

    await client.connect();
    ui.setMessage('OK', `Conectado como ${playerName}`);
    ui.render();

    // pedir mano inicial cuando llegue el estado
    client.on('update', async () => {
      if (client.state && client.state.status !== 'WAITING' && (!client.hand || client.hand.length === 0)) {
        await client.requestHand().catch(() => {});
      }
    });
    await client.requestHand().catch(() => {});
  } catch (e) {
    console.error('Error del cliente:', e.message || e);
    rl.close();
    process.exit(1);
  }
}

main();
