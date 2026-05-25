/**
 * Lab Tracker API
 * Handles data fetching for the Lab Sample Tracker Dashboard
 * and sends automatic email alerts for overdue samples.
 */

const CONFIG = {
  // Change this to the email address(es) that should receive alerts
  // Multiple emails can be separated by commas: "user1@example.com, user2@example.com"
  ALERT_RECIPIENTS: Session.getEffectiveUser().getEmail(),
  DASHBOARD_URL: "https://andersonlabs.github.io/lab-tracker/", // Update with your actual URL
  SHEET_NAME_PATTERN: /^[a-zA-Z]{3,}\s\d{4}$/i // Matches "Jan 2026", "April 2025", etc.
};

function doGet(e) {
  const action = e.parameter.action;

  if (action === 'getAllData') {
    return ContentService.createTextOutput(JSON.stringify(getAllData()))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput(JSON.stringify({ error: 'Invalid action' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const data   = JSON.parse(e.postData.contents);
    const action = data.action;

    if (action === 'sendEmail') {
      return ContentService.createTextOutput(JSON.stringify(sendEmailAction(data)))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ error: 'Invalid action' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    Logger.log('doPost error: ' + err.message);
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function sendEmailAction(params) {
  try {
    var rawBody = params.body || '';

    // Convert plain text to HTML so Gmail never line-wraps or shows the [...] trimmer
    var esc = function(s) {
      return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    };
    var htmlBody = '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.8;color:#222;">'
      + esc(rawBody).replace(/\n/g, '<br>')
      + '</div>';

    var emailOptions = {
      to:       params.to      || '',
      cc:       params.cc      || '',
      subject:  params.subject || '(No Subject)',
      body:     rawBody,
      htmlBody: htmlBody
    };

    if (params.attachments && params.attachments.length > 0) {
      emailOptions.attachments = params.attachments.map(function(file) {
        var match = file.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) return null;
        return Utilities.newBlob(Utilities.base64Decode(match[2]), match[1], file.name);
      }).filter(Boolean);
    }

    MailApp.sendEmail(emailOptions);
    Logger.log('Email sent to: ' + params.to + ' with ' + (params.attachments ? params.attachments.length : 0) + ' attachment(s)');
    return { success: true };
  } catch (e) {
    Logger.log('sendEmailAction error: ' + e.message);
    return { success: false, error: e.message };
  }
}

/**
 * Main function to fetch all data from all relevant sheets
 */
function getAllData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();
  const result = {
    sheets: {},
    metadata: {
      lastUpdated: new Date().toISOString(),
      totalSheets: 0,
      totalSamples: 0
    }
  };

  sheets.forEach(sheet => {
    const name = sheet.getName();
    // Only process sheets that look like data sheets (e.g., "Jan 2026")
    // or you can remove this check to process all sheets
    const data = sheet.getDataRange().getValues();
    const processed = processSheet(data, name);
    
    if (processed.rows.length > 0) {
      result.sheets[name] = {
        headers: processed.headers,
        rows: processed.rows
      };
      result.metadata.totalSheets++;
      result.metadata.totalSamples += processed.rows.length;
    }
  });

  return result;
}

// --- UPDATED processSheet logic (User Provided) ---
function processSheet(data, sheetName) {
  if (data.length < 2) return { headers: [], rows: [], sheetInfo: parseSheetName(sheetName) };

  const headers = data[0];
  const idx = {
    slNo:               findCol(headers, 'Sl No'),
    andersonId:         findCol(headers, 'Anderson ID'),
    sampleNumber:       findCol(headers, 'Sample Number'),
    remarks:            findCol(headers, 'Remarks'),
    name:               findCol(headers, 'Name'),
    gender:             findCol(headers, 'Gender'),
    testName:           findCol(headers, 'Test Name'),
    clientDoctorName:   findCol(headers, 'Client Doctor Name'),
    clientName:         findCol(headers, 'Client Name'),
    sampleType:         findCol(headers, 'Sample Type'),
    history:            findCol(headers, 'History'),
    receivedDate:       findCol(headers, 'Received Date'),
    tatRawData:         findCol(headers, 'TAT Raw date', 'TAT Raw data'),
    tatReport:          findCol(headers, 'TAT Report'),
    reports:            findCol(headers, 'Reports'),
    rawDataReceived:    findCol(headers, 'Raw data sent', 'Raw data received'),
    reportReleasedDate: findCol(headers, 'Report released date'),
    reportSentLink:     findCol(headers, 'Report sent link'),
    rawDataSentTo:      findCol(headers, 'Raw data sent to'),
    rawDataSentLink:    findCol(headers, 'Raw data sent link'),
    status:             findCol(headers, 'Status'), 
  };

  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (r.every(cell => cell === '' || cell === null || cell === undefined)) continue;

    rows.push({
      slNo:               getString(r, idx.slNo),
      andersonId:         getString(r, idx.andersonId),
      sampleNumber:       getString(r, idx.sampleNumber),
      remarks:            getString(r, idx.remarks),
      name:               getString(r, idx.name),
      gender:             getString(r, idx.gender),
      testName:           getString(r, idx.testName),
      clientDoctorName:   getString(r, idx.clientDoctorName),
      clientName:         getString(r, idx.clientName),
      sampleType:         getString(r, idx.sampleType),
      history:            getString(r, idx.history),
      receivedDate:       formatDate(r[idx.receivedDate]),
      tatRawData:         formatDate(r[idx.tatRawData]),
      tatReport:          formatDate(r[idx.tatReport]),
      reports:            formatDate(r[idx.reports]),
      rawDataReceived:    formatDate(r[idx.rawDataReceived]),
      reportReleasedDate: formatDate(r[idx.reportReleasedDate]),
      reportSentLink:     getString(r, idx.reportSentLink),
      rawDataSentTo:      getString(r, idx.rawDataSentTo),
      rawDataSentLink:    getString(r, idx.rawDataSentLink),
      status:             getString(r, idx.status),
      _sourceSheet:       sheetName // Internal use
    });
  }

  return { headers, rows, sheetInfo: parseSheetName(sheetName) };
}

/**
 * AUTOMATIC EMAIL TRIGGER FUNCTION
 * This is the function that was missing and causing errors.
 * It identifies overdue samples across all sheets and sends an email summary.
 */
function sendTATDeadlineEmails() {
  const allData = getAllData();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTime = today.getTime();
  
  const reportAlerts = [];
  const rawDataAlerts = [];
  
  for (const sheetName in allData.sheets) {
    const sheetData = allData.sheets[sheetName];
    const rows = sheetData.rows;
    
    rows.forEach(row => {
      // 1. Determine if the sample is already released
      const isReleased = (
        (row.status && row.status.toLowerCase().includes('release')) ||
        (row.status && row.status.toLowerCase().includes('complete')) ||
        row.reportReleasedDate ||
        row.rawDataSentTo
      );
      
      if (isReleased) return;
      
      // 2. Check TAT Report Deadline
      if (row.tatReport) {
        const reportDate = new Date(row.tatReport);
        reportDate.setHours(0,0,0,0);
        const reportTime = reportDate.getTime();
        
        if (reportTime === todayTime) {
          reportAlerts.push({...row, alertType: "Report Due Today", deadline: row.tatReport});
        } else if (reportTime < todayTime) {
          reportAlerts.push({...row, alertType: "Report Overdue", deadline: row.tatReport});
        }
      }
      
      // 3. Check TAT Raw Data Deadline
      if (row.tatRawData) {
        const rawDate = new Date(row.tatRawData);
        rawDate.setHours(0,0,0,0);
        const rawTime = rawDate.getTime();
        
        if (rawTime === todayTime) {
          rawDataAlerts.push({...row, alertType: "Raw Data Due Today", deadline: row.tatRawData});
        } else if (rawTime < todayTime) {
          rawDataAlerts.push({...row, alertType: "Raw Data Overdue", deadline: row.tatRawData});
        }
      }
    });
  }
  
  // Send separate emails if alerts exist
  if (reportAlerts.length > 0) {
    sendAlertEmail(reportAlerts, "TAT Report Deadline Alert", "#d9534f"); // Red for reports
  }
  
  if (rawDataAlerts.length > 0) {
    sendAlertEmail(rawDataAlerts, "TAT Raw Data Deadline Alert", "#f0ad4e"); // Orange for raw data
  }
  
  if (reportAlerts.length === 0 && rawDataAlerts.length === 0) {
    Logger.log("No deadlines found for today.");
  }
}

/**
 * Reusable helper to send alert emails
 */
function sendAlertEmail(samples, alertCategory, themeColor) {
  const subject = `🚨 ${alertCategory}: ${samples.length} Samples Identified`;
  
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
    const bgColor = i % 2 === 0 ? "#ffffff" : "#f9f9f9";
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
          <a href="${CONFIG.DASHBOARD_URL}" style="background-color: #3498db; color: white; padding: 12px 25px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">Open Lab Tracker Dashboard</a>
        </div>
      </div>
      
      <div style="background-color: #f8f9fa; padding: 15px; text-align: center; font-size: 11px; color: #999; border-top: 1px solid #eee;">
        This is an automated system notification. Please do not reply to this email.
      </div>
    </div>
  `;
  
  MailApp.sendEmail({
    to: CONFIG.ALERT_RECIPIENTS,
    subject: subject,
    htmlBody: htmlBody
  });
  
  Logger.log(`Email sent: ${subject} to ${CONFIG.ALERT_RECIPIENTS}`);
}

// --- HELPER FUNCTIONS ---

function findCol(headers, ...names) {
  for (let name of names) {
    const idx = headers.findIndex(h => h && h.toString().trim().toLowerCase() === name.toLowerCase());
    if (idx !== -1) return idx;
  }
  return -1;
}

function getString(row, idx) {
  if (idx === -1 || idx === undefined || row[idx] === undefined) return '';
  return String(row[idx]).trim();
}

function formatDate(val) {
  if (!val || val === '') return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  // If it's a string that looks like a date, try to parse it
  const d = new Date(val);
  if (!isNaN(d.getTime())) {
    return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  return String(val);
}

function parseSheetName(name) {
  const parts = name.split(' ');
  if (parts.length >= 2) {
    return { month: parts[0], year: parts[1] };
  }
  return { month: name, year: '' };
}
