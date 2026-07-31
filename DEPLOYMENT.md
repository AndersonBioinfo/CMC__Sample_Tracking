# Deploying to the IT server

This project moved off GitHub Pages + Google Apps Script and now runs as a
normal frontend/backend app:

- `frontend/` — the dashboard (static `index.html`), unchanged apart from
  pointing its API calls at `/api/exec` instead of the old Apps Script URL.
- `backend/` — a Node.js/Express server that:
  - reads sample data straight from the Google Sheet via the Google Sheets API
    (using a service account) — replaces `getAllData()` in `Code.gs`
  - sends report/alert emails via SMTP (`nodemailer`) — replaces `MailApp`
  - runs the daily TAT-deadline alert job via `node-cron` — replaces the
    Apps Script time trigger for `sendTATDeadlineEmails()`
  - serves the built frontend, so the whole thing is one process/one port

`Code.gs` is kept in the repo for reference only; it's no longer used once
this backend is deployed.

## 1. Prerequisites on the server

- Node.js 18+ and npm
- Network access to `sheets.googleapis.com` and your SMTP server

## 2. Google Sheets access (service account)

1. In Google Cloud Console, create a project (or reuse one) and enable the
   **Google Sheets API**.
2. Create a **Service Account**, then create a JSON key for it and download it.
3. Open the tracker spreadsheet in Google Sheets → Share → add the service
   account's `client_email` (looks like
   `xyz@your-project.iam.gserviceaccount.com`) as **Viewer**.
4. Copy the JSON key onto the server, e.g. as `backend/service-account.json`
   (this path is git-ignored).

## 3. Configure environment

```bash
cd backend
cp .env.example .env
```

Edit `.env`:

- `SPREADSHEET_ID` — the ID from the sheet's URL
  (`https://docs.google.com/spreadsheets/d/<ID>/edit`)
- `GOOGLE_APPLICATION_CREDENTIALS` — path to the service-account JSON key
  (or set `GOOGLE_SERVICE_ACCOUNT_JSON` to the key's contents as one line)
- `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` —
  your outgoing mail server (company SMTP relay, or Gmail with an
  [app password](https://myaccount.google.com/apppasswords))
- `MAIL_FROM` — the address mail is sent from
- `ALERT_RECIPIENTS` — who gets the daily TAT overdue-sample summary
- `DASHBOARD_URL` — the public URL of this dashboard once deployed, used in
  alert emails
- `PORT` — defaults to 3000

## 4. Install and run

```bash
cd backend
npm install
npm start
```

The dashboard is now served at `http://<server>:<PORT>/`, with the API under
`/api/exec` (same origin, no CORS needed).

## 5. Keep it running

Use a process manager so the server survives reboots/crashes, e.g. with PM2:

```bash
npm install -g pm2
pm2 start server.js --name cmc-sample-tracking
pm2 save
pm2 startup
```

Or run it as a systemd service / Windows service, whichever this IT server
standardizes on.

## 6. Reverse proxy (recommended)

Put the app behind IIS/nginx/Apache for TLS and a normal hostname, proxying
to `http://127.0.0.1:<PORT>`. No path rewriting is needed — the app already
serves both the frontend and `/api/*` from the same origin.

## 7. Verify

- Load the dashboard and confirm sample data appears (checks Sheets API access).
- Use "Send Mail" on a sample and confirm delivery (checks SMTP config).
- Check server logs at startup for `[tatAlerts] scheduled with cron "..."` to
  confirm the daily alert job is running.
