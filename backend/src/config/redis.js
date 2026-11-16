const IORedis = require('ioredis');
const config = require('./env');

/**
 * BullMQ requires `maxRetriesPerRequest: null` on its IORedis connections.
 * Supports both REDIS_URL (used by Railway / Render) and REDIS_HOST + REDIS_PORT.
 */
function createRedisConnection(connectionName = 'bullmq') {
  const redisUrl = process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL;

  const options = {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    connectionName,
    retryStrategy(times) {
      return Math.min(times * 500, 5000);
    },
  };

  const connection = redisUrl
    ? new IORedis(redisUrl, options)
    : new IORedis({
        ...options,
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password || undefined,
      });

  connection.on('connect', () => {
    console.log(
      `[Redis:${connectionName}] Connected (${redisUrl ? 'via REDIS_URL' : `${config.redis.host}:${config.redis.port}`})`
    );
  });

  connection.on('error', (err) => {
    console.error(`[Redis:${connectionName}] Connection error:`, err.message);
  });

  return connection;
}

module.exports = {
  createRedisConnection,
};
