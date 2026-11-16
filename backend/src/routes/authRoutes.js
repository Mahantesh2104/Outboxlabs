const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const config = require('../config/env');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

function signUserToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    config.jwtSecret,
    { expiresIn: '7d' }
  );
}

/**
 * POST /api/auth/register
 * Registers a new user account.
 */
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (existing.rowCount > 0) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const id = uuidv4();

    const result = await db.query(
      `INSERT INTO users (id, name, email, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, created_at`,
      [id, name.trim(), normalizedEmail, passwordHash]
    );

    const user = result.rows[0];
    const token = signUserToken(user);

    return res.status(201).json({ user, token });
  } catch (err) {
    console.error('[Auth] Register error:', err.message);
    return res.status(500).json({ error: 'Failed to register user.' });
  }
});

/**
 * POST /api/auth/login
 * Authenticates a user with email and password.
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const result = await db.query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
    if (result.rowCount === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const userRow = result.rows[0];
    const valid = await bcrypt.compare(password, userRow.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const user = {
      id: userRow.id,
      name: userRow.name,
      email: userRow.email,
      created_at: userRow.created_at,
    };

    const token = signUserToken(user);
    return res.json({ user, token });
  } catch (err) {
    console.error('[Auth] Login error:', err.message);
    return res.status(500).json({ error: 'Failed to log in.' });
  }
});

/**
 * POST /api/auth/demo
 * Instant login with the seeded demo account (demo@outbox.io).
 */
router.post('/demo', async (_req, res) => {
  try {
    const demoEmail = 'demo@outbox.io';
    let result = await db.query(
      'SELECT id, name, email, created_at FROM users WHERE email = $1',
      [demoEmail]
    );

    if (result.rowCount === 0) {
      const passwordHash = await bcrypt.hash('password123', 10);
      result = await db.query(
        `INSERT INTO users (id, name, email, password_hash)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, email, created_at`,
        [uuidv4(), 'Demo User', demoEmail, passwordHash]
      );
    }

    const user = result.rows[0];
    const token = signUserToken(user);
    return res.json({ user, token });
  } catch (err) {
    console.error('[Auth] Demo login error:', err.message);
    return res.status(500).json({ error: 'Failed to log in with demo account.' });
  }
});

/**
 * GET /api/auth/me
 * Returns the currently logged-in user's profile.
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, name, email, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    return res.json({ user: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch user profile.' });
  }
});

module.exports = router;
