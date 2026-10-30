'use strict';

const express = require('express');
const mysql   = require('mysql2/promise');
const cors    = require('cors');

const app  = express();
const PORT = process.env.PORT || 5000;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logger
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// ─── DB Config (from env) ─────────────────────────────────────────────────────
const DB_CONFIG = {
  host    : process.env.DB_HOST     || 'localhost',
  user    : process.env.DB_USER     || 'hackathon',
  password: process.env.DB_PASSWORD || 'hackathon_pass',
  database: process.env.DB_NAME     || 'hackathon',
  waitForConnections: true,
  connectionLimit   : 10,
  queueLimit        : 0,
};

let pool;

// ─── DB Init with retry ───────────────────────────────────────────────────────
async function initDB(maxRetries = 30, delayMs = 3000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[DB] Connection attempt ${attempt}/${maxRetries} → ${DB_CONFIG.host}:3306/${DB_CONFIG.database}`);
      pool = mysql.createPool(DB_CONFIG);

      // Test the connection
      const conn = await pool.getConnection();
      conn.release();

      // Create table if not exists
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS teams (
          id            INT          AUTO_INCREMENT PRIMARY KEY,
          team_name     VARCHAR(100) NOT NULL,
          members       VARCHAR(500) NOT NULL,
          project_idea  TEXT         NOT NULL,
          registered_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uq_team_name (team_name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      console.log('[DB] Connected and table ensured ✓');
      return;
    } catch (err) {
      console.error(`[DB] Attempt ${attempt} failed: ${err.message}`);
      if (attempt === maxRetries) {
        console.error('[DB] Max retries reached. Exiting.');
        process.exit(1);
      }
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// Health check
app.get('/api/health', async (_req, res) => {
  try {
    await pool.execute('SELECT 1');
    res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'error', db: 'disconnected', error: err.message });
  }
});

// Get all teams
app.get('/api/teams', async (_req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, team_name, members, project_idea, registered_at FROM teams ORDER BY registered_at DESC'
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /api/teams]', err.message);
    res.status(500).json({ error: 'Failed to fetch teams' });
  }
});

// Register a team
app.post('/api/teams', async (req, res) => {
  const { team_name, members, project_idea } = req.body;

  if (!team_name || !members || !project_idea) {
    return res.status(400).json({ error: 'team_name, members, and project_idea are required' });
  }
  if (team_name.length > 100)  return res.status(400).json({ error: 'team_name must be ≤ 100 chars' });
  if (members.length > 500)    return res.status(400).json({ error: 'members must be ≤ 500 chars' });
  if (project_idea.length > 1000) return res.status(400).json({ error: 'project_idea must be ≤ 1000 chars' });

  try {
    const [result] = await pool.execute(
      'INSERT INTO teams (team_name, members, project_idea) VALUES (?, ?, ?)',
      [team_name.trim(), members.trim(), project_idea.trim()]
    );
    const [rows] = await pool.execute('SELECT * FROM teams WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: `Team name "${team_name}" is already registered` });
    }
    console.error('[POST /api/teams]', err.message);
    res.status(500).json({ error: 'Failed to register team' });
  }
});

// Delete a team
app.delete('/api/teams/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid team ID' });
  }

  try {
    const [result] = await pool.execute('DELETE FROM teams WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Team not found' });
    }
    res.json({ message: 'Team deleted successfully', id });
  } catch (err) {
    console.error('[DELETE /api/teams/:id]', err.message);
    res.status(500).json({ error: 'Failed to delete team' });
  }
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err, _req, res, _next) => {
  console.error('[Unhandled error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
(async () => {
  await initDB();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[API] Hackathon backend listening on port ${PORT}`);
  });
})();
