/**
 * Reads sample-tracking data straight out of the Google Sheet, in the same
 * shape the old Apps Script getAllData()/processSheet() produced.
 */
const { google } = require('googleapis');

let cachedAuth = null;

function getAuth() {
  if (cachedAuth) return cachedAuth;

  const scopes = ['https://www.googleapis.com/auth/spreadsheets.readonly'];

  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    cachedAuth = new google.auth.GoogleAuth({ credentials, scopes });
  } else {
    cachedAuth = new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS || './service-account.json',
      scopes
    });
  }
  return cachedAuth;
}

async function getSheetsClient() {
  const auth = getAuth();
  const client = await auth.getClient();
  return google.sheets({ version: 'v4', auth: client });
}

function findCol(headers, ...names) {
  for (const name of names) {
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
  if (val === undefined || val === null || val === '') return '';
  const s = String(val).trim();
  if (!s) return '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = '20' + y;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  const t = Date.parse(s);
  if (!isNaN(t)) return new Date(t).toISOString().slice(0, 10);

  return s;
}

function parseSheetName(name) {
  const parts = name.split(' ');
  if (parts.length >= 2) return { month: parts[0], year: parts[1] };
  return { month: name, year: '' };
}

function processSheet(data, sheetName) {
  if (data.length < 2) return { headers: [], rows: [], sheetInfo: parseSheetName(sheetName) };

  const headers = data[0];
  const idx = {
    slNo: findCol(headers, 'Sl No'),
    andersonId: findCol(headers, 'Anderson ID'),
    sampleNumber: findCol(headers, 'Sample Number'),
    remarks: findCol(headers, 'Remarks'),
    name: findCol(headers, 'Name'),
    gender: findCol(headers, 'Gender'),
    testName: findCol(headers, 'Test Name'),
    clientDoctorName: findCol(headers, 'Client Doctor Name'),
    clientName: findCol(headers, 'Client Name'),
    sampleType: findCol(headers, 'Sample Type'),
    history: findCol(headers, 'History'),
    receivedDate: findCol(headers, 'Received Date'),
    tatRawData: findCol(headers, 'TAT Raw date', 'TAT Raw data'),
    tatReport: findCol(headers, 'TAT Report'),
    reports: findCol(headers, 'Reports'),
    rawDataReceived: findCol(headers, 'Raw data sent', 'Raw data received'),
    reportReleasedDate: findCol(headers, 'Report released date'),
    reportSentLink: findCol(headers, 'Report sent link'),
    rawDataSentTo: findCol(headers, 'Raw data sent to'),
    rawDataSentLink: findCol(headers, 'Raw data sent link'),
    status: findCol(headers, 'Status')
  };

  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (r.every(cell => cell === '' || cell === null || cell === undefined)) continue;

    rows.push({
      slNo: getString(r, idx.slNo),
      andersonId: getString(r, idx.andersonId),
      sampleNumber: getString(r, idx.sampleNumber),
      remarks: getString(r, idx.remarks),
      name: getString(r, idx.name),
      gender: getString(r, idx.gender),
      testName: getString(r, idx.testName),
      clientDoctorName: getString(r, idx.clientDoctorName),
      clientName: getString(r, idx.clientName),
      sampleType: getString(r, idx.sampleType),
      history: getString(r, idx.history),
      receivedDate: formatDate(r[idx.receivedDate]),
      tatRawData: formatDate(r[idx.tatRawData]),
      tatReport: formatDate(r[idx.tatReport]),
      reports: formatDate(r[idx.reports]),
      rawDataReceived: formatDate(r[idx.rawDataReceived]),
      reportReleasedDate: formatDate(r[idx.reportReleasedDate]),
      reportSentLink: getString(r, idx.reportSentLink),
      rawDataSentTo: getString(r, idx.rawDataSentTo),
      rawDataSentLink: getString(r, idx.rawDataSentLink),
      status: getString(r, idx.status),
      _sourceSheet: sheetName
    });
  }

  return { headers, rows, sheetInfo: parseSheetName(sheetName) };
}

async function getAllData() {
  const spreadsheetId = process.env.SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error('SPREADSHEET_ID is not configured');

  const sheets = await getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetNames = meta.data.sheets.map(s => s.properties.title);

  const result = {
    sheets: {},
    metadata: {
      lastUpdated: new Date().toISOString(),
      totalSheets: 0,
      totalSamples: 0
    }
  };

  if (sheetNames.length === 0) return result;

  const ranges = sheetNames.map(name => `'${name}'!A:Z`);
  const batch = await sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges });

  (batch.data.valueRanges || []).forEach((vr, i) => {
    const name = sheetNames[i];
    const data = vr.values || [];
    const processed = processSheet(data, name);

    if (processed.rows.length > 0) {
      result.sheets[name] = { headers: processed.headers, rows: processed.rows };
      result.metadata.totalSheets++;
      result.metadata.totalSamples += processed.rows.length;
    }
  });

  return result;
}

/**
 * Best-effort support for the frontend's "getRegistrations" call — returns the
 * raw rows (as header-keyed objects) of whichever sheet has "regist" in its name.
 */
async function getRegistrationRows() {
  const spreadsheetId = process.env.SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error('SPREADSHEET_ID is not configured');

  const sheets = await getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const regSheetName = meta.data.sheets
    .map(s => s.properties.title)
    .find(n => /regist/i.test(n));

  if (!regSheetName) return [];

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${regSheetName}'!A:Z`
  });
  const data = res.data.values || [];
  if (data.length < 2) return [];

  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] !== undefined ? row[i] : ''; });
    return obj;
  });
}

module.exports = { getAllData, getRegistrationRows, processSheet, formatDate, parseSheetName };
