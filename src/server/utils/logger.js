const winston = require('winston');

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

winston.addColors(colors);

// Define which level to log based on environment
const level = () => {
  const env = process.env.NODE_ENV || 'development';
  const logLevel = process.env.LOG_LEVEL || 'info';
  const isDevelopment = env === 'development';
  return isDevelopment ? 'debug' : logLevel;
};

// Define format for logs
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => {
      const { timestamp, level, message, ...meta } = info;
      const metaString = Object.keys(meta).length ? JSON.stringify(meta) : '';
      return `${timestamp} [${level}]: ${message} ${metaString}`;
    }
  ),
);

// PII Redaction function
const redactPII = winston.format((info) => {
  const piiPatterns = [
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email
    /\b\d{3}-?\d{2}-?\d{4}\b/g, // SSN
    /\b\d{3}-?\d{3}-?\d{4}\b/g, // Phone
    /\b\d{16}\b/g, // Credit card (basic pattern)
  ];

  let message = info.message;
  piiPatterns.forEach(pattern => {
    message = message.replace(pattern, '[REDACTED]');
  });

  return {
    ...info,
    message
  };
});

// Define transports
const transports = [
  // Console transport
  new winston.transports.Console({
    format: winston.format.combine(
      redactPII(),
      format
    ),
  }),
];

// Add file transports for production
if (process.env.NODE_ENV === 'production') {
  transports.push(
    // Error log file
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: winston.format.combine(
        redactPII(),
        winston.format.timestamp(),
        winston.format.json()
      ),
    }),
    // Combined log file
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: winston.format.combine(
        redactPII(),
        winston.format.timestamp(),
        winston.format.json()
      ),
    })
  );
}

// Create the logger
const logger = winston.createLogger({
  level: level(),
  levels,
  transports,
  // Don't exit on handled exceptions
  exitOnError: false,
});

// Handle uncaught exceptions and unhandled promise rejections
if (process.env.NODE_ENV === 'production') {
  logger.exceptions.handle(
    new winston.transports.File({ filename: 'logs/exceptions.log' })
  );

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });
}

// Security-focused audit logger
const auditLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: 'logs/audit.log',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
    }),
  ],
});

// Helper function to log security events
const logSecurityEvent = (event, details = {}) => {
  auditLogger.info(event, {
    timestamp: new Date().toISOString(),
    event_type: 'security',
    ...details
  });
};

// Helper function to log user actions
const logUserAction = (userId, action, resource, details = {}) => {
  auditLogger.info('user_action', {
    timestamp: new Date().toISOString(),
    user_id: userId,
    action,
    resource,
    ...details
  });
};

module.exports = {
  logger,
  auditLogger,
  logSecurityEvent,
  logUserAction
};