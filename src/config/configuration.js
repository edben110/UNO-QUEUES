import os from 'os';

export function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

export function buildRabbitUrl({ host, port, user, pass } = {}) {
  const h = host || process.env.RABBITMQ_HOST || 'localhost';
  const p = port || process.env.RABBITMQ_PORT || 5672;
  const u = user || process.env.RABBITMQ_USER || 'guest';
  const pa = pass || process.env.RABBITMQ_PASS || 'guest';
  return `amqp://${u}:${pa}@${h}:${p}/`;
}
