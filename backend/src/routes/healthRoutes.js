const express = require('express');
const mongoose = require('mongoose');
const whatsappService = require('../services/whatsappService');
const metrics = require('../services/metricsService');

const router = express.Router();

router.get('/live', (req, res) => res.json({ success: true, status: 'LIVE' }));

router.get('/ready', (req, res) => {
  const databaseReady = mongoose.connection.readyState === 1;
  res.status(databaseReady ? 200 : 503).json({
    success: databaseReady,
    status: databaseReady ? 'READY' : 'NOT_READY',
    checks: { mongodb: databaseReady ? 'UP' : 'DOWN' },
  });
});

router.get('/whatsapp', (req, res) => {
  const state = whatsappService.getStatus();
  const { currentQrCode, ...publicState } = state;
  res.status(state.status === 'READY' ? 200 : 503).json({
    success: state.status === 'READY',
    ...publicState,
  });
});

router.get('/metrics', (req, res) => {
  const expected = process.env.METRICS_TOKEN;
  if (!expected || req.get('x-metrics-token') !== expected) {
    return res.status(404).json({ success: false, error: 'Recurso nao encontrado.' });
  }
  return res.json({ success: true, data: metrics.snapshot() });
});

module.exports = router;
