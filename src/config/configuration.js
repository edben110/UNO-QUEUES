import os from 'os';
import 'dotenv/config';

// Patrones de adaptadores virtuales que NO son la red real de LAN
const VIRTUAL_IFACE = /(vEthernet|WSL|VirtualBox|VMware|Hyper-V|Loopback|Teredo|isatap|vpn|bluetooth|docker|veth|br-|virbr|Npcap|TAP|Wi-Fi Direct|Microsoft KM-TEST)/i;

function scoreInterface(name, net) {
  if (net.family !== 'IPv4' || net.internal) return -1;
  if (VIRTUAL_IFACE.test(name)) return -1;
  // Preferir Wi-Fi y Ethernet reales
  if (/wi-?fi|wireless|wlan/i.test(name)) return 3;
  if (/ethernet|eth|lan/i.test(name)) return 2;
  return 1; // cualquier otra interfaz no virtual
}

export function getLocalIp() {
  // Override manual: RABBITMQ_LAN_IP tiene prioridad
  if (process.env.RABBITMQ_LAN_IP) {
    return process.env.RABBITMQ_LAN_IP;
  }
  const nets = os.networkInterfaces();
  let best = null;
  let bestScore = -1;
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      const s = scoreInterface(name, net);
      if (s > bestScore) {
        bestScore = s;
        best = net.address;
      }
    }
  }
  return best || 'localhost';
}

export function buildRabbitUrl({ host, port, user, pass } = {}) {
  const h = host || process.env.RABBITMQ_HOST || 'localhost';
  const p = port || process.env.RABBITMQ_PORT || 5672;
  const u = user || process.env.RABBITMQ_USER || 'guest';
  const pa = pass || process.env.RABBITMQ_PASS || 'guest';
  return `amqp://${u}:${pa}@${h}:${p}/`;
}
