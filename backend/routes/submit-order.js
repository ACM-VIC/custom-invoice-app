/**
 * Email Service
 * Sends invoice emails via Microsoft Outlook / Office 365 SMTP.
 *
 * Exports:
 *   sendInvoice()              — Normal path: customer invoice + PDF attachment
 *   sendQuoteRequest()         — Quote path:  internal team email with full order details
 *   sendQuoteAcknowledgement() — Quote path:  customer acknowledgement (no PDF)
 */

/**
 * =========================================
 * EMAIL SERVICE (SMTP + ATTACHMENTS)
 * =========================================
 *
 * PURPOSE:
 * Sends invoice emails with PDF attachments to:
 * - Customer (normal path)
 * - Plan Manager / Provider (NDIS / Aged Care, normal path)
 * - Internal team (quote/bulky path only)
 *
 * -----------------------------------------
 * WHAT YOU EDIT HERE
 * -----------------------------------------
 * SMTP SETTINGS:
 * - email credentials (env vars)
 * - Outlook / Office365 config
 *
 * EMAIL CONTENT:
 * - subject lines
 * - HTML email templates
 * - recipient logic per flow
 *
 * -----------------------------------------
 * DO NOT TOUCH
 * -----------------------------------------
 * - attachment handling (PDF buffer logic)
 * - transporter creation
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
    host:   'smtp.office365.com',
    port:   587,
    secure: false, // STARTTLS
    auth:   { user, pass },
    tls: {
      rejectUnauthorized: false,
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function storeMeta() {
  return {
    name:    process.env.STORE_NAME    || 'Aged Care & Medical',
    email:   process.env.STORE_EMAIL   || 'accounts@agedcareandmedical.com.au',
    abn:     process.env.STORE_ABN     || '54 164 689 294',
    phone:   process.env.STORE_PHONE   || '1300 003 930',
    from:    process.env.OUTLOOK_EMAIL,
  };
}

function formatFundingType(raw) {
  return (raw || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. NORMAL PATH — Customer invoice email (with PDF)
// ─────────────────────────────────────────────────────────────────────────────

function buildInvoiceEmailHtml({ formType, formData, draftOrder }) {
  const store       = storeMeta();
  const billingType = formType === 'ndis' ? 'NDIS' : 'Aged Care';

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; font-size: 15px; color: #222; margin: 0; padding: 0; background: #f5f5f5; }
        .wrap { max-width: 560px; margin: 32px auto; background: #fff; border-radius: 8px; overflow: hidden; }
        .header { background: #DC4E00; color: #fff; padding: 28px 32px; }
        .header h1 { margin: 0; font-size: 22px; font-weight: 700; }
        .header p  { margin: 6px 0 0; font-size: 14px; opacity: .75; }
        .body { padding: 28px 32px; }
        .body p { line-height: 1.6; margin: 0 0 14px; }
        .highlight { background: #f9f9f9; border-left: 3px solid #DC4E00; padding: 12px 16px; border-radius: 4px; margin: 20px 0; font-size: 14px; }
        .highlight strong { display: block; margin-bottom: 4px; font-size: 13px; color: #555; text-transform: uppercase; letter-spacing: .5px; }
        .footer { background: #f5f5f5; padding: 18px 32px; font-size: 12px; color: #888; text-align: center; }
      </style>
    </head>
    <body>
      <div class="wrap">
        <div class="header">
          <h1>Tax Invoice — ${draftOrder.name}</h1>
          <p>${billingType} Invoice Request from ${store.name}</p>
        </div>
        <div class="body">
          <p>Dear ${formData.submitter_full_name || formData.first_name},</p>
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
            ${formData.ndis_number || '—'}
          </div>
          ` : `
          <div class="highlight">
            <strong>Funding Type</strong>
            ${formatFundingType(formData.ac_funding_type)}
          </div>
          `}

          <p>Please review the attached PDF invoice and forward it to your ${formType === 'ndis' ? 'plan manager or support coordinator' : 'aged care coordinator'} for payment processing.</p>
          <p>If you have any questions, please don't hesitate to contact us at <a href="mailto:${store.email}">${store.email}</a>.</p>
          <p>Kind regards,<br><strong>${store.name} Team</strong></p>
        </div>
        <div class="footer">
          This is an automated email. Please do not reply directly to this message.<br>
          ABN: ${store.abn}
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * sendInvoice — Normal path only.
 * Sends the PDF invoice to customer, plan manager, or provider depending on form type.
 */
