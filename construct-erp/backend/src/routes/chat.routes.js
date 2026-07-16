// src/routes/chat.routes.js — ERP Team Chat REST endpoints
const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth');
const { query } = require('../config/database');

router.use(authenticate);

// ── Ensure table exists (runs once on first request) ─────────────────────────
let tableReady = false;
async function ensureTable() {
  if (tableReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id           SERIAL PRIMARY KEY,
      channel      VARCHAR(100) NOT NULL DEFAULT 'general',
      sender_id    UUID REFERENCES users(id) ON DELETE SET NULL,
      sender_name  VARCHAR(200) NOT NULL,
      sender_role  VARCHAR(100),
      text         TEXT,
      file_name    VARCHAR(500),
      file_size    VARCHAR(50),
      file_url     TEXT,
      pinned       BOOLEAN DEFAULT FALSE,
      reactions    JSONB DEFAULT '[]',
      created_at   TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_chat_channel ON chat_messages(channel);
    CREATE INDEX IF NOT EXISTS idx_chat_created ON chat_messages(created_at DESC);
  `);
  tableReady = true;
}

// ── GET /chat/messages?channel=finance&limit=100 ──────────────────────────────
router.get('/messages', async (req, res) => {
  await ensureTable();
  const { channel = 'general', limit = 100 } = req.query;
  const result = await query(
    `SELECT * FROM chat_messages
     WHERE channel = $1
     ORDER BY created_at ASC
     LIMIT $2`,
    [channel, Math.min(parseInt(limit) || 100, 500)]
  );
  res.json({ messages: result.rows });
});

// ── POST /chat/messages ───────────────────────────────────────────────────────
router.post('/messages', async (req, res) => {
  await ensureTable();
  const { channel = 'general', text, file_name, file_size, file_url } = req.body;
  if (!text && !file_name) return res.status(400).json({ error: 'Message text or file required' });

  const sender_name = req.user.name || req.user.username || 'Unknown';
  const sender_role = req.user.role || '';

  const result = await query(
    `INSERT INTO chat_messages
       (channel, sender_id, sender_name, sender_role, text, file_name, file_size, file_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [channel, req.user.id, sender_name, sender_role, text || null, file_name || null, file_size || null, file_url || null]
  );
  res.json({ message: result.rows[0] });
});

