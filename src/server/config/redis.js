const redis = require('redis');
const { logger } = require('../utils/logger');

let client;

const connectRedis = async () => {
  try {
    const config = {
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      password: process.env.REDIS_PASSWORD || undefined,
      database: parseInt(process.env.REDIS_DB) || 0,
      socket: {
        connectTimeout: 5000,
        lazyConnect: true,
      },
      retry_strategy: (options) => {
        if (options.error && options.error.code === 'ECONNREFUSED') {
          logger.error('Redis server refused connection');
          return new Error('Redis server refused connection');
        }
        if (options.total_retry_time > 1000 * 60 * 60) {
          logger.error('Redis retry time exhausted');
          return new Error('Retry time exhausted');
        }
        if (options.attempt > 10) {
          logger.error('Redis max attempts reached');
          return undefined;
        }
        // Exponential backoff
        return Math.min(options.attempt * 100, 3000);
      }
    };

    client = redis.createClient(config);

    client.on('error', (err) => {
      logger.error('Redis client error:', err);
    });

    client.on('connect', () => {
      logger.info('Redis client connected');
    });

    client.on('ready', () => {
      logger.info('Redis client ready');
    });

    client.on('end', () => {
      logger.info('Redis client disconnected');
    });

    await client.connect();
    
    // Test the connection
    await client.ping();
    
    logger.info('Redis connected successfully');
    return client;
  } catch (error) {
    logger.error('Redis connection failed:', error);
    throw error;
  }
};

const getRedisClient = () => {
  if (!client || !client.isOpen) {
    throw new Error('Redis client not initialized or not connected. Call connectRedis() first.');
  }
  return client;
};

const closeRedis = async () => {
  if (client && client.isOpen) {
    await client.quit();
    logger.info('Redis connection closed');
  }
};

// Helper functions for common Redis operations
const setCache = async (key, value, expireInSeconds = 3600) => {
  try {
    const redisClient = getRedisClient();
    await redisClient.setEx(key, expireInSeconds, JSON.stringify(value));
  } catch (error) {
    logger.error('Redis set error:', error);
    throw error;
  }
};

const getCache = async (key) => {
  try {
    const redisClient = getRedisClient();
    const value = await redisClient.get(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    logger.error('Redis get error:', error);
    return null; // Return null on error to allow fallback
  }
};

const deleteCache = async (key) => {
  try {
    const redisClient = getRedisClient();
    await redisClient.del(key);
  } catch (error) {
    logger.error('Redis delete error:', error);
  }
};

const setSessionData = async (sessionId, data, expireInSeconds = 86400) => {
  await setCache(`session:${sessionId}`, data, expireInSeconds);
};

const getSessionData = async (sessionId) => {
  return await getCache(`session:${sessionId}`);
};

const deleteSessionData = async (sessionId) => {
  await deleteCache(`session:${sessionId}`);
};

module.exports = {
  connectRedis,
  getRedisClient,
  closeRedis,
  setCache,
  getCache,
  deleteCache,
  setSessionData,
  getSessionData,
  deleteSessionData
};