async function sendInvoice({ formType, formData, draftOrder, pdfBuffer }) {
  const transporter = createTransporter();
  const store       = storeMeta();
  const billingType = formType === 'ndis' ? 'NDIS' : 'Aged Care';

  const toAddresses = [
    formData.submitter_email,
    formData.participant_email,
    formType === 'ndis' && formData.ndis_funding_type === 'plan_managed'
      ? formData.plan_manager_email : null,
    formType === 'aged_care' && formData.ac_funding_type === 'home_care_package'
      ? formData.hcp_accounts_email : null,
    formType === 'aged_care' && formData.ac_funding_type === 'other_state_program'
      ? formData.other_auth_email : null,
  ]
    .filter(Boolean)
    .map(e => e.trim().toLowerCase())
    .filter((e, i, arr) => arr.indexOf(e) === i);

  const mailOptions = {
    from:    `"${store.name}" <${store.from}>`,
    to:      toAddresses.join(', '),
    subject: `${billingType} Tax Invoice ${draftOrder.name} — ${store.name}`,
    html:    buildInvoiceEmailHtml({ formType, formData, draftOrder }),
    attachments: pdfBuffer
      ? [{
          filename:    `Invoice-${draftOrder.name}.pdf`,
          content:     pdfBuffer,
          contentType: 'application/pdf',
        }]
      : [],
  };

  if (process.env.INTERNAL_BCC_EMAIL) {
    mailOptions.bcc = process.env.INTERNAL_BCC_EMAIL;
  }

  const info = await transporter.sendMail(mailOptions);
  console.log(`[email] Invoice sent: ${info.messageId} → ${toAddresses.join(', ')}`);
  return info;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. QUOTE PATH — Internal team email
//    Sent to INTERNAL_QUOTE_EMAIL so the team can quote and create the draft
//    order manually.
// ─────────────────────────────────────────────────────────────────────────────

function buildQuoteRequestHtml({ formType, formData, cart, shipping }) {
  const store       = storeMeta();
  const billingType = formType === 'ndis' ? 'NDIS' : 'Aged Care';
  const submittedAt = new Date().toLocaleString('en-AU', {
    timeZone: 'Australia/Melbourne',
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  // Build cart rows HTML
  const cartRowsHtml = (cart.items || []).map(item => `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;">${item.product_title || item.title}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:center;">${item.quantity}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;">$${(item.price / 100).toFixed(2)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;">$${((item.price * item.quantity) / 100).toFixed(2)}</td>
    </tr>
  `).join('');

  const cartSubtotal = ((cart.total_price || 0) / 100).toFixed(2);

  // Funding-specific detail rows
  let fundingDetail = '';
  if (formType === 'ndis') {
    fundingDetail = `
      <tr><td style="padding:5px 10px;color:#555;width:180px;">Funding Type</td><td style="padding:5px 10px;">${formatFundingType(formData.ndis_funding_type)}</td></tr>
      <tr><td style="padding:5px 10px;color:#555;">NDIS Number</td><td style="padding:5px 10px;">${formData.ndis_number || '—'}</td></tr>
      <tr><td style="padding:5px 10px;color:#555;">Submitter Role</td><td style="padding:5px 10px;">${formatFundingType(formData.ndis_submitter_role)}</td></tr>
      ${formData.ndis_funding_type === 'plan_managed' ? `
      <tr><td style="padding:5px 10px;color:#555;">Plan Manager</td><td style="padding:5px 10px;">${formData.plan_manager_company || '—'}</td></tr>
      <tr><td style="padding:5px 10px;color:#555;">Plan Mgr Email</td><td style="padding:5px 10px;">${formData.plan_manager_email || '—'}</td></tr>
      ` : ''}
    `;
  } else {
    fundingDetail = `
      <tr><td style="padding:5px 10px;color:#555;width:180px;">Funding Program</td><td style="padding:5px 10px;">${formatFundingType(formData.ac_funding_type)}</td></tr>
      <tr><td style="padding:5px 10px;color:#555;">Submitter Role</td><td style="padding:5px 10px;">${formatFundingType(formData.ac_submitter_role)}</td></tr>
      <tr><td style="padding:5px 10px;color:#555;">Client Reference</td><td style="padding:5px 10px;">${formData.client_reference || '—'}</td></tr>
      ${formData.ac_funding_type === 'home_care_package' ? `
      <tr><td style="padding:5px 10px;color:#555;">HCP Provider</td><td style="padding:5px 10px;">${formData.hcp_provider_name || '—'}</td></tr>
      <tr><td style="padding:5px 10px;color:#555;">HCP Accts Email</td><td style="padding:5px 10px;">${formData.hcp_accounts_email || '—'}</td></tr>
      ` : ''}
    `;
  }

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; font-size: 14px; color: #222; margin: 0; padding: 0; background: #f5f5f5; }
        .wrap { max-width: 640px; margin: 32px auto; background: #fff; border-radius: 8px; overflow: hidden; }
        .header { background: #1a1a1a; color: #fff; padding: 22px 28px; }
        .header h1 { margin: 0; font-size: 18px; font-weight: 700; }
        .header p  { margin: 5px 0 0; font-size: 13px; opacity: .7; }
        .alert-banner { background: #E65100; color: #fff; padding: 12px 28px; font-size: 13px; font-weight: 700; letter-spacing: .3px; }
        .section { padding: 20px 28px 0; }
        .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #DC4E00; border-bottom: 2px solid #f2e0d8; padding-bottom: 6px; margin-bottom: 12px; }
        table.detail { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
        table.detail td { font-size: 13px; vertical-align: top; }
        table.cart { width: 100%; border-collapse: collapse; margin-bottom: 0; }
        table.cart th { background: #f5f5f5; padding: 8px 10px; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: #555; text-align: left; }
        table.cart th:nth-child(2), table.cart th:nth-child(3), table.cart th:nth-child(4) { text-align: center; }
        table.cart th:last-child { text-align: right; }
        .totals-row { display: flex; justify-content: flex-end; padding: 12px 28px; border-top: 2px solid #eee; }
        .totals-box { font-size: 13px; }
        .totals-box .line { display: flex; justify-content: space-between; gap: 48px; padding: 3px 0; color: #555; }
        .totals-box .line.total { font-weight: 700; font-size: 15px; color: #222; border-top: 1px solid #ddd; margin-top: 6px; padding-top: 8px; }
        .shipping-box { margin: 16px 28px; background: #fff8e1; border: 1.5px solid #ffb74d; border-radius: 6px; padding: 14px 16px; font-size: 13px; }
        .shipping-box strong { display: block; font-size: 12px; text-transform: uppercase; letter-spacing: .5px; color: #e65100; margin-bottom: 6px; }
        .shipping-box .row { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 4px; }
        .shipping-box .pill { background: rgba(230,81,0,.1); border-radius: 4px; padding: 2px 8px; font-size: 12px; color: #bf360c; font-weight: 600; }
        .notes-box { margin: 0 28px 20px; background: #f9f9f9; border-left: 3px solid #ccc; border-radius: 4px; padding: 10px 14px; font-size: 13px; color: #555; }
        .action-banner { background: #DC4E00; color: #fff; padding: 16px 28px; font-size: 14px; line-height: 1.6; }
        .action-banner strong { display: block; font-size: 16px; margin-bottom: 6px; }
        .footer { background: #f5f5f5; padding: 14px 28px; font-size: 11px; color: #999; text-align: center; }
      </style>
    </head>
    <body>
      <div class="wrap">

        <div class="header">
          <h1>🚛 Freight Quote Request — Action Required</h1>
          <p>${store.name} · ${billingType} Order · Submitted ${submittedAt} (AEST)</p>
        </div>

        <div class="alert-banner">
          ⚠️ This order contains BULKY / FREIGHT items and requires a manual shipping quote before processing.
          Do NOT create a Shopify draft order until the freight cost has been confirmed with the customer.
        </div>

        <!-- CUSTOMER DETAILS -->
        <div class="section">
          <div class="section-title">Customer / Submitter</div>
          <table class="detail">
            <tr><td style="padding:5px 10px;color:#555;width:180px;">Name</td><td style="padding:5px 10px;">${formData.submitter_full_name || '—'}</td></tr>
            <tr><td style="padding:5px 10px;color:#555;">Email</td><td style="padding:5px 10px;">${formData.submitter_email || '—'}</td></tr>
            <tr><td style="padding:5px 10px;color:#555;">Phone</td><td style="padding:5px 10px;">${formData.submitter_phone || '—'}</td></tr>
          </table>
        </div>

        <!-- PARTICIPANT / DELIVERY -->
        <div class="section">
          <div class="section-title">Participant / Delivery Details</div>
          <table class="detail">
            <tr><td style="padding:5px 10px;color:#555;width:180px;">Participant Name</td><td style="padding:5px 10px;">${formData.participant_full_name || '—'}</td></tr>
            <tr><td style="padding:5px 10px;color:#555;">Delivery Address</td><td style="padding:5px 10px;">${formData.address_line1 || '—'}</td></tr>
            <tr><td style="padding:5px 10px;color:#555;">Suburb / State / PC</td><td style="padding:5px 10px;">${formData.suburb || ''} ${formData.state || ''} ${formData.postcode || ''}</td></tr>
            <tr><td style="padding:5px 10px;color:#555;">Delivery Phone</td><td style="padding:5px 10px;">${formData.delivery_phone || formData.submitter_phone || '—'}</td></tr>
          </table>
        </div>

        <!-- FUNDING -->
        <div class="section">
          <div class="section-title">${billingType} Funding Details</div>
          <table class="detail">
            ${fundingDetail}
          </table>
        </div>

        <!-- SHIPPING DETAILS -->
        <div class="shipping-box">
          <strong>🚛 Shipping / Freight Details</strong>
          <div class="row">
            <span class="pill">Category: ${shipping.categoryLabel || '—'}</span>
            <span class="pill">Zone: ${shipping.zoneLabel || '—'}</span>
            <span class="pill">Postcode: ${formData.postcode || '—'}</span>
            ${shipping.drivingItem ? `<span class="pill">Driver: ${shipping.drivingItem}</span>` : ''}
          </div>
          ${shipping.upgradeSummary ? `
          <div style="margin-top:8px;font-size:12px;color:#5d4037;">
            ⬆️ <strong>Quantity upgrade:</strong> ${shipping.upgradeSummary}
          </div>
          ` : ''}
          ${shipping.overrideNotes ? `
          <div style="margin-top:8px;font-size:12px;color:#4a148c;">
            📋 <strong>Freight notes from customer:</strong> ${shipping.overrideNotes}
          </div>
          ` : ''}
        </div>

        <!-- CART ITEMS -->
        <div class="section">
          <div class="section-title">Cart Items</div>
        </div>
        <table class="cart">
          <thead>
            <tr>
              <th>Product</th>
              <th style="text-align:center;">Qty</th>
              <th style="text-align:right;">Unit Price</th>
              <th style="text-align:right;">Line Total</th>
            </tr>
          </thead>
          <tbody>
            ${cartRowsHtml || '<tr><td colspan="4" style="padding:12px;color:#888;text-align:center;">No items</td></tr>'}
          </tbody>
        </table>

        <div class="totals-row">
          <div class="totals-box">
            <div class="line"><span>Subtotal (excl. freight)</span><span>$${cartSubtotal}</span></div>
            <div class="line"><span>Freight</span><span style="color:#e65100;">Manual Quote TBC</span></div>
            <div class="line total"><span>Total (excl. freight)</span><span>$${cartSubtotal}</span></div>
          </div>
        </div>

        ${formData.notes ? `
        <div style="padding:0 28px;">
          <div class="section-title" style="margin-top:16px;">Customer Notes</div>
          <div class="notes-box">${formData.notes}</div>
        </div>
        ` : ''}

        <div class="action-banner">
          <strong>✅ Next Steps for the Team:</strong>
          1. Contact the customer at <strong>${formData.submitter_email}</strong> / <strong>${formData.submitter_phone || '—'}</strong> with a freight quote.<br>
          2. Once confirmed, create the Shopify Draft Order manually with the agreed shipping cost.<br>
          3. Send the invoice to the customer / plan manager as appropriate.
        </div>

        <div class="footer">
          Internal use only — ${store.name} · ABN ${store.abn} · ${store.email}
        </div>

      </div>
    </body>
    </html>
  `;
}

/**
 * sendQuoteRequest — Quote path only.
 * Emails the internal team with everything they need to manually quote + process.
 */
async function sendQuoteRequest({ formType, formData, cart, shipping }) {
  const internalEmail = process.env.INTERNAL_QUOTE_EMAIL;
  if (!internalEmail) {
    throw new Error('INTERNAL_QUOTE_EMAIL env var is not set — cannot send quote request.');
  }

  const transporter = createTransporter();
  const store       = storeMeta();
  const billingType = formType === 'ndis' ? 'NDIS' : 'Aged Care';
  const customerName = formData.submitter_full_name || formData.participant_full_name || 'Customer';

  const mailOptions = {
    from:    `"${store.name} Orders" <${store.from}>`,
    to:      internalEmail,
    subject: `🚛 FREIGHT QUOTE NEEDED — ${billingType} Order from ${customerName} (${formData.postcode || 'no postcode'})`,
    html:    buildQuoteRequestHtml({ formType, formData, cart, shipping }),
  };

  // BCC internal orders address if configured separately
  if (process.env.INTERNAL_BCC_EMAIL && process.env.INTERNAL_BCC_EMAIL !== internalEmail) {
    mailOptions.bcc = process.env.INTERNAL_BCC_EMAIL;
  }

  const info = await transporter.sendMail(mailOptions);
  console.log(`[email] Quote request sent: ${info.messageId} → ${internalEmail}`);
  return info;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. QUOTE PATH — Customer acknowledgement email (no PDF, no draft order ref)
// ─────────────────────────────────────────────────────────────────────────────

function buildAcknowledgementHtml({ formType, formData, shipping }) {
  const store       = storeMeta();
  const billingType = formType === 'ndis' ? 'NDIS' : 'Aged Care';

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; font-size: 15px; color: #222; margin: 0; padding: 0; background: #f5f5f5; }
        .wrap { max-width: 560px; margin: 32px auto; background: #fff; border-radius: 8px; overflow: hidden; }
        .header { background: #DC4E00; color: #fff; padding: 28px 32px; }
        .header h1 { margin: 0; font-size: 22px; font-weight: 700; }
        .header p  { margin: 6px 0 0; font-size: 14px; opacity: .75; }
        .body { padding: 28px 32px; }
        .body p { line-height: 1.6; margin: 0 0 14px; }
        .steps { background: #f9f9f9; border-radius: 6px; padding: 16px 20px; margin: 20px 0; }
        .steps h3 { margin: 0 0 12px; font-size: 13px; text-transform: uppercase; letter-spacing: .5px; color: #555; }
        .step { display: flex; gap: 12px; margin-bottom: 10px; font-size: 14px; }
        .step-num { background: #DC4E00; color: #fff; border-radius: 50%; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex-shrink: 0; margin-top: 1px; }
        .highlight { background: #f9f9f9; border-left: 3px solid #DC4E00; padding: 12px 16px; border-radius: 4px; margin: 20px 0; font-size: 14px; }
        .highlight strong { display: block; margin-bottom: 4px; font-size: 13px; color: #555; text-transform: uppercase; letter-spacing: .5px; }
        .contact-row { display: flex; gap: 24px; flex-wrap: wrap; margin-top: 6px; }
        .contact-row a { color: #DC4E00; text-decoration: none; font-weight: 600; }
        .footer { background: #f5f5f5; padding: 18px 32px; font-size: 12px; color: #888; text-align: center; }
      </style>
    </head>
    <body>
      <div class="wrap">
        <div class="header">
          <h1>We've Received Your Order Request</h1>
          <p>${billingType} · ${store.name}</p>
        </div>
        <div class="body">
          <p>Dear ${formData.submitter_full_name || 'Customer'},</p>

          <p>
            Thank you for submitting your ${billingType} order request. 
            Because your order includes <strong>bulky or freight items</strong>, 
            we need to arrange a custom delivery quote for your area before we can finalise and process your order.
          </p>

          <div class="highlight">
            <strong>Delivery Location</strong>
            ${formData.suburb || ''} ${formData.state || ''} ${formData.postcode || ''}
          </div>

          <div class="highlight">
            <strong>Shipping Category</strong>
            ${shipping.categoryLabel || 'Bulky / Freight'}
            ${shipping.zoneLabel ? ` — ${shipping.zoneLabel}` : ''}
          </div>

          ${shipping.upgradeSummary ? `
          <div class="highlight">
            <strong>Why is this freight?</strong>
            ${shipping.upgradeSummary}. The combined quantity of your items requires freight delivery.
          </div>
          ` : ''}

          <div class="steps">
            <h3>What happens next</h3>
            <div class="step">
              <div class="step-num">1</div>
              <div>Our team will review your order and calculate the freight cost for your location.</div>
            </div>
            <div class="step">
              <div class="step-num">2</div>
              <div>We'll contact you at <strong>${formData.submitter_email}</strong> or <strong>${formData.submitter_phone || '—'}</strong> with the freight quote.</div>
            </div>
            <div class="step">
              <div class="step-num">3</div>
              <div>Once you approve the quote, we'll finalise the order and send your invoice for payment.</div>
            </div>
            <div class="step">
              <div class="step-num">4</div>
              <div>After payment is received, your order will be dispatched.</div>
            </div>
          </div>

          <p>
            If you have any questions in the meantime, please don't hesitate to get in touch:
          </p>
          <div class="contact-row">
            <a href="mailto:${store.email}">✉️ ${store.email}</a>
            <a href="tel:${store.phone}">📞 ${store.phone}</a>
          </div>

          <p style="margin-top:20px;">Kind regards,<br><strong>${store.name} Team</strong></p>
        </div>
        <div class="footer">
          This is an automated email. Please do not reply directly to this message.<br>
          ABN: ${store.abn}
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * sendQuoteAcknowledgement — Quote path only.
 * Tells the customer their request was received and the team will be in touch with a freight quote.
 */
async function sendQuoteAcknowledgement({ formType, formData, shipping }) {
  const customerEmail = formData.submitter_email;
  if (!customerEmail) {
    throw new Error('Cannot send acknowledgement — submitter_email is missing from formData.');
  }

  const transporter = createTransporter();
  const store       = storeMeta();
  const billingType = formType === 'ndis' ? 'NDIS' : 'Aged Care';

  const mailOptions = {
    from:    `"${store.name}" <${store.from}>`,
    to:      customerEmail,
    subject: `Your ${billingType} Order Request — Freight Quote Pending · ${store.name}`,
    html:    buildAcknowledgementHtml({ formType, formData, shipping }),
  };

  if (process.env.INTERNAL_BCC_EMAIL) {
    mailOptions.bcc = process.env.INTERNAL_BCC_EMAIL;
  }

  const info = await transporter.sendMail(mailOptions);
  console.log(`[email] Acknowledgement sent: ${info.messageId} → ${customerEmail}`);
  return info;
}

// ─────────────────────────────────────────────────────────────────────────────
module.exports = { sendInvoice, sendQuoteRequest, sendQuoteAcknowledgement };