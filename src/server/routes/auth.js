const express = require('express');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const authService = require('../services/authService');
const { authenticateToken } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { logger } = require('../utils/logger');

const router = express.Router();

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // limit each IP to 3 password reset requests per hour
  message: {
    success: false,
    message: 'Too many password reset attempts, please try again later.'
  },
});

// Validation middleware
const registerValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain uppercase, lowercase, number and special character'),
  body('firstName')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('First name is required (max 50 characters)'),
  body('lastName')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Last name is required (max 50 characters)'),
  body('phone')
    .optional()
    .isMobilePhone()
    .withMessage('Valid phone number required'),
  body('dateOfBirth')
    .optional()
    .isISO8601()
    .withMessage('Valid birth date required (YYYY-MM-DD)'),
  body('timezone')
    .optional()
    .isIn([
      'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 
      'America/Los_Angeles', 'Europe/London', 'Europe/Paris', 'Asia/Tokyo'
    ])
    .withMessage('Valid timezone required'),
];

const loginValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
];

const passwordResetValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
];

const resetPasswordValidation = [
  body('resetToken')
    .isUUID()
    .withMessage('Valid reset token is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain uppercase, lowercase, number and special character'),
];

// Helper function to handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().reduce((acc, error) => {
        acc[error.path] = error.msg;
        return acc;
      }, {})
    });
  }
  next();
};

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post('/register',
  authLimiter,
  registerValidation,
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const userData = {
      ...req.body,
      ipAddress: req.ip
    };

    const user = await authService.registerUser(userData);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName
        }
      }
    });
  })
);

// @route   POST /api/auth/login
// @desc    Authenticate user and get token
// @access  Public
router.post('/login',
  authLimiter,
  loginValidation,
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { email, password, mfaToken } = req.body;
    
    const context = {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      mfaToken
    };

    const result = await authService.authenticateUser(email, password, context);

    if (result.requiresMFA) {
      return res.status(200).json({
        success: true,
        requiresMFA: true,
        message: result.message
      });
    }

    // Set refresh token as secure HTTP-only cookie
    res.cookie('refreshToken', result.tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: result.user,
        accessToken: result.tokens.accessToken
      }
    });
  })
);

// @route   POST /api/auth/refresh
// @desc    Refresh access token
// @access  Public (but requires refresh token)
router.post('/refresh',
  asyncHandler(async (req, res) => {
    const refreshToken = req.cookies.refreshToken || req.body.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token required'
      });
    }

    const result = await authService.refreshTokens(refreshToken);

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        accessToken: result.tokens.accessToken
      }
    });
  })
);

// @route   POST /api/auth/logout
// @desc    Logout user and invalidate session
// @access  Private
router.post('/logout',
  authenticateToken,
  asyncHandler(async (req, res) => {
    await authService.logout(req.user.sessionId);

    // Clear refresh token cookie
    res.clearCookie('refreshToken');

    res.json({
      success: true,
      message: 'Logout successful'
    });
  })
);

// @route   POST /api/auth/forgot-password
// @desc    Request password reset
// @access  Public
router.post('/forgot-password',
  resetLimiter,
  passwordResetValidation,
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { email } = req.body;
    
    const result = await authService.requestPasswordReset(email);

    res.json({
      success: true,
      message: result.message,
      ...(process.env.NODE_ENV === 'development' && { resetToken: result.resetToken })
    });
  })
);

// @route   POST /api/auth/reset-password
// @desc    Reset password with token
// @access  Public
router.post('/reset-password',
  resetLimiter,
  resetPasswordValidation,
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { resetToken, password } = req.body;

    const result = await authService.resetPassword(resetToken, password);

    res.json({
      success: true,
      message: result.message
    });
  })
);

// @route   GET /api/auth/me
// @desc    Get current user info
// @access  Private
router.get('/me',
  authenticateToken,
  asyncHandler(async (req, res) => {
    res.json({
      success: true,
      data: {
        user: req.user
      }
    });
  })
);

// @route   POST /api/auth/verify-email
// @desc    Verify email address
// @access  Private
router.post('/verify-email',
  authenticateToken,
  asyncHandler(async (req, res) => {
    // TODO: Implement email verification
    res.json({
      success: true,
      message: 'Email verification endpoint - TODO'
    });
  })
);

// @route   POST /api/auth/verify-phone
// @desc    Verify phone number
// @access  Private
router.post('/verify-phone',
  authenticateToken,
  asyncHandler(async (req, res) => {
    // TODO: Implement phone verification
    res.json({
      success: true,
      message: 'Phone verification endpoint - TODO'
    });
  })
);

module.exports = router;