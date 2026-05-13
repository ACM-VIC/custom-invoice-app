/**
 * routes/submit-order.js  —  Backend handler for NDIS / Aged Care order submissions
 *
 * What this module does:
 *  1. Receives the form payload (formData, cart) from the frontend
 *  2. Extracts shipping details from formData fields set by the shipping module
 *  3. Creates a Shopify Draft Order with line_items, shipping_address, shipping_line
 *  4. Generates a PDF invoice via services/pdf.js  (was commented out — now wired in)
 *  5. Sends the confirmation email via services/email.js (was commented out — now wired in)
 *
 * ─── ENVIRONMENT VARIABLES REQUIRED ─────────────────────────────────────────
 *  SHOPIFY_STORE_DOMAIN   e.g. your-store.myshopify.com   ← must NOT include https://
 *  SHOPIFY_ADMIN_TOKEN    Admin API access token (write_draft_orders scope)
 *  SHOPIFY_API_VERSION    e.g. 2024-01  (falls back to '2024-01' if missing)
 *
 *  SMTP_HOST / SMTP_PORT / SMTP_SECURE / SMTP_USER / SMTP_PASS
 *  EMAIL_FROM / EMAIL_ORDERS_CC
 *  (see services/email.js for full list)
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const express    = require('express');
const router     = express.Router();

// ── Service imports ───────────────────────────────────────────────────────────
// These were missing / commented out before — this is what caused the bug.
const { generateInvoice }   = require('../services/pdf');    // Puppeteer + Handlebars
const { sendInvoiceEmail }  = require('../services/email');  // Nodemailer

// ─── ENV VARIABLES ────────────────────────────────────────────────────────────
const SHOPIFY_DOMAIN  = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_TOKEN   = process.env.SHOPIFY_ADMIN_TOKEN;
const SHOPIFY_VERSION = process.env.SHOPIFY_API_VERSION || '2024-01';

// ─── STARTUP GUARD ────────────────────────────────────────────────────────────
if (!SHOPIFY_DOMAIN) {
  console.error(
    '[submit-order] ⚠️  SHOPIFY_STORE_DOMAIN is not set. ' +
    'Set it in Azure Portal → App Service → Configuration → Application Settings.'
  );
}
if (!SHOPIFY_TOKEN) {
  console.error(
    '[submit-order] ⚠️  SHOPIFY_ADMIN_TOKEN is not set. ' +
    'Set it in Azure Portal → App Service → Configuration.'
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SHIPPING HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function extractShippingLine(formData) {
  const rawPrice    = formData.shipping_price;
  const isQuote     = rawPrice === 'quote';
  const priceNumber = (!rawPrice || isQuote) ? null : parseFloat(rawPrice);

  return {
    title:         formData.shipping_title         || 'Delivery',
    price:         isQuote ? 'quote' : priceNumber,
    priceDisplay:  formData.shipping_price_display  || (isQuote ? 'Manual Quote' : 'TBC'),
    category:      formData.shipping_category       || '',
    categoryLabel: formData.shipping_category_label || '',
    zone:          formData.shipping_zone           || '',
    zoneLabel:     formData.shipping_zone_label     || '',
    isQuote,
    overrideNotes: formData.shipping_override_notes || '',
  };
}

// ─── SHOPIFY HELPERS ──────────────────────────────────────────────────────────

function buildShopifyShippingLine(shipping) {
  if (!shipping || shipping.price === null) return null;
  const priceValue = (shipping.isQuote || shipping.price === 'quote')
    ? '0.00'
    : Number(shipping.price).toFixed(2);
  return { title: shipping.title || 'Delivery', price: priceValue, custom: true };
}

function buildLineItems(cartItems) {
  if (!cartItems?.length) return [];
  return cartItems.map(item => ({
    variant_id: item.variant_id,
    quantity:   item.quantity,
    price:      (item.price / 100).toFixed(2),
    title:      item.product_title || item.title,
  }));
}

function buildShippingAddress(formData) {
  const fullName  = formData.participant_full_name || '';
  const nameParts = fullName.trim().split(' ');
  return {
    first_name: nameParts[0] || '',
    last_name:  nameParts.slice(1).join(' ') || '',
    address1:   formData.address_line1 || '',
    city:       formData.suburb        || '',
    province:   formData.state         || '',
    zip:        formData.postcode      || '',
    country:    'AU',
    phone:      formData.delivery_phone || formData.submitter_phone || '',
  };
}

function buildNoteAttributes(formType, formData, shipping) {
  const priceNote = shipping.isQuote
    ? 'Manual Quote Required'
    : (shipping.price !== null ? `$${Number(shipping.price).toFixed(2)}` : 'TBC');

  const attrs = [
    { name: 'Form Type',         value: formType === 'ndis' ? 'NDIS' : 'Aged Care / Government' },
    { name: 'Submitter Name',    value: formData.submitter_full_name  || '' },
    { name: 'Submitter Email',   value: formData.submitter_email      || '' },
    { name: 'Submitter Phone',   value: formData.submitter_phone      || '' },
    { name: 'Participant Name',  value: formData.participant_full_name || '' },
    { name: 'Delivery Suburb',   value: formData.suburb               || '' },
    { name: 'Delivery State',    value: formData.state                || '' },
    { name: 'Delivery Postcode', value: formData.postcode             || '' },
    { name: 'Shipping Category', value: shipping.categoryLabel        || '' },
    { name: 'Delivery Zone',     value: shipping.zoneLabel            || '' },
    { name: 'Shipping Method',   value: shipping.title                || '' },
    { name: 'Shipping Fee',      value: priceNote                        },
  ];

  if (shipping.overrideNotes) {
    attrs.push({ name: 'Freight Notes', value: shipping.overrideNotes });
  }

  if (formType === 'ndis') {
    attrs.push(
      { name: 'Funding Type',   value: formData.ndis_funding_type   || '' },
      { name: 'NDIS Number',    value: formData.ndis_number         || '' },
      { name: 'Submitter Role', value: formData.ndis_submitter_role || '' },
    );
    if (formData.ndis_funding_type === 'plan_managed') {
      attrs.push(
        { name: 'Plan Manager',   value: formData.plan_manager_company || '' },
        { name: 'Plan Mgr Email', value: formData.plan_manager_email   || '' },
      );
    }
  }

  if (formType === 'aged_care') {
    attrs.push(
      { name: 'Funding Program',  value: formData.ac_funding_type   || '' },
      { name: 'Submitter Role',   value: formData.ac_submitter_role || '' },
      { name: 'Client Reference', value: formData.client_reference  || '' },
    );
  }

  if (formData.notes) {
    attrs.push({ name: 'Notes', value: formData.notes });
  }

  return attrs.filter(a => a.value && a.value.trim() !== '');
}

async function createShopifyDraftOrder({ formType, formData, cart, shipping }) {
  if (!SHOPIFY_DOMAIN || !SHOPIFY_TOKEN) {
    throw new Error(
      'Shopify env vars not configured — set SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_TOKEN.'
    );
  }

  const lineItems       = buildLineItems(cart.items);
  const shippingAddress = buildShippingAddress(formData);
  const noteAttributes  = buildNoteAttributes(formType, formData, shipping);
  const shopifyShipping = buildShopifyShippingLine(shipping);

  const draftOrderPayload = {
    draft_order: {
      line_items:       lineItems,
      shipping_address: shippingAddress,
      billing_address:  shippingAddress,
      note_attributes:  noteAttributes,
      note:             formData.notes || '',
      email:            formData.submitter_email || '',
      phone:            formData.submitter_phone || '',
      tags: [
        formType === 'ndis' ? 'NDIS' : 'Aged Care',
        formData.ndis_funding_type || formData.ac_funding_type || '',
        'Modal Order',
        shipping.isQuote ? 'Freight Quote Needed' : '',
      ].filter(Boolean).join(', '),
      ...(shopifyShipping && { shipping_line: shopifyShipping }),
    },
  };

  const url = `https://${SHOPIFY_DOMAIN}/admin/api/${SHOPIFY_VERSION}/draft_orders.json`;
  console.log(`[submit-order] Creating Shopify draft order → ${url}`);

  const res = await fetch(url, {
    method:  'POST',
    headers: {
      'Content-Type':           'application/json',
      'X-Shopify-Access-Token': SHOPIFY_TOKEN,
    },
    body: JSON.stringify(draftOrderPayload),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Shopify API error (${res.status}): ${errBody}`);
  }

  const json = await res.json();
  return json.draft_order;
}

// ─── PDF HELPERS ──────────────────────────────────────────────────────────────

function buildPdfShippingRow(shipping) {
  if (!shipping || (shipping.price === null && !shipping.isQuote)) {
    return {
      sku: '', description: 'Delivery — to be arranged', qty: 1,
      unit_price: null, total: null, is_shipping: true,
      note: 'Please contact us for a delivery quote.',
    };
  }
  if (shipping.isQuote) {
    return {
      sku: '',
      description: `${shipping.title} — ${shipping.categoryLabel} (${shipping.zoneLabel})`,
      qty: 1, unit_price: null, total: null, display: 'Manual Quote', is_shipping: true,
      note: shipping.overrideNotes
        ? `Freight notes: ${shipping.overrideNotes}`
        : 'Freight cost to be confirmed. Our team will contact you.',
    };
  }
  const price = Number(shipping.price);
  return {
    sku: '', description: `${shipping.title}`, qty: 1,
    unit_price: price, total: price,
    display: shipping.priceDisplay || `$${price.toFixed(2)}`,
    is_shipping: true,
    note: `${shipping.categoryLabel} · ${shipping.zoneLabel}`,
  };
}

function buildPdfTotals(cart, shipping) {
  const subtotalCents  = cart.total_price || 0;
  const subtotalDollar = subtotalCents / 100;
  const shippingDollar = (shipping && !shipping.isQuote && shipping.price !== null)
    ? Number(shipping.price) : 0;
  const grandTotal = subtotalDollar + shippingDollar;

  let shippingDisplay;
  if (!shipping || shipping.price === null)  shippingDisplay = 'TBC';
  else if (shipping.isQuote)                 shippingDisplay = 'Manual Quote — To Be Confirmed';
  else                                       shippingDisplay = shipping.priceDisplay || `$${shippingDollar.toFixed(2)}`;

  return {
    subtotal_cents:      subtotalCents,
    subtotal_display:    `$${subtotalDollar.toFixed(2)}`,
    shipping_price:      shippingDollar,
    shipping_display:    shippingDisplay,
    shipping_title:      shipping?.title        || 'Delivery',
    shipping_category:   shipping?.categoryLabel || '',
    shipping_zone:       shipping?.zoneLabel     || '',
    grand_total_cents:   Math.round(grandTotal * 100),
    grand_total_display: shipping?.isQuote
      ? `$${subtotalDollar.toFixed(2)} + freight TBC`
      : `$${grandTotal.toFixed(2)}`,
  };
}


// ─── MAIN ROUTE HANDLER ───────────────────────────────────────────────────────

async function handleSubmitOrder(req, res) {
  try {
    const { formType, formData, cart } = req.body;

    if (!formType || !formData) {
      return res.status(400).json({ success: false, message: 'Missing formType or formData.' });
    }

    // ── Step 1: Extract shipping ──────────────────────────────────────────────
    const shipping = extractShippingLine(formData);
    console.log('[submit-order] Shipping extracted:', {
      category: shipping.categoryLabel, zone: shipping.zoneLabel,
      price: shipping.priceDisplay, isQuote: shipping.isQuote, title: shipping.title,
    });

    // ── Step 2: Create Shopify Draft Order ────────────────────────────────────
    let draftOrder = null;
    try {
      draftOrder = await createShopifyDraftOrder({
        formType,
        formData,
        cart: cart || { items: [], total_price: 0 },
        shipping,
      });
      console.log(`[submit-order] Shopify draft order created: ${draftOrder.name} (${draftOrder.id})`);
    } catch (shopifyErr) {
      // Log clearly — order creation failed but we still attempt PDF + email
      console.error('[submit-order] ❌ Shopify draft order FAILED:', shopifyErr.message);
      // draftOrder stays null; PDF + email will proceed without an order ref
    }

    // ── Step 3: Build PDF data ────────────────────────────────────────────────
    const safeCart       = cart || { items: [], total_price: 0 };
    const pdfShippingRow = buildPdfShippingRow(shipping);
    const pdfTotals      = buildPdfTotals(safeCart, shipping);

    // ── Step 4a: Generate PDF ─────────────────────────────────────────────────
    // FIX: this was a comment block before — now actually called
    let pdfBuffer = null;
    try {
      pdfBuffer = await generateInvoice({
        formType,
        formData,
        draftOrder,   // may be null if Shopify failed — pdf.js handles gracefully
      });
      console.log(`[submit-order] ✅ PDF generated (${pdfBuffer.length} bytes)`);
    } catch (pdfErr) {
      console.error('[submit-order] ❌ PDF generation FAILED:', pdfErr.message);
      // Continue — customer still gets an email, just without the PDF attachment
    }

    // ── Step 4b: Send confirmation email ─────────────────────────────────────
    // FIX: this was a comment block before — now actually called
    try {
      await sendInvoiceEmail({
        to:         formData.submitter_email,
        pdfBuffer,                             // null if PDF failed — email.js skips attachment
        draftOrder,
        formData,
        formType,
        totals:     pdfTotals,
        shipping,
      });
      console.log(`[submit-order] ✅ Email sent to ${formData.submitter_email}`);
    } catch (emailErr) {
      console.error('[submit-order] ❌ Email send FAILED:', emailErr.message);
      // Don't fail the whole request just because email failed
    }

    // ── Step 5: Respond ───────────────────────────────────────────────────────
    return res.json({
      success:          true,
      draft_order_id:   draftOrder?.id   || null,
      draft_order_name: draftOrder?.name || null,
      shipping_applied: {
        category: shipping.categoryLabel,
        zone:     shipping.zoneLabel,
        title:    shipping.title,
        price:    shipping.isQuote ? 'quote' : shipping.price,
        display:  shipping.priceDisplay,
      },
    });

  } catch (err) {
    console.error('[submit-order] Unhandled error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
}

// ─── ROUTER ───────────────────────────────────────────────────────────────────
router.post('/submit-order', handleSubmitOrder);
module.exports = router;