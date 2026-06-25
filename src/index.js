/**
 * src/index.js  –  Express application entry point
 */

'use strict';

require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
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
  app.listen(PORT, () => {
    console.log(`Product Catalog API listening on http://localhost:${PORT}`);
    console.log('Endpoints:');
    console.log('  GET /health');
    console.log('  GET /api/products');
    console.log('  GET /api/products/categories');
    console.log('  GET /api/products/:id');
  });
}

module.exports = app;   // exported for supertest
