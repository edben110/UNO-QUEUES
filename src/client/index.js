import readline from 'readline';
import { GameClient } from './GameClient.js';
import { generateId } from '../utils/validators.js';

function ask(rl, q) {
  return new Promise((res) => rl.question(q, res));
}

function formatState(state, playerId) {
  if (!state) return 'No state received yet.';
  const players = state.players || [];
  const top = state.topCard;
  let out = '';
  out += `Game: ${state.gameId} | Status: ${state.status}\n`;
  out += `Direction: ${state.direction === 1 ? 'FORWARD' : 'REVERSE'} | Draw2: ${state.draw2Stack} | Draw4: ${state.draw4Stack}\n`;
  out += `Current player: ${state.currentPlayerId || 'N/A'}\n`;
  out += `Top card: ${top ? `${top.type}${top.value !== null ? ' ' + top.value : ''} ${top.color}` : 'N/A'} | Active color: ${state.currentColor || 'N/A'}\n`;
  out += '\nPlayers:\n';
  players.forEach((p, i) => {
    const marker = p.id === state.currentPlayerId ? '->' : '  ';
    const you = p.id === playerId ? ' (YOU)' : '';
    out += `${marker} ${i + 1}. ${p.name}${you} | Cards: ${p.handSize} | UNO: ${p.unoAnnounced ? 'YES' : 'NO'} | ID: ${p.id}\n`;
  });
  return out.trim();
}

function formatPlayers(state, playerId) {
  if (!state) return 'No state received yet.';
  const players = state.players || [];
  const current = state.currentPlayerId;
  let order = players.slice();
  if (current) {
    const idx = order.findIndex((p) => p.id === current);
    if (idx >= 0) {
      order = order.slice(idx).concat(order.slice(0, idx));
    }
  }
  let out = 'Turn order (current first):\n';
  order.forEach((p, i) => {
    const pos = i === 0 ? 'CURRENT' : i === 1 ? 'NEXT' : `+${i}`;
    const you = p.id === playerId ? ' (YOU)' : '';
    out += `  ${pos}: ${p.name}${you} | Cards: ${p.handSize} | ID: ${p.id}\n`;
  });
  return out.trim();
}

function formatHand(client, playerId) {
  const state = client.getState();
  const me = state?.players?.find((p) => p.id === playerId);
  if (!me) return 'No data.';
  if (!client.handCache) {
    client.handCache = [];
  }
  const hand = client.handCache || [];
  if (hand.length === 0 && state) {
    // try to show from last received? client stores state only
  }
  // client doesn't store full hand; we show what we know
  return `You have ${me.handSize} cards. Use state to see top/current. To play, get cardId from game state context or just type IDs shown in future updates.`;
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const envGame = process.env.GAME_ID;
    const envHost = process.env.RABBITMQ_HOST;
    const gameId = envGame || (await ask(rl, 'Game ID: '));
    const hostHost = envHost || (await ask(rl, 'RabbitMQ host (IP of host): '));
    const playerName = await ask(rl, 'Your name: ');
    const playerId = generateId('p');
    const client = new GameClient({
      gameId: gameId,
      hostRabbitHost: hostHost,
      playerId,
      playerName: playerName || 'Player',
    });
    await client.connect();
    console.log('\nConnected. Commands: state, players/list, hand, draw, play <cardId> [RED|BLUE|GREEN|YELLOW], uno, ping, quit\n');
    rl.on('line', async (line) => {
      const parts = line.trim().split(/\s+/);
      if (parts.length === 0 || parts[0] === '') return;
      const cmd = parts[0].toLowerCase();
      if (cmd === 'quit' || cmd === 'exit') {
        rl.close();
        process.exit(0);
      }
      if (cmd === 'state') {
        console.log(formatState(client.getState(), client.playerId));
        return;
      }
      if (cmd === 'players' || cmd === 'list' || cmd === 'turns' || cmd === 'who') {
        console.log(formatPlayers(client.getState(), client.playerId));
        return;
      }
      if (cmd === 'hand') {
        console.log(formatHand(client, client.playerId));
        return;
      }
      if (cmd === 'ping') {
        console.log('Pong');
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
      console.log('Unknown command. Try: state, players, hand, draw, play, uno, quit');
    });
  } catch (e) {
    console.error('Client error:', e);
    rl.close();
  }
}
main();
