import readline from 'readline';
import { exec } from 'child_process';
import { WebBridge } from '../web/WebBridge.js';
import '../config/configuration.js'; // carga .env

function ask(rl, q, def) {
  return new Promise((res) => {
    rl.question(q + (def ? ` [${def}]: ` : ': '), (ans) => res(ans.trim() || def || ''));
  });
}

function openBrowser(url) {
  const cmd = process.platform === 'win32' ? `start "" "${url}"`
    : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

// Cliente con interfaz web: abre una pagina local que habla con el host por RabbitMQ
// (mismo protocolo que el cliente de terminal, que sigue en `npm run start:client:cli`).
// un error de un jugador/canal no debe tumbar el proceso
process.on('unhandledRejection', (e) => console.error('[WARN]', e && e.message ? e.message : e));

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const gameId = process.env.GAME_ID || (await ask(rl, 'Game ID'));
  const rabbitHost = process.env.RABBITMQ_HOST || (await ask(rl, 'RabbitMQ host (IP del anfitrion)', 'localhost'));
  rl.close();
  if (!gameId) {
    console.log('Falta Game ID.');
    process.exit(1);
  }

  let port = Number(process.env.WEB_PORT || 3000);
  for (let attempt = 0; attempt < 10; attempt++, port++) {
    const bridge = new WebBridge({ gameId, port, rabbitHost });
    try {
      await bridge.listen();
      const url = `http://localhost:${port}`;
      console.log(`\nUNO.js listo. Abre ${url} (Ctrl+C para salir)`);
      console.log(`Partida: ${gameId} | RabbitMQ: ${rabbitHost}`);
      if (!process.env.NO_OPEN) openBrowser(url);
      return;
    } catch (e) {
      if (e.code !== 'EADDRINUSE') throw e;
    }
  }
  console.error('No hay puertos libres para la interfaz web.');
  process.exit(1);
}

main().catch((e) => {
  console.error('Error del cliente:', e.message || e);
  process.exit(1);
});
