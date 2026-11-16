const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const config = require('./env');

const pool = new Pool({
  connectionString: config.databaseUrl,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle PostgreSQL client:', err.message);
});

/**
 * Automatically creates required tables and indexes on server startup,
 * and ensures a default demo user exists for quick testing.
 */
async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS scheduled_emails (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        recipient VARCHAR(255) NOT NULL,
        subject VARCHAR(500) NOT NULL,
        body TEXT NOT NULL,
        scheduled_at TIMESTAMPTZ NOT NULL,
        sent_at TIMESTAMPTZ,
        status VARCHAR(32) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED')),
        job_id VARCHAR(128) UNIQUE,
        message_id VARCHAR(255),
        preview_url TEXT,
        error_message TEXT,
        attempts INT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_scheduled_emails_user_status ON scheduled_emails(user_id, status);
      CREATE INDEX IF NOT EXISTS idx_scheduled_emails_scheduled_at ON scheduled_emails(scheduled_at);
      CREATE INDEX IF NOT EXISTS idx_scheduled_emails_status ON scheduled_emails(status);
    `);

    // Seed a default demo user so reviewers can log in with 1 click
    const demoEmail = 'demo@outbox.io';
    const existingDemo = await client.query('SELECT id FROM users WHERE email = $1', [demoEmail]);
    if (existingDemo.rowCount === 0) {
      const passwordHash = await bcrypt.hash('password123', 10);
      await client.query(
        'INSERT INTO users (id, name, email, password_hash) VALUES ($1, $2, $3, $4)',
        [uuidv4(), 'Demo User', demoEmail, passwordHash]
      );
      console.log('[DB] Created default demo account -> Email: demo@outbox.io | Password: password123');
    }

    await client.query('COMMIT');
    console.log('[DB] PostgreSQL schema verified and initialized.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[DB] Failed to initialize database schema:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
  initDatabase,
};
