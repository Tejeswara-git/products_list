/**
 * routes/products.js  –  Product catalog endpoints
 *
 * GET /api/products
 * ─────────────────
 * Query params:
 *   limit            – page size (default 20, max 100)
 *   category         – filter by exact category name (optional)
 *   cursor_created_at – ISO timestamp of last row seen (optional)
 *   cursor_id        – id of last row seen (optional)
 *
 * Both cursor params must be provided together, or neither.
 *
 * Response:
 *   {
 *     "data": [ { id, name, category, price, created_at, updated_at } ],
 *     "next_cursor": { "created_at": "…", "id": 12345 } | null
 *   }
 *
 * How keyset pagination guarantees stability
 * ──────────────────────────────────────────
 * The cursor is the pair (created_at, id) of the LAST item on the
 * current page.  The next query asks for rows WHERE:
 *
 *   (created_at, id) < (cursor_created_at, cursor_id)
 *
 * …ordered by (created_at DESC, id DESC).
 *
 * Because created_at and id are immutable, any rows inserted AFTER
 * page 1 has been fetched have newer created_at values.  They slot
 * into pages BEFORE the user's current position and never displace
 * the rows the user hasn't seen yet.  The user sees no duplicates
 * and misses no pre-existing rows.
 *
 * GET /api/products/categories
 * ────────────────────────────
 * Returns the list of distinct category names – useful for building
 * a filter UI.
 */

'use strict';

const { Router } = require('express');
const pool = require('../db/pool');

const router = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Clamp a value between min and max (inclusive).
 */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Build the paginated products query dynamically.
 *
 * Returns { text: string, values: any[] } ready for pool.query().
 *
 * We build the WHERE clause incrementally so the parameter indices
 * ($1, $2, …) always line up with the values array – avoiding any
 * risk of SQL injection through parameterisation.
 */
function buildProductsQuery({ limit, category, cursorCreatedAt, cursorId }) {
  const values = [];
  const conditions = [];

  // ── Category filter ───────────────────────────────────────────────
  if (category) {
    values.push(category);
    conditions.push(`category = $${values.length}`);
  }

  // ── Keyset cursor ─────────────────────────────────────────────────
  // Row tuple comparison: (created_at, id) < (cursor_created_at, cursor_id)
  // PostgreSQL evaluates this as:
  //   created_at < cursor_created_at
  //   OR (created_at = cursor_created_at AND id < cursor_id)
  // which is exactly what we want for a DESC sort on both columns.
  if (cursorCreatedAt && cursorId) {
    values.push(cursorCreatedAt, cursorId);
    const pCat = values.length - 1; // $N for created_at
    const pId  = values.length;     // $N+1 for id
    conditions.push(`(created_at, id) < ($${pCat}::timestamptz, $${pId}::bigint)`);
  }

  // ── LIMIT  ────────────────────────────────────────────────────────
  // Fetch one extra row so we can detect whether a next page exists
  // without a separate COUNT query.
  values.push(limit + 1);
  const pLimit = values.length;

  const where = conditions.length
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  const text = `
    SELECT id, name, category, price, created_at, updated_at
    FROM   products
    ${where}
    ORDER  BY created_at DESC, id DESC
    LIMIT  $${pLimit}
  `;

  return { text, values };
}

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * GET /api/products
 */
router.get('/', async (req, res, next) => {
  try {
    const limit = clamp(
      parseInt(req.query.limit, 10) || 20,
      1,
      100,
    );

    const category       = req.query.category        || null;
    const cursorCreatedAt = req.query.cursor_created_at || null;
    const cursorId       = req.query.cursor_id        || null;

    // Both cursor params must come together
    if ((cursorCreatedAt && !cursorId) || (!cursorCreatedAt && cursorId)) {
      return res.status(400).json({
        error: 'cursor_created_at and cursor_id must be provided together',
      });
    }

    const { text, values } = buildProductsQuery({
      limit,
      category,
      cursorCreatedAt,
      cursorId,
    });

    const { rows } = await pool.query(text, values);

    // Determine whether there is a next page
    const hasMore = rows.length > limit;
    const data    = hasMore ? rows.slice(0, limit) : rows;

    // Build the cursor from the last row on THIS page
    const lastRow    = data[data.length - 1];
    const nextCursor = hasMore && lastRow
      ? { created_at: lastRow.created_at, id: lastRow.id }
      : null;

    return res.json({ data, next_cursor: nextCursor });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/products/categories
 *
 * Returns the distinct category list.  Cached in memory for 60 s to
 * avoid a full table scan on every request – categories rarely change.
 */
let categoriesCache = null;
let cacheExpiresAt  = 0;

router.get('/categories', async (_req, res, next) => {
  try {
    const now = Date.now();
    if (!categoriesCache || now > cacheExpiresAt) {
      const { rows } = await pool.query(
        'SELECT DISTINCT category FROM products ORDER BY category',
      );
      categoriesCache = rows.map(r => r.category);
      cacheExpiresAt  = now + 60_000; // 60 seconds
    }
    return res.json({ categories: categoriesCache });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/products/:id
 *
 * Fetch a single product by id.
 */
router.get('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'id must be an integer' });
    }

    const { rows } = await pool.query(
      'SELECT id, name, category, price, created_at, updated_at FROM products WHERE id = $1',
      [id],
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    return res.json({ data: rows[0] });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
