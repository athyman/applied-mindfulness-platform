const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { authenticateToken, requireRole, optionalAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { getPool } = require('../config/database');
const { logger, logUserAction } = require('../utils/logger');

const router = express.Router();

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

// @route   GET /api/courses
// @desc    Get published courses with optional filtering
// @access  Public (with optional auth for personalization)
router.get('/',
  optionalAuth,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100'),
    query('difficulty').optional().isIn(['beginner', 'intermediate', 'advanced']).withMessage('Invalid difficulty level'),
    query('search').optional().isString().isLength({ max: 100 }).withMessage('Search term too long'),
  ],
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const pool = getPool();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const { difficulty, search } = req.query;

    let baseQuery = `
      FROM courses c
      JOIN instructors i ON c.author_id = i.id
      JOIN users u ON i.user_id = u.id
      WHERE c.status_id = 5
    `;
    let params = [];
    let paramCount = 0;

    // Add filters
    if (difficulty) {
      paramCount++;
      baseQuery += ` AND c.difficulty_level = $${paramCount}`;
      params.push(difficulty);
    }

    if (search) {
      paramCount++;
      baseQuery += ` AND (c.title ILIKE $${paramCount} OR c.description ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    // Get total count
    const countResult = await pool.query(`SELECT COUNT(*) ${baseQuery}`, params);
    const totalCount = parseInt(countResult.rows[0].count);

    // Get courses with pagination
    const coursesQuery = `
      SELECT 
        c.id, c.title, c.description, c.difficulty_level, 
        c.estimated_duration_minutes, c.thumbnail_url, c.progressive_order,
        c.created_at, c.updated_at,
        u.first_name || ' ' || u.last_name as instructor_name,
        i.bio as instructor_bio,
        COUNT(l.id) as lesson_count
      ${baseQuery}
      GROUP BY c.id, u.first_name, u.last_name, i.bio
      ORDER BY c.progressive_order ASC, c.created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;
    params.push(limit, offset);

    const coursesResult = await pool.query(coursesQuery, params);

    // Get user progress if authenticated
    let coursesWithProgress = coursesResult.rows;
    if (req.user) {
      const courseIds = coursesResult.rows.map(course => course.id);
      if (courseIds.length > 0) {
        const progressResult = await pool.query(`
          SELECT 
            c.id as course_id,
            COUNT(l.id) as total_lessons,
            COUNT(CASE WHEN up.completion_percentage = 100 THEN 1 END) as completed_lessons,
            AVG(COALESCE(up.completion_percentage, 0)) as average_progress
          FROM courses c
          LEFT JOIN lessons l ON c.id = l.course_id
          LEFT JOIN user_progress up ON l.id = up.lesson_id AND up.user_id = $1
          WHERE c.id = ANY($2::uuid[])
          GROUP BY c.id
        `, [req.user.id, courseIds]);

        const progressMap = {};
        progressResult.rows.forEach(row => {
          progressMap[row.course_id] = {
            totalLessons: parseInt(row.total_lessons),
            completedLessons: parseInt(row.completed_lessons),
            averageProgress: parseFloat(row.average_progress) || 0
          };
        });

        coursesWithProgress = coursesResult.rows.map(course => ({
          ...course,
          progress: progressMap[course.id] || null
        }));
      }
    }

    res.json({
      success: true,
      data: {
        courses: coursesWithProgress,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalCount,
          hasNext: page < Math.ceil(totalCount / limit),
          hasPrev: page > 1
        }
      }
    });
  })
);

// @route   GET /api/courses/:id
// @desc    Get single course with lessons
// @access  Public (with optional auth for progress)
router.get('/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const pool = getPool();
    const courseId = req.params.id;

    // Get course details
    const courseResult = await pool.query(`
      SELECT 
        c.*, 
        u.first_name || ' ' || u.last_name as instructor_name,
        i.bio as instructor_bio,
        i.credentials as instructor_credentials
      FROM courses c
      JOIN instructors i ON c.author_id = i.id
      JOIN users u ON i.user_id = u.id
      WHERE c.id = $1 AND c.status_id = 5
    `, [courseId]);

    if (courseResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    const course = courseResult.rows[0];

    // Get lessons
    const lessonsResult = await pool.query(`
      SELECT 
        id, title, content_type, duration_minutes, sequence_order,
        prerequisites, learning_objectives, thumbnail_url
      FROM lessons
      WHERE course_id = $1
      ORDER BY sequence_order ASC
    `, [courseId]);

    // Get user progress if authenticated
    let lessonsWithProgress = lessonsResult.rows;
    if (req.user) {
      const lessonIds = lessonsResult.rows.map(lesson => lesson.id);
      if (lessonIds.length > 0) {
        const progressResult = await pool.query(`
          SELECT lesson_id, completion_percentage, completed_at, bookmarked, rating
          FROM user_progress
          WHERE user_id = $1 AND lesson_id = ANY($2::uuid[])
        `, [req.user.id, lessonIds]);

        const progressMap = {};
        progressResult.rows.forEach(row => {
          progressMap[row.lesson_id] = {
            completionPercentage: parseFloat(row.completion_percentage),
            completedAt: row.completed_at,
            bookmarked: row.bookmarked,
            rating: row.rating
          };
        });

        lessonsWithProgress = lessonsResult.rows.map(lesson => ({
          ...lesson,
          progress: progressMap[lesson.id] || null
        }));
      }
    }

    res.json({
      success: true,
      data: {
        course: {
          id: course.id,
          title: course.title,
          description: course.description,
          difficultyLevel: course.difficulty_level,
          estimatedDurationMinutes: course.estimated_duration_minutes,
          thumbnailUrl: course.thumbnail_url,
          progressiveOrder: course.progressive_order,
          instructorName: course.instructor_name,
          instructorBio: course.instructor_bio,
          instructorCredentials: course.instructor_credentials,
          createdAt: course.created_at,
          updatedAt: course.updated_at
        },
        lessons: lessonsWithProgress
      }
    });
  })
);

