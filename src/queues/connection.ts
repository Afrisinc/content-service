import { connect, type Channel, type ChannelModel } from 'amqplib';
import { env } from '@/config/env';
import { logger } from '@/utils/logger';
import {
  MAX_ATTEMPTS,
  QUEUE_DEFINITIONS,
  RETRY_DELAYS_MS,
  STUDIO_DLX,
  STUDIO_EXCHANGE,
  STUDIO_RETRY_EXCHANGE,
  deadLetterQueueName,
  retryQueueName,
} from './topology';

let connection: ChannelModel | null = null;
let channel: Channel | null = null;
let connecting: Promise<Channel> | null = null;
let closing = false;

async function establish(): Promise<Channel> {
  const created = await connect(env.RABBITMQ_URL, { heartbeat: env.RABBITMQ_HEARTBEAT_SECONDS });
  const createdChannel = await created.createChannel();

  created.on('error', err => logger.error({ error: String(err) }, 'RabbitMQ connection error'));
  created.on('close', () => {
    connection = null;
    channel = null;
    connecting = null;
    if (!closing) {
      logger.warn('RabbitMQ connection closed, will reconnect on next use');
    }
  });

  await assertTopology(createdChannel);

  connection = created;
  channel = createdChannel;
  return createdChannel;
}

export async function assertTopology(target: Channel): Promise<void> {
  await target.assertExchange(STUDIO_EXCHANGE, 'topic', { durable: true });
  await target.assertExchange(STUDIO_DLX, 'topic', { durable: true });
  await target.assertExchange(STUDIO_RETRY_EXCHANGE, 'topic', { durable: true });

  for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt += 1) {
    const delay = RETRY_DELAYS_MS[attempt];
    const name = retryQueueName(delay);
    await target.assertQueue(name, {
      durable: true,
      arguments: {
        'x-message-ttl': delay,
        'x-dead-letter-exchange': STUDIO_EXCHANGE,
      },
    });
    await target.bindQueue(name, STUDIO_RETRY_EXCHANGE, `${delay}.#`);
  }

  for (const definition of QUEUE_DEFINITIONS) {
    const dead = deadLetterQueueName(definition.name);
    await target.assertQueue(dead, { durable: true });
    await target.bindQueue(dead, STUDIO_DLX, definition.name);

    await target.assertQueue(definition.name, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': STUDIO_DLX,
        'x-dead-letter-routing-key': definition.name,
      },
    });
    await target.bindQueue(definition.name, STUDIO_EXCHANGE, definition.name);
  }
}

export async function getChannel(): Promise<Channel> {
  if (channel) {
    return channel;
  }
  if (!connecting) {
    connecting = establish().catch(err => {
      connecting = null;
      throw err;
    });
  }
  return connecting;
}

export async function closeQueues(): Promise<void> {
  closing = true;
  try {
    await channel?.close();
    await connection?.close();
  } catch (err) {
    logger.warn({ error: String(err) }, 'Error while closing RabbitMQ');
  } finally {
    channel = null;
    connection = null;
    connecting = null;
    closing = false;
  }
}

export async function queuesHealthy(): Promise<boolean> {
  try {
    const target = await getChannel();
    await target.checkExchange(STUDIO_EXCHANGE);
    return true;
  } catch {
    return false;
  }
}
