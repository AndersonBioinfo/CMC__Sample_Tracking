/**
 * Outgoing mail, replacing Apps Script's MailApp with SMTP via nodemailer.
 */
const nodemailer = require('nodemailer');

function buildTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined
  });
}

function parseAttachments(attachments) {
  if (!Array.isArray(attachments)) return [];
  return attachments
    .map(file => {
      const match = String((file && file.dataUrl) || '').match(/^data:([^;]+);base64,(.+)$/);
      if (!match) return null;
      return { filename: file.name, content: Buffer.from(match[2], 'base64'), contentType: match[1] };
    })
    .filter(Boolean);
}

async function sendEmailAction(params) {
  try {
    // Strip double-newline before sign-off in plain text — prevents mail clients collapsing the signature.
    const rawBody = String(params.body || '').replace(/\n\n(Thanks\b)/g, '\n$1');

    let htmlBody;
    if (params.htmlBody) {
      htmlBody = params.htmlBody.replace(/<br\s*\/?><br\s*\/?>(Thanks\b)/gi, '<br>$1');
    } else {
      const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      htmlBody = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.8;color:#222;max-width:700px;">${esc(rawBody).replace(/\n/g, '<br>')}</div>`;
    }

    const transport = buildTransport();
    await transport.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: params.to || '',
      cc: params.cc || undefined,
      subject: params.subject || '(No Subject)',
      text: rawBody,
      html: htmlBody,
      attachments: parseAttachments(params.attachments)
    });

    return { success: true };
  } catch (err) {
    console.error('sendEmailAction error:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { sendEmailAction, buildTransport };
