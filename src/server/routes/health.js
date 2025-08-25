const express = require('express');
const { getPool } = require('../config/database');
const { getRedisClient } = require('../config/redis');
const { asyncHandler } = require('../middleware/errorMiddleware');

const router = express.Router();

// Basic health check
router.get('/', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Detailed health check with dependencies
router.get('/detailed', 
  asyncHandler(async (req, res) => {
    const health = {
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      services: {}
    };

    // Check database
    try {
      const pool = getPool();
      const start = Date.now();
      await pool.query('SELECT 1');
      const duration = Date.now() - start;
      
      health.services.database = {
        status: 'OK',
        responseTime: `${duration}ms`
      };
    } catch (error) {
      health.status = 'DEGRADED';
      health.services.database = {
        status: 'ERROR',
        error: error.message
      };
    }

    // Check Redis
    try {
      const client = getRedisClient();
      const start = Date.now();
      await client.ping();
      const duration = Date.now() - start;
      
      health.services.redis = {
        status: 'OK',
        responseTime: `${duration}ms`
      };
    } catch (error) {
      health.status = 'DEGRADED';
      health.services.redis = {
        status: 'ERROR',
        error: error.message
      };
    }

    // Check memory usage
    const memUsage = process.memoryUsage();
    health.services.memory = {
      status: 'OK',
      usage: {
        rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
        external: `${Math.round(memUsage.external / 1024 / 1024)}MB`
      }
    };

    const statusCode = health.status === 'OK' ? 200 : 503;
    res.status(statusCode).json(health);
  })
);

// Readiness check (for Kubernetes/ECS)
router.get('/ready',
  asyncHandler(async (req, res) => {
    try {
      // Check if all critical services are ready
      const pool = getPool();
      await pool.query('SELECT 1');
      
      const client = getRedisClient();
      await client.ping();

      res.json({
        status: 'READY',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(503).json({
        status: 'NOT_READY',
        timestamp: new Date().toISOString(),
        error: error.message
      });
    }
  })
);

// Liveness check (for Kubernetes/ECS)
router.get('/live', (req, res) => {
  res.json({
    status: 'ALIVE',
    timestamp: new Date().toISOString(),
    pid: process.pid
  });
});

module.exports = router;