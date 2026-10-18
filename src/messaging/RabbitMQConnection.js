import amqp from 'amqplib';
import { generateId } from '../utils/validators.js';

export class RabbitMQConnection {
  constructor(config = {}) {
    this.url = config.url || process.env.RABBITMQ_URL || `amqp://${process.env.RABBITMQ_USER || 'guest'}:${process.env.RABBITMQ_PASS || 'guest'}@${process.env.RABBITMQ_HOST || 'localhost'}:${process.env.RABBITMQ_PORT || 5672}/`;
    this.connection = null;
    this.channel = null;
    this.connected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = config.maxReconnectAttempts || 5;
    this.reconnectDelay = config.reconnectDelay || 2000;
  }

  async connect() {
    if (this.connected && this.connection) return this.connection;
    try {
      this.connection = await amqp.connect(this.url);
      this.channel = await this.connection.createChannel();
      this.connected = true;
      this.reconnectAttempts = 0;
      this.connection.on('close', () => {
        this.connected = false;
        this._scheduleReconnect();
      });
      this.connection.on('error', (err) => {
        console.error('AMQP connection error:', err.message);
      });
      return this.connection;
    } catch (err) {
      this.connected = false;
      throw err;
    }
  }

  async disconnect() {
    if (this.channel) {
      try { await this.channel.close(); } catch (e) {}
    }
    if (this.connection) {
      try { await this.connection.close(); } catch (e) {}
    }
    this.connected = false;
  }

  _scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;
    setTimeout(() => {
      this.reconnectAttempts++;
      this.connect().catch(() => {});
    }, this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts));
  }

  getChannel() {
    return this.channel;
  }
}
