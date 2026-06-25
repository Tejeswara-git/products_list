/**
 * db/pool.js  –  Singleton pg connection pool
 *
 * Connection strategy:
 *  1. If DATABASE_URL is set (Render, Railway, Supabase, etc.) → use it with SSL.
 *  2. Otherwise fall back to individual DB_* env vars (local dev).
 */

'use strict';

require('dotenv').config();

const { Pool } = require('pg');

let poolConfig;

if (process.env.DATABASE_URL) {
  console.log('🔌 DB mode: DATABASE_URL detected — using connection string with SSL');
  poolConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis:      30_000,
    connectionTimeoutMillis: 10_000,
  };
} else {
  console.log('🔌 DB mode: No DATABASE_URL — falling back to DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD');
  console.log(`   DB_HOST=${process.env.DB_HOST || '(not set, defaulting to localhost)'}`);
  console.log(`   DB_PORT=${process.env.DB_PORT || '(not set, defaulting to 5432)'}`);
  console.log(`   DB_NAME=${process.env.DB_NAME || '(not set, defaulting to products_db)'}`);
  console.log(`   DB_USER=${process.env.DB_USER || '(not set, defaulting to postgres)'}`);
  console.log(`   DB_PASSWORD=${process.env.DB_PASSWORD ? '***' : '(not set)'}`);
  poolConfig = {
    host:     process.env.DB_HOST     || 'localhost',
    port:     Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME     || 'products_db',
    user:     process.env.DB_USER     || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    max: 10,
    idleTimeoutMillis:      30_000,
    connectionTimeoutMillis: 5_000,
  };
}

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('Unexpected pg pool error:', err.message);
});

module.exports = pool;
