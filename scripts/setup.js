/**
 * setup.js  –  One-shot setup helper
 *
 * Run this ONCE with your Postgres password:
 *
 *   node scripts/setup.js <your-postgres-password>
 *
 * It will:
 *   1. Create the products_db database (if it doesn't exist)
 *   2. Apply the schema (table + indexes)
 *   3. Seed 200,000 products using a single SQL statement
 *
 * After this succeeds, start the API with:  npm run dev
 */

'use strict';

const { Client, Pool } = require('pg');
const fs   = require('fs');
const path = require('path');

const password = process.argv[2];
if (!password) {
  console.error('Usage: node scripts/setup.js <postgres-password>');
  process.exit(1);
}

const BASE_CONFIG = {
  host:     'localhost',
  port:     5432,
  user:     'postgres',
  password,
};

const DB_NAME = 'products_db';
const COUNT   = 200_000;
const CATEGORIES = [
  'Electronics', 'Clothing', 'Books', 'Home & Garden',
  'Sports', 'Toys', 'Food & Grocery', 'Beauty',
];

async function createDatabase() {
  // Connect to the default 'postgres' database to issue CREATE DATABASE
  const client = new Client({ ...BASE_CONFIG, database: 'postgres' });
  await client.connect();
  const { rows } = await client.query(
    `SELECT 1 FROM pg_database WHERE datname = $1`, [DB_NAME],
  );
  if (rows.length === 0) {
    await client.query(`CREATE DATABASE ${DB_NAME}`);
    console.log(`✓ Database '${DB_NAME}' created`);
  } else {
    console.log(`✓ Database '${DB_NAME}' already exists`);
  }
  await client.end();
}

async function applySchema(pool) {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('✓ Schema applied (table + indexes)');
}

async function seed(pool) {
  console.log(`Seeding ${COUNT.toLocaleString()} products…`);
  const start = Date.now();

  const sql = `
    INSERT INTO products (name, category, price, created_at, updated_at)
    SELECT
      'Product-' || gs,
      (ARRAY[$2, $3, $4, $5, $6, $7, $8, $9])
          [floor(random() * 8)::int + 1],
      round((random() * 999 + 1)::numeric, 2),
      now() - (random() * interval '730 days'),
      now() - (random() * interval '30 days')
    FROM generate_series(1, $1) AS gs;
  `;
  await pool.query(sql, [COUNT, ...CATEGORIES]);

  const elapsed = ((Date.now() - start) / 1000).toFixed(2);
  console.log(`✓ Inserted ${COUNT.toLocaleString()} products in ${elapsed}s`);
}

(async () => {
  try {
    // Step 1 – create DB
    await createDatabase();

    // Step 2 – apply schema + seed (now connect to products_db)
    const pool = new Pool({ ...BASE_CONFIG, database: DB_NAME });

    await applySchema(pool);
    await seed(pool);
    await pool.end();

    // Step 3 – write .env so the API can connect
    const envContent = [
      `DB_HOST=localhost`,
      `DB_PORT=5432`,
      `DB_NAME=${DB_NAME}`,
      `DB_USER=postgres`,
      `DB_PASSWORD=${password}`,
      `PORT=3000`,
    ].join('\n') + '\n';

    fs.writeFileSync(path.join(__dirname, '..', '.env'), envContent);
    console.log('✓ .env written');

    console.log('\n🎉  Setup complete!  Run: npm run dev');
  } catch (err) {
    console.error('\n✗ Setup failed:', err.message);
    console.error('\nIf the error is "password authentication failed", re-run with the correct password:');
    console.error('  node scripts/setup.js <correct-password>');
    process.exit(1);
  }
})();