// @route   GET /api/courses/:courseId/lessons/:lessonId
// @desc    Get single lesson content
// @access  Public (with optional auth for progress tracking)
router.get('/:courseId/lessons/:lessonId',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const pool = getPool();
    const { courseId, lessonId } = req.params;

    // Get lesson with course info
    const lessonResult = await pool.query(`
      SELECT 
        l.*,
        c.title as course_title,
        c.status_id as course_status
      FROM lessons l
      JOIN courses c ON l.course_id = c.id
      WHERE l.id = $1 AND l.course_id = $2 AND c.status_id = 5
    `, [lessonId, courseId]);

    if (lessonResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Lesson not found'
      });
    }

    const lesson = lessonResult.rows[0];

    // Get user progress if authenticated
    let userProgress = null;
    if (req.user) {
      const progressResult = await pool.query(`
        SELECT * FROM user_progress
        WHERE user_id = $1 AND lesson_id = $2
      `, [req.user.id, lessonId]);

      if (progressResult.rows.length > 0) {
        userProgress = progressResult.rows[0];
      }
    }

    // Get next lesson
    const nextLessonResult = await pool.query(`
      SELECT id, title
      FROM lessons
      WHERE course_id = $1 AND sequence_order > $2
      ORDER BY sequence_order ASC
      LIMIT 1
    `, [courseId, lesson.sequence_order]);

    // Get previous lesson
    const prevLessonResult = await pool.query(`
      SELECT id, title
      FROM lessons
      WHERE course_id = $1 AND sequence_order < $2
      ORDER BY sequence_order DESC
      LIMIT 1
    `, [courseId, lesson.sequence_order]);

    res.json({
      success: true,
      data: {
        lesson: {
          id: lesson.id,
          courseId: lesson.course_id,
          courseTitle: lesson.course_title,
          title: lesson.title,
          contentType: lesson.content_type,
          contentUrl: lesson.content_url,
          contentText: lesson.content_text,
          durationMinutes: lesson.duration_minutes,
          prerequisites: lesson.prerequisites,
          learningObjectives: lesson.learning_objectives,
          sequenceOrder: lesson.sequence_order,
          thumbnailUrl: lesson.thumbnail_url,
          transcript: lesson.transcript,
          createdAt: lesson.created_at
        },
        userProgress,
        navigation: {
          nextLesson: nextLessonResult.rows[0] || null,
          prevLesson: prevLessonResult.rows[0] || null
        }
      }
    });
  })
);

