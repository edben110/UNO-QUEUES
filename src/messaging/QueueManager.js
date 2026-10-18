export class QueueManager {
  constructor(channel) {
    this.channel = channel;
  }

  async assertExchange(name, type = 'direct', options = { durable: false }) {
    await this.channel.assertExchange(name, type, options);
    return name;
  }

  async assertQueue(name = '', options = { exclusive: true }) {
    const q = await this.channel.assertQueue(name, options);
    return q.queue;
  }

  async bindQueue(queue, exchange, routingKey = '') {
    await this.channel.bindQueue(queue, exchange, routingKey);
  }

  async publish(exchange, routingKey, content, options = {}) {
    return this.channel.publish(exchange, routingKey, Buffer.from(JSON.stringify(content)), options);
  }

  async consume(queue, handler, options = {}) {
    return this.channel.consume(queue, (msg) => {
      if (!msg) return;
      let parsed;
      try {
        parsed = JSON.parse(msg.content.toString());
      } catch (e) {
        parsed = { raw: msg.content.toString() };
      }
      handler(parsed, msg);
    }, options);
  }
}
