/**
 * src/index.js  –  Express application entry point
 */

'use strict';

require('dotenv').config();

const express        = require('express');
const cors           = require('cors');
const productsRouter = require('./routes/products');

const app  = express();
const PORT = Number(process.env.PORT) || 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/products', productsRouter);

// ─── 404 handler ─────────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ─── Global error handler ─────────────────────────────────────────────────────

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start ───────────────────────────────────────────────────────────────────

// Only listen when this file is run directly (not imported by tests)
if (require.main === module) {
  const pool = require('./db/pool');

  // Retry DB connection up to 5 times with 3-second gaps.
  // Render's managed Postgres can take a few seconds to become reachable
  // after a fresh deploy, so a single immediate attempt often fails.
  const MAX_RETRIES    = 5;
  const RETRY_DELAY_MS = 3000;

  async function connectWithRetry(attempt = 1) {
    console.log(`🔄 DB connection attempt ${attempt}/${MAX_RETRIES}…`);
    try {
      await pool.query('SELECT 1');
      console.log('✅ Database connection successful');
      app.listen(PORT, () => {
        console.log(`🚀 Product Catalog API listening on port ${PORT}`);
        console.log('   GET /health');
        console.log('   GET /api/products');
        console.log('   GET /api/products/categories');
        console.log('   GET /api/products/:id');
      });
    } catch (err) {
      console.error(`❌ DB attempt ${attempt} failed — ${err.code || 'unknown code'}: ${err.message || '(no message)'}`);
      console.error('   Full error:', JSON.stringify({ code: err.code, detail: err.detail, hint: err.hint }));

      if (attempt < MAX_RETRIES) {
        console.log(`   Retrying in ${RETRY_DELAY_MS / 1000}s…`);
        setTimeout(() => connectWithRetry(attempt + 1), RETRY_DELAY_MS);
      } else {
        console.error('💀 All DB connection attempts exhausted. Exiting.');
        console.error('   → Make sure DATABASE_URL is set in Render → Environment Variables.');
        console.error('   → Copy it from: Render Dashboard → your PostgreSQL DB → Connect → External/Internal Database URL');
        process.exit(1);
      }
    }
  }

  connectWithRetry();
}

module.exports = app;   // exported for supertest
