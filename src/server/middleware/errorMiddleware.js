const { logger } = require('../utils/logger');

// 404 handler
const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

// Global error handler
const errorHandler = (err, req, res, next) => {
  // Default to 500 server error
  let statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  let message = err.message;

  // Log error details
  logger.error('Error occurred:', {
    error: err.message,
    stack: process.env.NODE_ENV === 'production' ? '🥞' : err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id || 'anonymous'
  });

  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation Error';
    
    // Extract validation errors
    const errors = {};
    Object.keys(err.errors || {}).forEach(key => {
      errors[key] = err.errors[key].message;
    });

    return res.status(statusCode).json({
      success: false,
      message,
      errors,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
  }

  // Handle PostgreSQL errors
  if (err.code) {
    switch (err.code) {
      case '23505': // Unique violation
        statusCode = 409;
        message = 'Resource already exists';
        break;
      case '23503': // Foreign key violation
        statusCode = 400;
        message = 'Invalid reference to related resource';
        break;
      case '23502': // Not null violation
        statusCode = 400;
        message = 'Required field missing';
        break;
      case '22P02': // Invalid text representation
        statusCode = 400;
        message = 'Invalid data format';
        break;
      case '42P01': // Undefined table
        statusCode = 500;
        message = 'Database schema error';
        break;
      default:
        logger.error('Unhandled database error:', { code: err.code, detail: err.detail });
        statusCode = 500;
        message = 'Database error';
    }
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  }

  // Handle Multer errors (file upload)
  if (err.code === 'LIMIT_FILE_SIZE') {
    statusCode = 413;
    message = 'File too large';
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    statusCode = 400;
    message = 'Unexpected file field';
  }

  // Handle rate limiting errors
  if (err.message && err.message.includes('Too Many Requests')) {
    statusCode = 429;
    message = 'Too many requests, please try again later';
  }

  // Sanitize error message for production
  if (process.env.NODE_ENV === 'production' && statusCode === 500) {
    message = 'Something went wrong!';
  }

  // Send error response
  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    ...(statusCode < 500 && { timestamp: new Date().toISOString() })
  });
};

// Async error handler wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  notFound,
  errorHandler,
  asyncHandler
};