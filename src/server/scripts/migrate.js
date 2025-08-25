require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { logger } = require('../utils/logger');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

// Migration tracking table
const createMigrationsTable = async () => {
  const query = `
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
  await pool.query(query);
  logger.info('Migrations table ensured');
};

// Get executed migrations
const getExecutedMigrations = async () => {
  const result = await pool.query('SELECT filename FROM migrations ORDER BY id');
  return result.rows.map(row => row.filename);
};

// Record migration execution
const recordMigration = async (filename) => {
  await pool.query('INSERT INTO migrations (filename) VALUES ($1)', [filename]);
  logger.info(`Migration recorded: ${filename}`);
};

// Execute a single migration file
const executeMigration = async (filename, filepath) => {
  try {
    const sql = fs.readFileSync(filepath, 'utf8');
    
    // Execute within a transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('COMMIT');
      
      await recordMigration(filename);
      logger.info(`Migration executed successfully: ${filename}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error(`Migration failed: ${filename}`, error);
    throw error;
  }
};

// Main migration function
const runMigrations = async () => {
  try {
    logger.info('Starting database migrations...');
    
    // Ensure migrations table exists
    await createMigrationsTable();
    
    // Get list of executed migrations
    const executedMigrations = await getExecutedMigrations();
    logger.info(`Found ${executedMigrations.length} previously executed migrations`);
    
    // Get migration files
    const migrationsDir = path.join(__dirname, 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Ensure correct order
    
    logger.info(`Found ${migrationFiles.length} migration files`);
    
    // Execute pending migrations
    let executedCount = 0;
    for (const filename of migrationFiles) {
      if (!executedMigrations.includes(filename)) {
        const filepath = path.join(migrationsDir, filename);
        await executeMigration(filename, filepath);
        executedCount++;
      } else {
        logger.info(`Skipping already executed migration: ${filename}`);
      }
    }
    
    if (executedCount === 0) {
      logger.info('No pending migrations to execute');
    } else {
      logger.info(`Successfully executed ${executedCount} migrations`);
    }
    
  } catch (error) {
    logger.error('Migration process failed:', error);
    throw error;
  }
};

// Run migrations if called directly
if (require.main === module) {
  runMigrations()
    .then(() => {
      logger.info('Migrations completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Migration process failed:', error);
      process.exit(1);
    });
}

module.exports = {
  runMigrations,
  pool
};