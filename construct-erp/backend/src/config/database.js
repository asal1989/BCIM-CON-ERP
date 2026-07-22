// src/config/database.js
const { Pool } = require('pg');
require('dotenv').config();

let poolConfig;

// Only use DATABASE_URL for actual cloud hosts (Neon, Render, Railway, Supabase).
// If DATABASE_URL points to localhost / 127.0.0.1 it is a leftover system env
// from another project — ignore it and fall through to the local config below.
const isCloudUrl = process.env.DATABASE_URL &&
  !process.env.DATABASE_URL.includes('localhost') &&
  !process.env.DATABASE_URL.includes('127.0.0.1');

if (isCloudUrl) {
  // ── Cloud (Neon / Render / Railway) ─────────────────────────────────────────
  poolConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,
    min: 2,                          // keep a couple of connections warm — avoids
                                      // paying a fresh TCP+TLS handshake to the DB
                                      // host on every request after an idle gap
    idleTimeoutMillis: 600000,       // 10 min — was 30s, which tore the pool down
                                      // between the app's routine ~60s polling gaps
    connectionTimeoutMillis: 5000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
    // Kill runaway queries after 30 seconds
    options: '-c statement_timeout=30000',
  };
} else {
  // ── Local PostgreSQL — individual params, SSL explicitly off ─────────────────
  // Using individual params (NOT a connection string) bypasses pg-connection-string
  // URL parsing which in v2.12 doesn't reliably honour sslmode=disable.
  poolConfig = {
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME     || 'construct_erp',
    user:     process.env.DB_USER     || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl:      false,
    max: 20,
    min: 4,                          // keep 4 warm connections at all times
    idleTimeoutMillis: 600000,       // 10 min — don't kill idle connections too fast
    connectionTimeoutMillis: 10000,  // 10s acquire timeout
    keepAlive: true,                 // send TCP keep-alive to prevent silent drops
    keepAliveInitialDelayMillis: 10000,
    // Kill runaway queries after 30 seconds
    options: '-c statement_timeout=30000',
  };
}

const pool = new Pool(poolConfig);

pool.on('connect', () => {
  console.log('✅ PostgreSQL connected');
});

pool.on('error', (err) => {
  // Log but do NOT exit — the pool auto-recovers from transient
  // connection drops (network blip, DB restart, etc.)
  console.error('❌ PostgreSQL pool error (non-fatal):', err.message);
});

// Helper: query wrapper with error handling
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    if (process.env.NODE_ENV === 'development') {
      console.log(`🔍 Query [${Date.now() - start}ms]:`, text.substring(0, 80));
    }
    return res;
  } catch (err) {
    // Suppress noisy logs for "missing table/column" errors — these are usually
    // a missing migration and the caller often has a safeQuery wrapper to handle it.
    // Real callers without a wrapper will still see the thrown error.
    const noisyCodes = new Set(['42P01', '42703']); // undefined_table, undefined_column
    if (!noisyCodes.has(err.code)) {
      console.error('❌ Query error:', err.message);
    }
    throw err;
  }
};

// Helper: transaction wrapper
const withTransaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

module.exports = { pool, query, withTransaction };