// @route   POST /api/courses/:courseId/lessons/:lessonId/progress
// @desc    Update lesson progress
// @access  Private
router.post('/:courseId/lessons/:lessonId/progress',
  authenticateToken,
  [
    body('completionPercentage')
      .isFloat({ min: 0, max: 100 })
      .withMessage('Completion percentage must be between 0 and 100'),
    body('timeSpentMinutes')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Time spent must be a non-negative integer'),
    body('notes')
      .optional()
      .isString()
      .isLength({ max: 1000 })
      .withMessage('Notes must be less than 1000 characters'),
    body('interactionData')
      .optional()
      .isObject()
      .withMessage('Interaction data must be an object'),
  ],
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const pool = getPool();
    const { courseId, lessonId } = req.params;
    const { completionPercentage, timeSpentMinutes, notes, interactionData } = req.body;

    // Verify lesson exists and belongs to course
    const lessonCheck = await pool.query(`
      SELECT l.id FROM lessons l
      JOIN courses c ON l.course_id = c.id
      WHERE l.id = $1 AND l.course_id = $2 AND c.status_id = 5
    `, [lessonId, courseId]);

    if (lessonCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Lesson not found'
      });
    }

    // Upsert progress
    const result = await pool.query(`
      INSERT INTO user_progress (
        user_id, lesson_id, completion_percentage, time_spent_minutes, 
        notes, interaction_data, completed_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, 
        CASE WHEN $3 = 100 THEN NOW() ELSE NULL END, NOW())
      ON CONFLICT (user_id, lesson_id)
      DO UPDATE SET
        completion_percentage = GREATEST(user_progress.completion_percentage, EXCLUDED.completion_percentage),
        time_spent_minutes = COALESCE(user_progress.time_spent_minutes, 0) + COALESCE(EXCLUDED.time_spent_minutes, 0),
        notes = COALESCE(EXCLUDED.notes, user_progress.notes),
        interaction_data = COALESCE(EXCLUDED.interaction_data, user_progress.interaction_data),
        completed_at = CASE 
          WHEN EXCLUDED.completion_percentage = 100 AND user_progress.completed_at IS NULL 
          THEN NOW() 
          ELSE user_progress.completed_at 
        END,
        updated_at = NOW()
      RETURNING *
    `, [
      req.user.id, 
      lessonId, 
      completionPercentage, 
      timeSpentMinutes || 0,
      notes,
      interactionData ? JSON.stringify(interactionData) : null
    ]);

    const progress = result.rows[0];

    logUserAction(req.user.id, 'update_lesson_progress', 'lesson', {
      lessonId,
      courseId,
      completionPercentage,
      wasCompleted: progress.completed_at !== null
    });

    res.json({
      success: true,
      message: 'Progress updated successfully',
      data: {
        progress: {
          completionPercentage: parseFloat(progress.completion_percentage),
          timeSpentMinutes: progress.time_spent_minutes,
          completedAt: progress.completed_at,
          updatedAt: progress.updated_at
        }
      }
    });
  })
);

// @route   POST /api/courses/:courseId/lessons/:lessonId/bookmark
// @desc    Toggle lesson bookmark
// @access  Private
router.post('/:courseId/lessons/:lessonId/bookmark',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const pool = getPool();
    const { courseId, lessonId } = req.params;

    // Verify lesson exists
    const lessonCheck = await pool.query(`
      SELECT l.id FROM lessons l
      JOIN courses c ON l.course_id = c.id
      WHERE l.id = $1 AND l.course_id = $2 AND c.status_id = 5
    `, [lessonId, courseId]);

    if (lessonCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Lesson not found'
      });
    }

    // Toggle bookmark
    const result = await pool.query(`
      INSERT INTO user_progress (user_id, lesson_id, bookmarked, updated_at)
      VALUES ($1, $2, true, NOW())
      ON CONFLICT (user_id, lesson_id)
      DO UPDATE SET
        bookmarked = NOT user_progress.bookmarked,
        updated_at = NOW()
      RETURNING bookmarked
    `, [req.user.id, lessonId]);

    const isBookmarked = result.rows[0].bookmarked;

    logUserAction(req.user.id, isBookmarked ? 'bookmark_lesson' : 'unbookmark_lesson', 'lesson', {
      lessonId,
      courseId
    });

    res.json({
      success: true,
      message: isBookmarked ? 'Lesson bookmarked' : 'Bookmark removed',
      data: {
        bookmarked: isBookmarked
      }
    });
  })
);

// @route   POST /api/courses/:courseId/lessons/:lessonId/rating
// @desc    Rate a lesson
// @access  Private
router.post('/:courseId/lessons/:lessonId/rating',
  authenticateToken,
  [
    body('rating')
      .isInt({ min: 1, max: 5 })
      .withMessage('Rating must be between 1 and 5'),
  ],
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const pool = getPool();
    const { courseId, lessonId } = req.params;
    const { rating } = req.body;

    // Verify lesson exists
    const lessonCheck = await pool.query(`
      SELECT l.id FROM lessons l
      JOIN courses c ON l.course_id = c.id
      WHERE l.id = $1 AND l.course_id = $2 AND c.status_id = 5
    `, [lessonId, courseId]);

    if (lessonCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Lesson not found'
      });
    }

    // Update rating
    const result = await pool.query(`
      INSERT INTO user_progress (user_id, lesson_id, rating, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (user_id, lesson_id)
      DO UPDATE SET
        rating = EXCLUDED.rating,
        updated_at = NOW()
      RETURNING rating
    `, [req.user.id, lessonId, rating]);

    logUserAction(req.user.id, 'rate_lesson', 'lesson', {
      lessonId,
      courseId,
      rating
    });

    res.json({
      success: true,
      message: 'Rating submitted successfully',
      data: {
        rating: result.rows[0].rating
      }
    });
  })
);

module.exports = router;