const express = require('express');
const router = express.Router();

const { getAllData, getRegistrationRows } = require('../services/sheetsService');
const { sendEmailAction } = require('../services/mailer');

// Mirrors the old Apps Script doGet(): GET /api/exec?action=getAllData|getRegistrations
router.get('/exec', async (req, res) => {
  const action = req.query.action;

  try {
    if (action === 'getAllData') {
      const data = await getAllData();
      return res.json(data);
    }

    if (action === 'getRegistrations') {
      const registrations = await getRegistrationRows();
      return res.json({ registrations });
    }

    return res.status(400).json({ error: 'Invalid action' });
  } catch (err) {
    console.error('GET /exec error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// Mirrors the old Apps Script doPost(): POST /api/exec { action: 'sendEmail', ... }
router.post('/exec', async (req, res) => {
  try {
    let body = req.body;
    if (Buffer.isBuffer(body) || typeof body === 'string') {
      body = JSON.parse(body || '{}');
    }

    const action = body.action;

    if (action === 'sendEmail') {
      const result = await sendEmailAction(body);
      return res.json(result);
    }

    return res.status(400).json({ error: 'Invalid action' });
  } catch (err) {
    console.error('POST /exec error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
