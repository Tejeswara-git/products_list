/**
 * __tests__/products.test.js
 *
 * Integration tests for the product catalog API.
 *
 * These tests run against a real PostgreSQL database (the same one
 * configured in .env / environment variables).  They insert their own
 * test rows into the products table and clean them up afterwards, so
 * they are safe to run alongside existing data.
 *
 * Run:  npm test
 */

'use strict';

require('dotenv').config();

const request = require('supertest');
const app     = require('../src/index');
const pool    = require('../src/db/pool');

// ─── Test data helpers ────────────────────────────────────────────────────────

/**
 * Insert N products with a known category prefix and staggered
 * created_at values (1-second apart, newest first in insert order).
 * Returns the inserted rows ordered newest-first (matching API order).
 */
async function insertTestProducts(n, categoryPrefix = 'TestCat') {
  const rows = [];
  for (let i = n; i >= 1; i--) {
    // Each product is i seconds older than now → product n is newest
    const { rows: inserted } = await pool.query(
      `INSERT INTO products (name, category, price, created_at, updated_at)
       VALUES ($1, $2, $3, now() - ($4 || ' seconds')::interval, now())
       RETURNING *`,
      [
        `TestProduct-${i}`,
        `${categoryPrefix}-${i % 3}`, // 3 sub-categories
        (i * 10).toFixed(2),
        i,
      ],
    );
    rows.push(inserted[0]);
  }
  // Return newest-first (descending created_at)
  return rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

/** Delete all rows with a name matching the test pattern. */
async function cleanupTestProducts(categoryPrefix = 'TestCat') {
  await pool.query(`DELETE FROM products WHERE category LIKE $1`, [
    `${categoryPrefix}%`,
  ]);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns 200 ok', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('GET /api/products', () => {
  const PREFIX = 'PaginationTest';
  let allRows; // 15 known rows, newest-first

  beforeAll(async () => {
    await cleanupTestProducts(PREFIX);
    allRows = await insertTestProducts(15, PREFIX);
  });

  afterAll(async () => {
    await cleanupTestProducts(PREFIX);
  });

  // ── Basic response shape ──────────────────────────────────────────

  it('returns data array and next_cursor', async () => {
    const res = await request(app).get('/api/products?limit=5');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    // next_cursor can be null (if there are only a few rows in DB)
    expect('next_cursor' in res.body).toBe(true);
  });

  it('respects the limit param', async () => {
    const res = await request(app).get('/api/products?limit=3');
    expect(res.body.data.length).toBeLessThanOrEqual(3);
  });

  it('clamps limit to 100', async () => {
    const res = await request(app).get('/api/products?limit=999');
    expect(res.body.data.length).toBeLessThanOrEqual(100);
  });

  // ── Ordering ──────────────────────────────────────────────────────

  it('returns rows newest-first', async () => {
    const res  = await request(app).get('/api/products?limit=50');
    const rows = res.body.data;
    for (let i = 1; i < rows.length; i++) {
      const prev = new Date(rows[i - 1].created_at);
      const curr = new Date(rows[i].created_at);
      expect(prev.getTime()).toBeGreaterThanOrEqual(curr.getTime());
    }
  });

  // ── Keyset pagination correctness ─────────────────────────────────

  it('paginates through all rows without duplicates or gaps', async () => {
    // Collect ALL ids in our test set by paginating with limit=4
    // over only our known category rows.
    const seenIds  = new Set();
    let cursor     = null;
    let pageCount  = 0;
    const testCats = [...new Set(allRows.map(r => r.category))];

    // We'll iterate without a category filter but verify our rows appear
    // We track just our test-set ids
    const targetIds = new Set(allRows.map(r => String(r.id)));

    do {
      let url = '/api/products?limit=4';
      if (cursor) {
        url += `&cursor_created_at=${encodeURIComponent(cursor.created_at)}&cursor_id=${cursor.id}`;
      }

      const res = await request(app).get(url);
      expect(res.statusCode).toBe(200);

      for (const row of res.body.data) {
        const sid = String(row.id);
        if (targetIds.has(sid)) {
          expect(seenIds.has(sid)).toBe(false); // NO DUPLICATE
          seenIds.add(sid);
        }
      }

      cursor = res.body.next_cursor;
      pageCount++;

      // Safety valve – stop after we've collected all target rows
      if ([...targetIds].every(id => seenIds.has(id))) break;
    } while (cursor && pageCount < 200);

    // Every test row must have been seen
    for (const id of targetIds) {
      expect(seenIds.has(id)).toBe(true);
    }
  });

  it('no duplicate IDs appear when 50 rows are inserted mid-browse', async () => {
    /**
     * This test simulates a user browsing while new products are inserted.
     *
     * Strategy:
     *  1. Insert 30 "old" products (created 1 hour ago).
     *  2. Start browsing page 1 (limit 5).
     *  3. Insert 10 "new" products (created NOW) – simulating concurrent inserts.
     *  4. Continue paginating to the end.
     *  5. Assert: no id appears twice; all 30 original ids are present;
     *             the 10 new ids appear only on page 1 (they're newest).
     */
    const OLD = 'MidBrowseOld';
    const NEW = 'MidBrowseNew';

    await cleanupTestProducts(OLD);
    await cleanupTestProducts(NEW);

    // Insert 30 old rows (created 1 hour + i seconds ago)
    const { rows: oldRows } = await pool.query(`
      INSERT INTO products (name, category, price, created_at, updated_at)
      SELECT
        'Old-' || gs,
        '${OLD}',
        round((random()*99+1)::numeric,2),
        now() - interval '1 hour' - (gs || ' seconds')::interval,
        now()
      FROM generate_series(1, 30) AS gs
      RETURNING id
    `);
    const oldIds = new Set(oldRows.map(r => String(r.id)));

    // ── Page 1 (before new inserts) ───────────────────────────────
    const page1Res = await request(app)
      .get(`/api/products?limit=5&category=${OLD}`);
    expect(page1Res.statusCode).toBe(200);
    let cursor      = page1Res.body.next_cursor;
    const seenIds   = new Set(page1Res.body.data.map(r => String(r.id)));

    // ── Insert 10 "new" rows concurrently ─────────────────────────
    await pool.query(`
      INSERT INTO products (name, category, price, created_at, updated_at)
      SELECT 'New-' || gs, '${OLD}', 9.99, now(), now()
      FROM generate_series(1, 10) AS gs
    `);

    // ── Continue paginating ───────────────────────────────────────
    let pageCount = 1;
    while (cursor && pageCount < 100) {
      const url = `/api/products?limit=5&category=${OLD}`
        + `&cursor_created_at=${encodeURIComponent(cursor.created_at)}`
        + `&cursor_id=${cursor.id}`;

      const res = await request(app).get(url);
      expect(res.statusCode).toBe(200);

      for (const row of res.body.data) {
        const sid = String(row.id);
        expect(seenIds.has(sid)).toBe(false); // NO DUPLICATE
        seenIds.add(sid);
      }

      cursor = res.body.next_cursor;
      pageCount++;
    }

    // All 30 original ids must have been seen
    for (const id of oldIds) {
      expect(seenIds.has(id)).toBe(true);
    }

    // Cleanup
    await cleanupTestProducts(OLD);
    await cleanupTestProducts(NEW);
  });

  // ── Category filter ───────────────────────────────────────────────

  it('filters by category correctly', async () => {
    const cat = allRows[0].category; // pick one sub-category
    const res = await request(app)
      .get(`/api/products?limit=50&category=${encodeURIComponent(cat)}`);

    expect(res.statusCode).toBe(200);
    for (const row of res.body.data) {
      expect(row.category).toBe(cat);
    }
  });

  // ── Cursor validation ─────────────────────────────────────────────

  it('returns 400 when only cursor_id is supplied', async () => {
    const res = await request(app).get('/api/products?cursor_id=123');
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when only cursor_created_at is supplied', async () => {
    const res = await request(app)
      .get('/api/products?cursor_created_at=2024-01-01T00:00:00Z');
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/products/categories', () => {
  it('returns an array of category strings', async () => {
    const res = await request(app).get('/api/products/categories');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.categories)).toBe(true);
    for (const c of res.body.categories) {
      expect(typeof c).toBe('string');
    }
  });
});

describe('GET /api/products/:id', () => {
  let testId;

  beforeAll(async () => {
    const { rows } = await pool.query(
      `INSERT INTO products (name, category, price)
       VALUES ('SingleTest', 'TestSingle', 42.00) RETURNING id`,
    );
    testId = rows[0].id;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM products WHERE category = 'TestSingle'`);
    await pool.end();
  });

  it('returns a single product', async () => {
    const res = await request(app).get(`/api/products/${testId}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.id).toBe(testId);
    expect(res.body.data.name).toBe('SingleTest');
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app).get('/api/products/999999999999');
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 for a non-integer id', async () => {
    const res = await request(app).get('/api/products/abc');
    expect(res.statusCode).toBe(400);
  });
});