// ── PATCH /chat/messages/:id/pin ──────────────────────────────────────────────
router.patch('/messages/:id/pin', async (req, res) => {
  await ensureTable();
  const result = await query(
    `UPDATE chat_messages SET pinned = NOT pinned WHERE id = $1 RETURNING *`,
    [req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Message not found' });
  res.json({ message: result.rows[0] });
});

// ── PATCH /chat/messages/:id/react ───────────────────────────────────────────
router.patch('/messages/:id/react', async (req, res) => {
  await ensureTable();
  const { emoji } = req.body;
  if (!emoji) return res.status(400).json({ error: 'emoji required' });

  const existing = await query(`SELECT reactions FROM chat_messages WHERE id = $1`, [req.params.id]);
  if (!existing.rows.length) return res.status(404).json({ error: 'Message not found' });

  let reactions = existing.rows[0].reactions || [];
  const idx = reactions.findIndex(r => r.e === emoji);
  if (idx >= 0) {
    reactions[idx].c = (reactions[idx].c || 1) + 1;
  } else {
    reactions.push({ e: emoji, c: 1 });
  }

  const result = await query(
    `UPDATE chat_messages SET reactions = $1 WHERE id = $2 RETURNING *`,
    [JSON.stringify(reactions), req.params.id]
  );
  res.json({ message: result.rows[0] });
});

// ── DELETE /chat/messages/:id ─────────────────────────────────────────────────
router.delete('/messages/:id', async (req, res) => {
  await ensureTable();
  await query(`DELETE FROM chat_messages WHERE id = $1 AND sender_id = $2`, [req.params.id, req.user.id]);
  res.json({ ok: true });
});

// ── GET /chat/turn-credentials — serve TURN config from Railway env vars ─────
// Set TURN_USERNAME and TURN_CREDENTIAL in Railway to enable TURN.
// Without them, the endpoint returns STUN-only (works for most office networks).
router.get('/turn-credentials', (req, res) => {
  const username   = process.env.TURN_USERNAME;
  const credential = process.env.TURN_CREDENTIAL;
  const turnUrl    = process.env.TURN_URL || 'turn:relay.metered.ca:80';

  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  if (username && credential) {
    iceServers.push(
      { urls: turnUrl,                                    username, credential },
      { urls: `${turnUrl}?transport=tcp`,                 username, credential },
      { urls: turnUrl.replace(':80', ':443'),             username, credential },
      { urls: `${turnUrl.replace(':80', ':443')}?transport=tcp`, username, credential },
    );
  }

  res.json({ iceServers, turnConfigured: !!(username && credential) });
});

// ── GET /chat/previews — last message per conversation for the whole sidebar ──
// Returns a flat map: { channelId: { text, file_name, sender_name, created_at } }
// Covers both public channels and DM channels (dm-uuid-uuid format).
router.get('/previews', async (req, res) => {
  await ensureTable();
  const result = await query(`
    SELECT DISTINCT ON (channel)
      channel, text, file_name, sender_name, sender_id, created_at
    FROM chat_messages
    ORDER BY channel, created_at DESC
  `);
  const previews = {};
  for (const row of result.rows) {
    previews[row.channel] = {
      text:        row.text,
      file_name:   row.file_name,
      sender_name: row.sender_name,
      sender_id:   row.sender_id,
      created_at:  row.created_at,
    };
  }
  res.json({ previews });
});

// ── GET /chat/channels — list channels with last message + unread count ───────
router.get('/channels', async (req, res) => {
  await ensureTable();
  const result = await query(`
    SELECT
      channel,
      COUNT(*)::int           AS total_messages,
      MAX(created_at)         AS last_activity,
      (SELECT text FROM chat_messages cm2
       WHERE cm2.channel = cm.channel
       ORDER BY created_at DESC LIMIT 1) AS last_message,
      (SELECT sender_name FROM chat_messages cm3
       WHERE cm3.channel = cm.channel
       ORDER BY created_at DESC LIMIT 1) AS last_sender
    FROM chat_messages cm
    GROUP BY channel
    ORDER BY MAX(created_at) DESC
  `);
  res.json({ channels: result.rows });
});

// ── GET /chat/search — full-text search across messages ──────────────────────
router.get('/search', async (req, res) => {
  await ensureTable();
  const { q, channel, limit = 50 } = req.query;
  if (!q?.trim()) return res.json({ messages: [] });
  const params = [`%${q.trim()}%`, Math.min(parseInt(limit) || 50, 200)];
  let sql = `SELECT * FROM chat_messages WHERE (text ILIKE $1 OR file_name ILIKE $1)`;
  if (channel) { sql += ` AND channel = $${params.length + 1}`; params.push(channel); }
  sql += ` ORDER BY created_at DESC LIMIT $2`;
  const result = await query(sql, params);
  res.json({ messages: result.rows });
});

// ── Read receipts — read_by is a JSONB array of user-id strings ──────────────
let readByReady = false;
async function ensureReadBy() {
  if (readByReady) return;
  await query(`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS read_by JSONB DEFAULT '[]'`);
  readByReady = true;
}

// POST /chat/messages/mark-read { channel } — mark all unread in channel
router.post('/messages/mark-read', async (req, res) => {
  await ensureReadBy();
  const { channel } = req.body;
  if (!channel) return res.status(400).json({ error: 'channel required' });
  const uid = req.user.id;
  await query(
    `UPDATE chat_messages
     SET read_by = COALESCE(read_by, '[]'::jsonb) || $1::jsonb
     WHERE channel = $2 AND sender_id != $3
       AND NOT (COALESCE(read_by,'[]'::jsonb) @> $1::jsonb)`,
    [JSON.stringify([uid]), channel, uid]
  );
  res.json({ ok: true });
});

// ── Teams Meeting History ─────────────────────────────────────────────────────
let meetHistReady = false;
async function ensureMeetHistory() {
  if (meetHistReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS teams_meetings (
      id              SERIAL PRIMARY KEY,
      organizer_id    UUID REFERENCES users(id) ON DELETE SET NULL,
      organizer_name  VARCHAR(200) NOT NULL,
      subject         VARCHAR(500) NOT NULL,
      join_url        TEXT NOT NULL,
      start_dt        TIMESTAMPTZ NOT NULL,
      end_dt          TIMESTAMPTZ NOT NULL,
      attendee_emails JSONB DEFAULT '[]',
      teams_id        TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_tmeet_org ON teams_meetings(organizer_id);
    CREATE INDEX IF NOT EXISTS idx_tmeet_start ON teams_meetings(start_dt DESC);
  `);
  meetHistReady = true;
}

// GET /chat/meetings
router.get('/meetings', async (req, res) => {
  await ensureMeetHistory();
  const { limit = 30 } = req.query;
  const result = await query(
    `SELECT * FROM teams_meetings ORDER BY start_dt DESC LIMIT $1`,
    [Math.min(parseInt(limit) || 30, 100)]
  );
  res.json({ meetings: result.rows });
});

// ── Teams Online Meetings ─────────────────────────────────────────────────────
const { createTeamsMeeting } = require('../services/azureService');

// POST /chat/teams-meeting — create a Teams meeting and optionally post to channel
router.post('/teams-meeting', async (req, res) => {
  const { subject, startDateTime, endDateTime, attendeeEmails = [] } = req.body;
  if (!subject?.trim()) return res.status(400).json({ error: 'subject is required' });

  // Organizer: use logged-in user's email, fall back to env var
  const organizerEmail = req.user.email || process.env.TEAMS_ORGANIZER_EMAIL;
  if (!organizerEmail) {
    return res.status(400).json({ error: 'No organizer email — set TEAMS_ORGANIZER_EMAIL in Railway env vars' });
  }

  const start = startDateTime || new Date().toISOString();
  const end   = endDateTime   || new Date(Date.now() + 60 * 60 * 1000).toISOString();

  try {
    const meeting = await createTeamsMeeting(
      subject.trim(), start, end, organizerEmail,
      Array.isArray(attendeeEmails) ? attendeeEmails.filter(Boolean) : []
    );
    // Save to meeting history (fire-and-forget)
    ensureMeetHistory().then(() => query(
      `INSERT INTO teams_meetings (organizer_id, organizer_name, subject, join_url, start_dt, end_dt, attendee_emails, teams_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [req.user.id, req.user.full_name || req.user.name || organizerEmail,
       meeting.subject, meeting.joinUrl, meeting.startDateTime, meeting.endDateTime,
       JSON.stringify(attendeeEmails), meeting.id]
    ).catch(() => {}));
    res.json({ meeting });
  } catch (err) {
    console.error('[Teams] Route error:', err.message);
    // Surface a clean, actionable error message to the frontend
    const msg = err.message || 'Failed to create Teams meeting';
    const isPermission = msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('forbidden') || msg.includes('403');
    res.status(isPermission ? 403 : 500).json({
      error: msg,
      isPermissionError: isPermission,
      fix: isPermission
        ? 'Grant OnlineMeetings.ReadWrite.All (Application) to your Azure AD app and click "Grant admin consent" in the Azure portal.'
        : null,
    });
  }
});

// ── Call Logs ─────────────────────────────────────────────────────────────────

let callLogsReady = false;
async function ensureCallLogs() {
  if (callLogsReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS call_logs (
      id            SERIAL PRIMARY KEY,
      caller_id     UUID REFERENCES users(id) ON DELETE SET NULL,
      callee_id     UUID REFERENCES users(id) ON DELETE SET NULL,
      caller_name   VARCHAR(200) NOT NULL,
      callee_name   VARCHAR(200) NOT NULL,
      call_type     VARCHAR(10)  NOT NULL DEFAULT 'audio',
      status        VARCHAR(20)  NOT NULL DEFAULT 'answered',
      duration_secs INT          NOT NULL DEFAULT 0,
      started_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      ended_at      TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_call_logs_caller ON call_logs(caller_id);
    CREATE INDEX IF NOT EXISTS idx_call_logs_callee ON call_logs(callee_id);
    CREATE INDEX IF NOT EXISTS idx_call_logs_started ON call_logs(started_at DESC);
  `);
  callLogsReady = true;
}

// POST /chat/call-logs — save a completed call record
router.post('/call-logs', async (req, res) => {
  await ensureCallLogs();
  const { callee_id, callee_name, call_type, status, duration_secs, started_at } = req.body;
  if (!callee_id || !callee_name) return res.status(400).json({ error: 'callee_id and callee_name required' });

  const caller_name = req.user.full_name || req.user.name || req.user.username || 'Unknown';
  const result = await query(
    `INSERT INTO call_logs
       (caller_id, callee_id, caller_name, callee_name, call_type, status, duration_secs, started_at, ended_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
     RETURNING *`,
    [
      req.user.id, callee_id, caller_name, callee_name,
      call_type || 'audio',
      status    || 'answered',
      duration_secs || 0,
      started_at || new Date().toISOString(),
    ]
  );
  res.json({ log: result.rows[0] });
});

// GET /chat/call-logs — return calls where I am caller or callee, newest first
router.get('/call-logs', async (req, res) => {
  await ensureCallLogs();
  const { limit = 100 } = req.query;
  const result = await query(
    `SELECT * FROM call_logs
     WHERE caller_id = $1 OR callee_id = $1
     ORDER BY started_at DESC
     LIMIT $2`,
    [req.user.id, Math.min(parseInt(limit) || 100, 500)]
  );
  res.json({ logs: result.rows });
});

module.exports = router;
