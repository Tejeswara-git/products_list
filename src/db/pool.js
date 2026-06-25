/**
 * db/pool.js  –  Singleton pg connection pool
 *
 * Import this wherever you need a database connection.
 * The pool is created once and reused across all requests.
 *
 * Connection strategy:
 *  1. If DATABASE_URL is set (e.g. on Render), use it with SSL enabled.
 *  2. Otherwise fall back to individual DB_* env vars (local dev).
 */

'use strict';

require('dotenv').config();

const { Pool } = require('pg');

let poolConfig;

if (process.env.DATABASE_URL) {
  // Render (and most cloud providers) supply a single connection string.
  // SSL is required – rejectUnauthorized:false accepts self-signed certs
  // issued by managed-Postgres providers (Render, Supabase, Railway, etc.).
  poolConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  };
} else {
  // Local development – individual env vars, no SSL needed.
  poolConfig = {
    host:     process.env.DB_HOST     || 'localhost',
    port:     Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME     || 'products_db',
    user:     process.env.DB_USER     || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  };
}

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('Unexpected pg pool error:', err.message);
});

module.exports = pool;
