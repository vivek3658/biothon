// config/redis.js
const Redis = require('ioredis');

let redisClient = null;

function getRedisClient() {
  if (!redisClient) {
    redisClient = new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: process.env.REDIS_PORT || 6379,
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      }
    });

    redisClient.on('connect', () => {
      console.log('Redis client connected successfully.');
    });

    redisClient.on('error', (err) => {
      console.error('Redis connection error:', err.message);
    });
  }

  return redisClient;
}

module.exports = getRedisClient;