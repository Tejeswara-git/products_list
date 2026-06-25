/**
 * applySchema.js
 *
 * Reads schema.sql and executes it against the configured database.
 * Run with:  npm run schema
 *
 * This is idempotent – uses IF NOT EXISTS throughout, so it is safe
 * to re-run on an existing database.
 */

'use strict';

require('dotenv').config();

const fs   = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     Number(process.env.DB_PORT)     || 5432,
  database: process.env.DB_NAME     || 'products_db',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

async function applySchema() {
  const sqlFile = path.join(__dirname, 'schema.sql');
  const sql     = fs.readFileSync(sqlFile, 'utf8');

  console.log('Applying schema…');
  await pool.query(sql);
  console.log('Schema applied successfully.');
  await pool.end();
}

applySchema().catch(err => {
  console.error('Schema application failed:', err.message);
  process.exit(1);
});
