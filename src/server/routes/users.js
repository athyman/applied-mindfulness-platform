const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken, requireOwnershipOrAdmin, userRateLimit } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { getPool } = require('../config/database');
const { logger, logUserAction } = require('../utils/logger');

const router = express.Router();

// Apply authentication to all user routes
router.use(authenticateToken);

// Apply user-specific rate limiting
router.use(userRateLimit(200, 15 * 60 * 1000)); // 200 requests per 15 minutes per user

// Validation middleware
const updateProfileValidation = [
  body('firstName')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('First name must be 1-50 characters'),
  body('lastName')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Last name must be 1-50 characters'),
  body('phone')
    .optional()
    .isMobilePhone()
    .withMessage('Valid phone number required'),
  body('timezone')
    .optional()
    .isIn([
      'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 
      'America/Los_Angeles', 'Europe/London', 'Europe/Paris', 'Asia/Tokyo'
    ])
    .withMessage('Valid timezone required'),
  body('preferences')
    .optional()
    .isObject()
    .withMessage('Preferences must be an object'),
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

// @route   GET /api/users/profile
// @desc    Get current user's profile
// @access  Private
router.get('/profile',
  asyncHandler(async (req, res) => {
    const pool = getPool();
    
    const result = await pool.query(`
      SELECT 
        u.id, u.email, u.first_name, u.last_name, u.phone, 
        u.date_of_birth, u.timezone, u.preferences, u.profile_data,
        u.email_verified, u.phone_verified, u.last_login, u.created_at,
        ur.name as role, vl.name as verification_level
      FROM users u
      JOIN user_roles ur ON u.role_id = ur.id
      JOIN verification_levels vl ON u.verification_level_id = vl.id
      WHERE u.id = $1 AND u.deleted_at IS NULL
    `, [req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = result.rows[0];

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          phone: user.phone,
          dateOfBirth: user.date_of_birth,
          timezone: user.timezone,
          preferences: user.preferences,
          profileData: user.profile_data,
          role: user.role,
          verificationLevel: user.verification_level,
          emailVerified: user.email_verified,
          phoneVerified: user.phone_verified,
          lastLogin: user.last_login,
          createdAt: user.created_at
        }
      }
    });
  })
);

