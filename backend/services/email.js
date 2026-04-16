/**
 * Email Service
 * Sends invoice emails via Microsoft Outlook / Office 365 SMTP.
 */

const nodemailer = require('nodemailer');

// ── Transporter (Outlook / Office 365 SMTP) ──────────────────────────────────
function createTransporter() {
  const user = process.env.OUTLOOK_EMAIL;
  const pass = process.env.OUTLOOK_APP_PASSWORD;

  if (!user || !pass) {
    throw new Error('Missing OUTLOOK_EMAIL or OUTLOOK_APP_PASSWORD environment variables.');
  }

  return nodemailer.createTransport({
    host: 'smtp.office365.com',
    port: 587,
    secure: false, // STARTTLS
    auth: { user, pass },
    tls: {
      // FIX: Removed deprecated SSLv3 cipher — it is disabled on all modern servers
      // and was causing SMTP handshake failures on Azure.
      rejectUnauthorized: false,
    },
  });
}

/**
 * Build the HTML email body for the customer approval email.
 */
function buildEmailHtml({ formType, formData, draftOrder }) {
  const billingType = formType === 'ndis' ? 'NDIS' : 'Aged Care';
  const storeName   = process.env.STORE_NAME  || 'Aged Care & Medical';
  const storeEmail  = process.env.STORE_EMAIL || 'accounts@agedcareandmedical.com.au';
  const storeAbn    = process.env.STORE_ABN   || '54 164 689 294';

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; font-size: 15px; color: #222; margin: 0; padding: 0; background: #f5f5f5; }
        .wrap { max-width: 560px; margin: 32px auto; background: #fff; border-radius: 8px; overflow: hidden; }
        .header { background: #1a1a1a; color: #fff; padding: 28px 32px; }
        .header h1 { margin: 0; font-size: 22px; font-weight: 700; }
        .header p  { margin: 6px 0 0; font-size: 14px; opacity: .75; }
        .body { padding: 28px 32px; }
        .body p { line-height: 1.6; margin: 0 0 14px; }
        .highlight { background: #f9f9f9; border-left: 3px solid #1a1a1a; padding: 12px 16px; border-radius: 4px; margin: 20px 0; font-size: 14px; }
        .highlight strong { display: block; margin-bottom: 4px; font-size: 13px; color: #555; text-transform: uppercase; letter-spacing: .5px; }
        .footer { background: #f5f5f5; padding: 18px 32px; font-size: 12px; color: #888; text-align: center; }
      </style>
    </head>
    <body>
      <div class="wrap">
        <div class="header">
          <h1>Tax Invoice — ${draftOrder.name}</h1>
          <p>${billingType} Invoice Request from ${storeName}</p>
        </div>
        <div class="body">
          <p>Dear ${formData.first_name},</p>
          <p>Thank you for your order. Please find your <strong>${billingType} tax invoice</strong> attached to this email.</p>
          <p>Your order has been placed on hold as a draft. Once we receive confirmation of payment, we will process and fulfil your order.</p>

          <div class="highlight">
            <strong>Order reference</strong>
            ${draftOrder.name}
          </div>

          <div class="highlight">
            <strong>Total amount due</strong>
            $${parseFloat(draftOrder.total_price || 0).toFixed(2)} AUD (GST included)
          </div>

          ${formType === 'ndis' ? `
          <div class="highlight">
            <strong>NDIS number</strong>
            ${formData.ndis_number}
          </div>
          ` : `
          <div class="highlight">
            <strong>Aged Care package level</strong>
            ${formData.package_level}
          </div>
          `}

          <p>Please review the attached PDF invoice and forward it to your ${formType === 'ndis' ? 'plan manager or support coordinator' : 'aged care coordinator'} for payment processing.</p>
          <p>If you have any questions, please don't hesitate to contact us at <a href="mailto:${storeEmail}">${storeEmail}</a>.</p>
          <p>Kind regards,<br><strong>${storeName} Team</strong></p>
        </div>
        <div class="footer">
          This is an automated email. Please do not reply directly to this message.<br>
          ABN: ${storeAbn}
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Send the invoice email with PDF attachment.
 */
async function sendInvoice({ formType, formData, draftOrder, pdfBuffer }) {
  const transporter = createTransporter();
  const storeName   = process.env.STORE_NAME  || 'Aged Care & Medical';
  const fromEmail   = process.env.OUTLOOK_EMAIL;
  const billingType = formType === 'ndis' ? 'NDIS' : 'Aged Care';

  const toAddresses = [formData.email];
  if (formType === 'ndis' && formData.provider_email) {
    toAddresses.push(formData.provider_email);
  }

  const mailOptions = {
    from:    `"${storeName}" <${fromEmail}>`,
    to:      toAddresses.join(', '),
    subject: `${billingType} Tax Invoice ${draftOrder.name} — ${storeName}`,
    html:    buildEmailHtml({ formType, formData, draftOrder }),
    attachments: [
      {
        filename:    `Invoice-${draftOrder.name}.pdf`,
        content:     pdfBuffer,
        contentType: 'application/pdf',
      }
    ],
  };

  if (process.env.INTERNAL_BCC_EMAIL) {
    mailOptions.bcc = process.env.INTERNAL_BCC_EMAIL;
  }

  const info = await transporter.sendMail(mailOptions);
  console.log(`Email sent: ${info.messageId} → ${toAddresses.join(', ')}`);
  return info;
}

module.exports = { sendInvoice };
