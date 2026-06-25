/**
 * db/pool.js  –  Singleton pg connection pool
 *
 * Import this wherever you need a database connection.
 * The pool is created once and reused across all requests.
 */

'use strict';

require('dotenv').config();

const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     Number(process.env.DB_PORT)     || 5432,
  database: process.env.DB_NAME     || 'products_db',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  // Keep up to 10 clients in the pool; more than enough for a local API.
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('Unexpected pg pool error:', err.message);
});

module.exports = pool;
