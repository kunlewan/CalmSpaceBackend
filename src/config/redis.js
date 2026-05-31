import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL;

if (!REDIS_URL) {
  console.warn('⚠️ REDIS_URL is not set. Using local Redis fallback.');
}

// Factory function to create Redis client
const createRedisClient = () => {
  if (REDIS_URL) {
    // Production (Render)
    return new Redis(REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      reconnectOnError: (err) => {
        console.error('Redis reconnecting due to:', err.message);
        return true;
      },
    });
  }

  // Local development
  return new Redis({
    host: '127.0.0.1',
    port: 6379,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
};

// Export the factory function (this is what your services need)
export { createRedisClient };

// Create default instances
export const redisClient = createRedisClient();
export const createBullMQClient = createRedisClient;

// Event listeners on default client
redisClient.on('connect', () => {
  console.log('✅ Redis Connected Successfully');
});

redisClient.on('ready', () => {
  console.log('✅ Redis is Ready');
});

redisClient.on('error', (err) => {
  console.error('[Redis] error:', err.message);
});