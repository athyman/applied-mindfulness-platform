const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { getPool } = require('../config/database');
const { setSessionData, deleteSessionData } = require('../config/redis');
const { logger, logSecurityEvent, logUserAction } = require('../utils/logger');

class AuthService {
  constructor() {
    this.saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    this.jwtSecret = process.env.JWT_SECRET;
    this.jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;
    this.jwtExpiresIn = process.env.JWT_EXPIRES_IN || '15m';
    this.refreshExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
  }

  async hashPassword(password) {
    return bcrypt.hash(password, this.saltRounds);
  }

  async comparePassword(password, hash) {
    return bcrypt.compare(password, hash);
  }

  generateTokens(user, sessionId) {
    const payload = {
      userId: user.id,
      email: user.email,
      role: user.role_name || user.role,
      sessionId
    };

    const accessToken = jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.jwtExpiresIn
    });

    const refreshToken = jwt.sign(
      { userId: user.id, sessionId },
      this.jwtRefreshSecret,
      { expiresIn: this.refreshExpiresIn }
    );

    return { accessToken, refreshToken };
  }

  async registerUser(userData) {
    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const {
        email,
        password,
        firstName,
        lastName,
        phone,
        dateOfBirth,
        timezone = 'UTC'
      } = userData;

      // Check if user already exists
      const existingUser = await client.query(
        'SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL',
        [email.toLowerCase()]
      );

      if (existingUser.rows.length > 0) {
        throw new Error('User already exists with this email');
      }

      // Hash password
      const passwordHash = await this.hashPassword(password);

      // Create user
      const userResult = await client.query(`
        INSERT INTO users (
          email, password_hash, first_name, last_name, phone, 
          date_of_birth, timezone, role_id, verification_level_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 1, 1)
        RETURNING id, email, first_name, last_name, created_at
      `, [
        email.toLowerCase(),
        passwordHash,
        firstName,
        lastName,
        phone,
        dateOfBirth,
        timezone
      ]);

      const user = userResult.rows[0];

      // Record initial consent (basic registration consent)
      await client.query(`
        INSERT INTO user_consents (
          user_id, consent_type, consent_version, consent_given, ip_address
        ) VALUES ($1, 'registration', '1.0', true, $2)
      `, [user.id, userData.ipAddress]);

      await client.query('COMMIT');

      logUserAction(user.id, 'register', 'user', {
        email: email.toLowerCase(),
        registrationMethod: 'email'
      });

      return {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        createdAt: user.created_at
      };

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async authenticateUser(email, password, context = {}) {
    const pool = getPool();

    try {
      // Get user with role and verification info
      const result = await pool.query(`
        SELECT u.*, ur.name as role_name, vl.name as verification_level
        FROM users u
        JOIN user_roles ur ON u.role_id = ur.id
        JOIN verification_levels vl ON u.verification_level_id = vl.id
        WHERE u.email = $1 AND u.is_active = true AND u.deleted_at IS NULL
      `, [email.toLowerCase()]);

      if (result.rows.length === 0) {
        logSecurityEvent('auth_failed_user_not_found', {
          email: email.toLowerCase(),
          ip: context.ip
        });
        throw new Error('Invalid credentials');
      }

      const user = result.rows[0];

      // Check password
      const isValidPassword = await this.comparePassword(password, user.password_hash);
      if (!isValidPassword) {
        logSecurityEvent('auth_failed_invalid_password', {
          userId: user.id,
          email: email.toLowerCase(),
          ip: context.ip
        });
        throw new Error('Invalid credentials');
      }

      // Check if MFA is required based on context
      const requiresMFA = this.requiresMFA(context, user);
      if (requiresMFA && !context.mfaToken) {
        logSecurityEvent('auth_mfa_required', {
          userId: user.id,
          ip: context.ip
        });
        return {
          requiresMFA: true,
          message: 'MFA token required'
        };
      }

      // Verify MFA if provided
      if (context.mfaToken && !await this.verifyMFA(user, context.mfaToken)) {
        logSecurityEvent('auth_failed_invalid_mfa', {
          userId: user.id,
          ip: context.ip
        });
        throw new Error('Invalid MFA token');
      }

      // Create session
      const sessionId = uuidv4();
      const sessionData = {
        userId: user.id,
        email: user.email,
        role: user.role_name,
        verificationLevel: user.verification_level,
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        ip: context.ip,
        userAgent: context.userAgent
      };

      // Store session in Redis (24 hour expiry)
      await setSessionData(sessionId, sessionData, 86400);

      // Generate tokens
      const tokens = this.generateTokens(user, sessionId);

      // Update last login
      await pool.query(
        'UPDATE users SET last_login = NOW() WHERE id = $1',
        [user.id]
      );

      logUserAction(user.id, 'login', 'user', {
        ip: context.ip,
        userAgent: context.userAgent
      });

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role: user.role_name,
          verificationLevel: user.verification_level,
          preferences: user.preferences
        },
        tokens,
        sessionId
      };

    } catch (error) {
      logger.error('Authentication error:', error);
      throw error;
    }
  }

  async refreshTokens(refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, this.jwtRefreshSecret);
      const { userId, sessionId } = decoded;

      // Check if session still exists
      const sessionData = await require('../config/redis').getSessionData(sessionId);
      if (!sessionData) {
        throw new Error('Invalid session');
      }

      // Get updated user info
      const pool = getPool();
      const result = await pool.query(`
        SELECT u.*, ur.name as role_name, vl.name as verification_level
        FROM users u
        JOIN user_roles ur ON u.role_id = ur.id
        JOIN verification_levels vl ON u.verification_level_id = vl.id
        WHERE u.id = $1 AND u.is_active = true AND u.deleted_at IS NULL
      `, [userId]);

      if (result.rows.length === 0) {
        throw new Error('User not found');
      }

      const user = result.rows[0];

      // Generate new tokens with same session
      const tokens = this.generateTokens(user, sessionId);

      // Update session activity
      sessionData.lastActivity = new Date().toISOString();
      await setSessionData(sessionId, sessionData, 86400);

      logUserAction(userId, 'refresh_token', 'session', {
        sessionId
      });

      return {
        success: true,
        tokens
      };

    } catch (error) {
      if (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError') {
        throw new Error('Invalid refresh token');
      }
      throw error;
    }
  }

  async logout(sessionId) {
    try {
      const sessionData = await require('../config/redis').getSessionData(sessionId);
      if (sessionData) {
        await deleteSessionData(sessionId);
        
        logUserAction(sessionData.userId, 'logout', 'session', {
          sessionId
        });
      }

      return { success: true };
    } catch (error) {
      logger.error('Logout error:', error);
      throw error;
    }
  }

  requiresMFA(context, user) {
    // Require MFA for sensitive operations
    if (context.operation === 'payment' || context.operation === 'admin_access') {
      return true;
    }

    // Require MFA for elevated roles
    if (user.role_name === 'coach' || user.role_name === 'admin') {
      return true;
    }

    // Require MFA based on risk score
    if (context.riskScore && context.riskScore > 0.7) {
      return true;
    }

    return false;
  }

  async verifyMFA(user, token) {
    // TODO: Implement TOTP verification
    // For now, return true as placeholder
    // In production, this would verify against user's TOTP secret
    return true;
  }

  async requestPasswordReset(email) {
    const pool = getPool();

    try {
      const result = await pool.query(
        'SELECT id, email FROM users WHERE email = $1 AND is_active = true AND deleted_at IS NULL',
        [email.toLowerCase()]
      );

      if (result.rows.length === 0) {
        // Don't reveal whether user exists
        return { success: true, message: 'If an account exists, password reset email will be sent' };
      }

      const user = result.rows[0];
      const resetToken = uuidv4();

      // Store reset token in Redis with 1 hour expiry
      await require('../config/redis').setCache(`password_reset:${resetToken}`, {
        userId: user.id,
        email: user.email,
        createdAt: new Date().toISOString()
      }, 3600);

      logSecurityEvent('password_reset_requested', {
        userId: user.id,
        email: email.toLowerCase()
      });

      // TODO: Send password reset email
      logger.info('Password reset requested', { userId: user.id, resetToken });

      return { 
        success: true, 
        message: 'If an account exists, password reset email will be sent',
        resetToken // Remove in production
      };

    } catch (error) {
      logger.error('Password reset request error:', error);
      throw error;
    }
  }

  async resetPassword(resetToken, newPassword) {
    const pool = getPool();

    try {
      // Get reset token data
      const resetData = await require('../config/redis').getCache(`password_reset:${resetToken}`);
      if (!resetData) {
        throw new Error('Invalid or expired reset token');
      }

      // Hash new password
      const passwordHash = await this.hashPassword(newPassword);

      // Update password
      await pool.query(
        'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
        [passwordHash, resetData.userId]
      );

      // Delete reset token
      await require('../config/redis').deleteCache(`password_reset:${resetToken}`);

      logSecurityEvent('password_reset_completed', {
        userId: resetData.userId
      });

      return { success: true, message: 'Password reset successfully' };

    } catch (error) {
      logger.error('Password reset error:', error);
      throw error;
    }
  }
}

module.exports = new AuthService();