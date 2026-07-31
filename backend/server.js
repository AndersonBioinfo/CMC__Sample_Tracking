require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');

const apiRouter = require('./routes/api');
const { scheduleTATAlerts } = require('./services/tatAlerts');

const app = express();

const corsOrigin = process.env.CORS_ORIGIN || '*';
app.use(cors({ origin: corsOrigin === '*' ? true : corsOrigin.split(',').map(o => o.trim()) }));

// The frontend posts sendEmail payloads as text/plain (to dodge CORS preflight);
// accept both that and application/json.
app.use(express.json({ limit: '20mb' }));
app.use(express.text({ type: 'text/plain', limit: '20mb' }));

app.use('/api', apiRouter);

const frontendDir = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendDir));
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`CMC Sample Tracking server listening on port ${PORT}`);

  if (process.env.ENABLE_TAT_ALERTS !== 'false') {
    scheduleTATAlerts();
  }
});
