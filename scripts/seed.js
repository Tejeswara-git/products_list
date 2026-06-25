/**
 * seed.js  –  Fast bulk-insert seed script
 *
 * Inserts 200 000 products using a SINGLE SQL statement.
 * PostgreSQL's generate_series() does all the work server-side;
 * there is NO JavaScript loop, NO per-row round-trip, NO batching.
 *
 * Typical run time: 2–5 seconds on a local machine.
 *
 * Usage:
 *   npm run seed              # uses .env for connection
 *   COUNT=50000 npm run seed  # insert a different number
 *
 * The script is idempotent in the sense that re-running it simply
 * appends another N products (useful for testing stability while
 * data is changing).
 */

'use strict';

require('dotenv').config();

const { Pool } = require('pg');

// How many products to insert (override via env)
const COUNT = Number(process.env.COUNT) || 200_000;

// Eight realistic categories — many products intentionally share them
const CATEGORIES = [
  'Electronics',
  'Clothing',
  'Books',
  'Home & Garden',
  'Sports',
  'Toys',
  'Food & Grocery',
  'Beauty',
];

const poolConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
  : {
      host:     process.env.DB_HOST     || 'localhost',
      port:     Number(process.env.DB_PORT)     || 5432,
      database: process.env.DB_NAME     || 'products_db',
      user:     process.env.DB_USER     || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
    };

const pool = new Pool(poolConfig);

async function seed() {
  console.log(`Seeding ${COUNT.toLocaleString()} products…`);
  const start = Date.now();

  /*
   * Key choices:
   *
   *  • generate_series(1, $1)  — server-side row generator; $1 = COUNT
   *  • random() * 8            — picks one of 8 categories uniformly
   *  • UNNEST($2::text[])      — passes the category array as a single
   *                              parameter; no string interpolation needed
   *  • created_at spread over 2 years so "newest first" ordering is
   *    visually interesting across all pages
   *  • updated_at within the last 30 days
   *  • price between $1.00 and $1000.00, 2 decimal places
   */
  const sql = `
    INSERT INTO products (name, category, price, created_at, updated_at)
    SELECT
      'Product-' || gs                                            AS name,
      (ARRAY[$2, $3, $4, $5, $6, $7, $8, $9])
          [floor(random() * 8)::int + 1]                         AS category,
      round((random() * 999 + 1)::numeric, 2)                    AS price,
      now() - (random() * interval '730 days')                   AS created_at,
      now() - (random() * interval '30 days')                    AS updated_at
    FROM generate_series(1, $1) AS gs;
  `;

  const params = [COUNT, ...CATEGORIES];
  await pool.query(sql, params);

  const elapsed = ((Date.now() - start) / 1000).toFixed(2);
  console.log(`✓ Inserted ${COUNT.toLocaleString()} products in ${elapsed}s`);
  await pool.end();
}

seed().catch(err => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
