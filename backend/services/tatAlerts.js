/**
 * Daily TAT deadline alert emails, replacing the Apps Script time-driven
 * trigger that called sendTATDeadlineEmails().
 */
const cron = require('node-cron');
const { getAllData } = require('./sheetsService');
const { buildTransport } = require('./mailer');

function config() {
  return {
    ALERT_RECIPIENTS: process.env.ALERT_RECIPIENTS || '',
    DASHBOARD_URL: process.env.DASHBOARD_URL || ''
  };
}

async function sendTATDeadlineEmails() {
  const allData = await getAllData();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTime = today.getTime();

  const reportAlerts = [];
  const rawDataAlerts = [];

  for (const sheetName in allData.sheets) {
    const rows = allData.sheets[sheetName].rows;

    rows.forEach(row => {
      const isReleased = (
        (row.status && row.status.toLowerCase().includes('release')) ||
        (row.status && row.status.toLowerCase().includes('complete')) ||
        row.reportReleasedDate ||
        row.rawDataSentTo
      );
      if (isReleased) return;

      if (row.tatReport) {
        const reportTime = new Date(row.tatReport).setHours(0, 0, 0, 0);
        if (reportTime === todayTime) {
          reportAlerts.push({ ...row, alertType: 'Report Due Today', deadline: row.tatReport });
        } else if (reportTime < todayTime) {
          reportAlerts.push({ ...row, alertType: 'Report Overdue', deadline: row.tatReport });
        }
      }

      if (row.tatRawData) {
        const rawTime = new Date(row.tatRawData).setHours(0, 0, 0, 0);
        if (rawTime === todayTime) {
          rawDataAlerts.push({ ...row, alertType: 'Raw Data Due Today', deadline: row.tatRawData });
        } else if (rawTime < todayTime) {
          rawDataAlerts.push({ ...row, alertType: 'Raw Data Overdue', deadline: row.tatRawData });
        }
      }
    });
  }

  if (reportAlerts.length > 0) {
    await sendAlertEmail(reportAlerts, 'TAT Report Deadline Alert', '#d9534f');
  }
  if (rawDataAlerts.length > 0) {
    await sendAlertEmail(rawDataAlerts, 'TAT Raw Data Deadline Alert', '#f0ad4e');
  }
  if (reportAlerts.length === 0 && rawDataAlerts.length === 0) {
    console.log('[tatAlerts] No deadlines found for today.');
  }
}

async function sendAlertEmail(samples, alertCategory, themeColor) {
  const { ALERT_RECIPIENTS, DASHBOARD_URL } = config();
  const subject = `TAT Alert - ${alertCategory}: ${samples.length} Samples Identified`;

  let htmlBody = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; max-width: 900px; border: 1px solid #eee; border-radius: 8px; overflow: hidden;">
      <div style="background-color: ${themeColor}; color: white; padding: 20px; text-align: center;">
        <h2 style="margin: 0;">${alertCategory}</h2>
        <p style="margin: 5px 0 0 0; opacity: 0.9;">Action required for the following samples</p>
      </div>

      <div style="padding: 20px;">
        <table border="0" cellpadding="10" style="border-collapse: collapse; width: 100%; font-size: 14px;">
          <thead>
            <tr style="border-bottom: 2px solid #eee; text-align: left; color: #666;">
              <th style="padding: 12px;">Anderson ID</th>
              <th style="padding: 12px;">Patient/Client</th>
              <th style="padding: 12px;">Test</th>
              <th style="padding: 12px;">Deadline</th>
              <th style="padding: 12px;">Category</th>
              <th style="padding: 12px;">Sheet</th>
            </tr>
          </thead>
          <tbody>
  `;

  samples.forEach((s, i) => {
    const bgColor = i % 2 === 0 ? '#ffffff' : '#f9f9f9';
    htmlBody += `
      <tr style="background-color: ${bgColor}; border-bottom: 1px solid #eee;">
        <td style="padding: 12px;"><strong>${s.andersonId || 'N/A'}</strong><br><small style="color: #888;">${s.sampleNumber || ''}</small></td>
        <td style="padding: 12px;">${s.name || 'N/A'}<br><small style="color: #666;">${s.clientName || ''}</small></td>
        <td style="padding: 12px;">${s.testName || 'N/A'}</td>
        <td style="padding: 12px; color: ${themeColor}; font-weight: bold;">${s.deadline}</td>
        <td style="padding: 12px;"><span style="background: ${themeColor}15; color: ${themeColor}; padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; border: 1px solid ${themeColor}30;">${s.alertType}</span></td>
        <td style="padding: 12px; color: #777;">${s._sourceSheet}</td>
      </tr>
    `;
  });

  htmlBody += `
          </tbody>
        </table>

        <div style="margin-top: 30px; text-align: center;">
          <p style="margin-bottom: 20px; color: #666;">Please update the status in the tracker once the task is completed.</p>
          <a href="${DASHBOARD_URL}" style="background-color: #3498db; color: white; padding: 12px 25px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">Open Lab Tracker Dashboard</a>
        </div>
      </div>

      <div style="background-color: #f8f9fa; padding: 15px; text-align: center; font-size: 11px; color: #999; border-top: 1px solid #eee;">
        This is an automated system notification. Please do not reply to this email.
      </div>
    </div>
  `;

  const transport = buildTransport();
  await transport.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: ALERT_RECIPIENTS,
    subject,
    html: htmlBody
  });

  console.log(`[tatAlerts] Email sent: ${subject} to ${ALERT_RECIPIENTS}`);
}

function scheduleTATAlerts() {
  const expr = process.env.TAT_ALERT_CRON || '0 9 * * *';
  cron.schedule(expr, () => {
    sendTATDeadlineEmails().catch(err => console.error('[tatAlerts] failed:', err.message));
  }, { timezone: process.env.TZ || 'Asia/Kolkata' });
  console.log(`[tatAlerts] scheduled with cron "${expr}"`);
}

module.exports = { scheduleTATAlerts, sendTATDeadlineEmails };
