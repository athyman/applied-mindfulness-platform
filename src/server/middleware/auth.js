const jwt = require('jsonwebtoken');
const { getPool } = require('../config/database');
const { getSessionData } = require('../config/redis');
const { logger, logSecurityEvent } = require('../utils/logger');

// Verify JWT token and load user
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      logSecurityEvent('auth_missing_token', { 
        ip: req.ip, 
        path: req.path 
      });
      return res.status(401).json({ 
        success: false, 
        message: 'Access token required' 
      });
    }

    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if session exists in Redis
    const sessionData = await getSessionData(decoded.sessionId);
    if (!sessionData) {
      logSecurityEvent('auth_invalid_session', { 
        userId: decoded.userId,
        ip: req.ip 
      });
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid session' 
      });
    }

    // Load user from database
    const pool = getPool();
    const userResult = await pool.query(
      `SELECT u.*, ur.name as role_name, vl.name as verification_level
       FROM users u 
       JOIN user_roles ur ON u.role_id = ur.id
       JOIN verification_levels vl ON u.verification_level_id = vl.id
       WHERE u.id = $1 AND u.is_active = true AND u.deleted_at IS NULL`,
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      logSecurityEvent('auth_user_not_found', { 
        userId: decoded.userId,
        ip: req.ip 
      });
      return res.status(401).json({ 
        success: false, 
        message: 'User not found or inactive' 
      });
    }

    const user = userResult.rows[0];
    
    // Attach user and session to request
    req.user = {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role_name,
      verificationLevel: user.verification_level,
      preferences: user.preferences,
      sessionId: decoded.sessionId
    };

    // Update last activity in session
    sessionData.lastActivity = new Date().toISOString();
    await require('../config/redis').setSessionData(decoded.sessionId, sessionData, 86400);

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      logSecurityEvent('auth_token_expired', { ip: req.ip });
      return res.status(401).json({ 
        success: false, 
        message: 'Token expired' 
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      logSecurityEvent('auth_invalid_token', { ip: req.ip });
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid token' 
      });
    }

    logger.error('Authentication error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Authentication error' 
    });
  }
};

// Optional authentication (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    req.user = null;
    return next();
  }

  // Use the main auth middleware but don't fail on error
  authenticateToken(req, res, (error) => {
    if (error) {
      req.user = null;
    }
    next();
  });
};

// Role-based authorization
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required' 
      });
    }

    const userRole = req.user.role;
    const allowedRoles = Array.isArray(roles) ? roles : [roles];

    if (!allowedRoles.includes(userRole)) {
      logSecurityEvent('auth_insufficient_permissions', {
        userId: req.user.id,
        userRole,
        requiredRoles: allowedRoles,
        ip: req.ip,
        path: req.path
      });
      
      return res.status(403).json({ 
        success: false, 
        message: 'Insufficient permissions' 
      });
    }

    next();
  };
};

// Verification level requirement
const requireVerification = (minLevel) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required' 
      });
    }

    const verificationLevels = {
      'basic': 1,
      'identity': 2,
      'professional': 3
    };

    const userLevel = verificationLevels[req.user.verificationLevel] || 0;
    const requiredLevel = verificationLevels[minLevel] || 1;

    if (userLevel < requiredLevel) {
      logSecurityEvent('auth_insufficient_verification', {
        userId: req.user.id,
        userLevel: req.user.verificationLevel,
        requiredLevel: minLevel,
        ip: req.ip
      });

      return res.status(403).json({ 
        success: false, 
        message: 'Higher verification level required',
        requiredVerification: minLevel
      });
    }

    next();
  };
};

// Check if user owns resource or has admin privileges
const requireOwnershipOrAdmin = (resourceUserIdField = 'user_id') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required' 
      });
    }

    // Admins can access anything
    if (req.user.role === 'admin') {
      return next();
    }

    // Check ownership based on resource
    const resourceUserId = req.params.userId || req.body[resourceUserIdField] || req.query.userId;
    
    if (resourceUserId && resourceUserId !== req.user.id) {
      logSecurityEvent('auth_ownership_violation', {
        userId: req.user.id,
        attemptedResource: resourceUserId,
        ip: req.ip
      });

      return res.status(403).json({ 
        success: false, 
        message: 'Access denied - insufficient permissions' 
      });
    }

    next();
  };
};

// Rate limiting per user
const userRateLimit = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  const attempts = new Map();

  return (req, res, next) => {
    if (!req.user) {
      return next();
    }

    const userId = req.user.id;
    const now = Date.now();
    const windowStart = now - windowMs;

    // Clean old entries
    if (attempts.has(userId)) {
      const userAttempts = attempts.get(userId);
      userAttempts.times = userAttempts.times.filter(time => time > windowStart);
    }

    // Get or create user attempt record
    const userAttempts = attempts.get(userId) || { times: [] };
    
    // Check if user has exceeded rate limit
    if (userAttempts.times.length >= maxRequests) {
      logSecurityEvent('rate_limit_exceeded', {
        userId,
        attempts: userAttempts.times.length,
        ip: req.ip
      });

      return res.status(429).json({
        success: false,
        message: 'Too many requests, please slow down'
      });
    }

    // Record this attempt
    userAttempts.times.push(now);
    attempts.set(userId, userAttempts);

    next();
  };
};

module.exports = {
  authenticateToken,
  optionalAuth,
  requireRole,
  requireVerification,
  requireOwnershipOrAdmin,
  userRateLimit
};