// @route   PUT /api/users/profile
// @desc    Update current user's profile
// @access  Private
router.put('/profile',
  updateProfileValidation,
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const pool = getPool();
    const allowedFields = ['firstName', 'lastName', 'phone', 'timezone', 'preferences'];
    const updates = {};
    
    // Filter allowed fields
    Object.keys(req.body).forEach(key => {
      if (allowedFields.includes(key)) {
        updates[key] = req.body[key];
      }
    });

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update'
      });
    }

    // Build dynamic query
    const fields = Object.keys(updates);
    const values = Object.values(updates);
    const setClause = fields.map((field, index) => {
      const dbField = field === 'firstName' ? 'first_name' : 
                      field === 'lastName' ? 'last_name' : field;
      return `${dbField} = $${index + 1}`;
    }).join(', ');

    values.push(req.user.id); // Add user ID for WHERE clause

    const query = `
      UPDATE users 
      SET ${setClause}, updated_at = NOW()
      WHERE id = $${values.length} AND deleted_at IS NULL
      RETURNING id, first_name, last_name, phone, timezone, preferences, updated_at
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = result.rows[0];

    logUserAction(req.user.id, 'update_profile', 'user', {
      updatedFields: fields
    });

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: {
          id: user.id,
          firstName: user.first_name,
          lastName: user.last_name,
          phone: user.phone,
          timezone: user.timezone,
          preferences: user.preferences,
          updatedAt: user.updated_at
        }
      }
    });
  })
);

// @route   GET /api/users/:userId/progress
// @desc    Get user's learning progress
// @access  Private (own progress or admin)
router.get('/:userId/progress',
  requireOwnershipOrAdmin('userId'),
  asyncHandler(async (req, res) => {
    const pool = getPool();
    const userId = req.params.userId;

    // Get overall progress statistics
    const progressStats = await pool.query(`
      SELECT 
        COUNT(*) as total_lessons,
        COUNT(CASE WHEN completion_percentage = 100 THEN 1 END) as completed_lessons,
        AVG(completion_percentage) as average_completion,
        SUM(time_spent_minutes) as total_time_spent,
        COUNT(CASE WHEN bookmarked = true THEN 1 END) as bookmarked_count
      FROM user_progress up
      JOIN lessons l ON up.lesson_id = l.id
      JOIN courses c ON l.course_id = c.id
      WHERE up.user_id = $1 AND c.status_id = 5
    `, [userId]);

    // Get recent progress
    const recentProgress = await pool.query(`
      SELECT 
        up.*,
        l.title as lesson_title,
        c.title as course_title,
        c.id as course_id
      FROM user_progress up
      JOIN lessons l ON up.lesson_id = l.id
      JOIN courses c ON l.course_id = c.id
      WHERE up.user_id = $1 AND c.status_id = 5
      ORDER BY up.updated_at DESC
      LIMIT 10
    `, [userId]);

    // Get course progress
    const courseProgress = await pool.query(`
      SELECT 
        c.id,
        c.title,
        c.description,
        COUNT(l.id) as total_lessons,
        COUNT(CASE WHEN up.completion_percentage = 100 THEN 1 END) as completed_lessons,
        AVG(up.completion_percentage) as average_completion,
        SUM(up.time_spent_minutes) as time_spent,
        MAX(up.updated_at) as last_activity
      FROM courses c
      LEFT JOIN lessons l ON c.id = l.course_id
      LEFT JOIN user_progress up ON l.id = up.lesson_id AND up.user_id = $1
      WHERE c.status_id = 5
      GROUP BY c.id, c.title, c.description
      HAVING COUNT(up.user_id) > 0
      ORDER BY last_activity DESC
    `, [userId]);

    res.json({
      success: true,
      data: {
        stats: progressStats.rows[0],
        recentProgress: recentProgress.rows,
        courseProgress: courseProgress.rows
      }
    });
  })
);

// @route   GET /api/users/:userId/achievements
// @desc    Get user's achievements and streaks
// @access  Private (own achievements or admin)
router.get('/:userId/achievements',
  requireOwnershipOrAdmin('userId'),
  asyncHandler(async (req, res) => {
    const pool = getPool();
    const userId = req.params.userId;

    // Calculate learning streak
    const streakQuery = await pool.query(`
      WITH daily_activity AS (
        SELECT DISTINCT DATE(updated_at) as activity_date
        FROM user_progress
        WHERE user_id = $1 AND completion_percentage > 0
        ORDER BY activity_date DESC
      ),
      streak_calculation AS (
        SELECT 
          activity_date,
          activity_date - ROW_NUMBER() OVER (ORDER BY activity_date DESC)::INTEGER as streak_group
        FROM daily_activity
      )
      SELECT 
        COUNT(*) as current_streak,
        MIN(activity_date) as streak_start,
        MAX(activity_date) as streak_end
      FROM streak_calculation
      WHERE streak_group = (
        SELECT activity_date - ROW_NUMBER() OVER (ORDER BY activity_date DESC)::INTEGER
        FROM daily_activity
        LIMIT 1
      )
    `, [userId]);

    // Get achievements (this would be expanded with actual achievement logic)
    const achievements = [
      {
        id: 'first_lesson',
        title: 'First Steps',
        description: 'Complete your first lesson',
        unlocked: true,
        unlockedAt: new Date().toISOString()
      }
      // More achievements would be calculated based on progress data
    ];

    res.json({
      success: true,
      data: {
        streak: streakQuery.rows[0] || { current_streak: 0 },
        achievements
      }
    });
  })
);

// @route   POST /api/users/preferences
// @desc    Update user preferences
// @access  Private
router.post('/preferences',
  body('preferences').isObject().withMessage('Preferences must be an object'),
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const pool = getPool();
    const { preferences } = req.body;

    // Merge with existing preferences
    const currentUser = await pool.query(
      'SELECT preferences FROM users WHERE id = $1',
      [req.user.id]
    );

    const currentPreferences = currentUser.rows[0]?.preferences || {};
    const updatedPreferences = { ...currentPreferences, ...preferences };

    const result = await pool.query(`
      UPDATE users 
      SET preferences = $1, updated_at = NOW()
      WHERE id = $2 AND deleted_at IS NULL
      RETURNING preferences
    `, [JSON.stringify(updatedPreferences), req.user.id]);

    logUserAction(req.user.id, 'update_preferences', 'user', {
      updatedKeys: Object.keys(preferences)
    });

    res.json({
      success: true,
      message: 'Preferences updated successfully',
      data: {
        preferences: result.rows[0].preferences
      }
    });
  })
);

// @route   DELETE /api/users/account
// @desc    Soft delete user account
// @access  Private
router.delete('/account',
  body('confirmation')
    .equals('DELETE_MY_ACCOUNT')
    .withMessage('Must confirm account deletion with "DELETE_MY_ACCOUNT"'),
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const pool = getPool();

    // Soft delete the user account
    await pool.query(`
      UPDATE users 
      SET 
        deleted_at = NOW(),
        is_active = false,
        email = CONCAT(email, '_deleted_', EXTRACT(epoch FROM NOW()))
      WHERE id = $1 AND deleted_at IS NULL
    `, [req.user.id]);

    // Invalidate all sessions
    // TODO: Implement session cleanup

    logUserAction(req.user.id, 'delete_account', 'user');

    res.json({
      success: true,
      message: 'Account deleted successfully'
    });
  })
);

module.exports = router;