const IORedis = require('ioredis');
const config = require('./env');

/**
 * BullMQ requires `maxRetriesPerRequest: null` on its IORedis connections.
 */
function createRedisConnection(connectionName = 'bullmq') {
  const connection = new IORedis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password || undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    connectionName,
    retryStrategy(times) {
      const delay = Math.min(times * 500, 5000);
      return delay;
    },
  });

  connection.on('connect', () => {
    console.log(`[Redis:${connectionName}] Connected to ${config.redis.host}:${config.redis.port}`);
  });

  connection.on('error', (err) => {
    console.error(`[Redis:${connectionName}] Connection error:`, err.message);
  });

  return connection;
}

module.exports = {
  createRedisConnection,
};
