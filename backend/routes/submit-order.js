/**
 * submit-order.js  —  Backend handler for NDIS / Aged Care order submissions
 *
 * What this module does:
 *  1. Receives the form payload (formData, cart, shipping_line) from the frontend
 *  2. Creates a Shopify Draft Order with:
 *       - line_items  from cart
 *       - shipping_address from form
 *       - shipping_line  (title + price) calculated by the frontend
 *  3. Passes the same shipping data to the PDF generator so it appears
 *     on the invoice as a dedicated line item
 *
 * ─── ENVIRONMENT VARIABLES REQUIRED ─────────────────────────────────────────
 *  SHOPIFY_STORE_DOMAIN   e.g. your-store.myshopify.com
 *  SHOPIFY_ADMIN_TOKEN    Admin API access token (write_draft_orders scope)
 *  SHOPIFY_API_VERSION    e.g. 2024-01
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const SHOPIFY_DOMAIN  = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_TOKEN   = process.env.SHOPIFY_ADMIN_TOKEN;
const SHOPIFY_VERSION = process.env.SHOPIFY_API_VERSION || '2024-01';

// ─── SHOPIFY DRAFT ORDER ──────────────────────────────────────────────────────

/**
 * Build the shipping_line object for the Shopify Draft Order API.
 * If shipping is free, we still send a line with price 0 so it appears
 * on the draft order and PDF rather than being invisible.
 *
 * @param {object} shippingLine  { title, price, total_kg }
 * @returns {object}  Shopify shipping_line payload, or null if not calculable
 */
function buildShopifyShippingLine(shippingLine) {
  if (!shippingLine || shippingLine.price === null || shippingLine.price === undefined) {
    return null;
  }

  return {
    title:            shippingLine.title || 'Delivery',
    price:            shippingLine.price.toFixed(2),
    // custom: true tells Shopify this is a manually-set shipping rate
    custom:           true,
  };
}

/**
 * Map Shopify cart items to Shopify Draft Order line_items.
 * cart.items entries already contain variant_id, quantity, price (cents).
 *
 * @param {Array} cartItems
 * @returns {Array}
 */
function buildLineItems(cartItems) {
  if (!cartItems || !cartItems.length) return [];

  return cartItems.map(item => ({
    variant_id: item.variant_id,
    quantity:   item.quantity,
    // price in dollars (Shopify cart uses cents)
    price:      (item.price / 100).toFixed(2),
    title:      item.product_title || item.title,
  }));
}

/**
 * Build the shipping address from the submitted form data.
 * Both NDIS and Aged Care forms share the same address field names.
 *
 * @param {object} formData
 * @param {string} formType  'ndis' | 'aged_care'
 * @returns {object}  Shopify address object
 */
function buildShippingAddress(formData) {
  return {
    first_name: (formData.participant_full_name || '').split(' ')[0] || '',
    last_name:  (formData.participant_full_name || '').split(' ').slice(1).join(' ') || '',
    address1:   formData.address_line1 || '',
    city:       formData.suburb || '',
    province:   formData.state  || '',
    zip:        formData.postcode || '',
    country:    'AU',
    phone:      formData.delivery_phone || formData.submitter_phone || '',
  };
}

/**
 * Build note_attributes array for the draft order.
 * These appear in the Shopify order as named attributes and are
 * also available for order printer / invoice templates.
 *
 * @param {string} formType
 * @param {object} formData
 * @param {object} shippingLine
 * @returns {Array}  [{ name, value }]
 */
function buildNoteAttributes(formType, formData, shippingLine) {
  const attrs = [
    { name: 'Form Type',           value: formType === 'ndis' ? 'NDIS' : 'Aged Care / Government' },
    { name: 'Submitter Name',      value: formData.submitter_full_name || '' },
    { name: 'Submitter Email',     value: formData.submitter_email || '' },
    { name: 'Submitter Phone',     value: formData.submitter_phone || '' },
    { name: 'Participant Name',    value: formData.participant_full_name || '' },
    { name: 'Delivery Suburb',     value: formData.suburb || '' },
    { name: 'Delivery State',      value: formData.state || '' },
    { name: 'Delivery Postcode',   value: formData.postcode || '' },
    { name: 'Shipping Method',     value: shippingLine?.title || 'To be arranged' },
    { name: 'Shipping Fee',        value: shippingLine?.price !== null && shippingLine?.price !== undefined
                                          ? (shippingLine.price === 0 ? 'FREE' : `$${Number(shippingLine.price).toFixed(2)}`)
                                          : 'Contact required' },
    { name: 'Total Weight (kg)',   value: shippingLine?.total_kg ? `${Number(shippingLine.total_kg).toFixed(2)} kg` : 'N/A' },
  ];

  // NDIS-specific
  if (formType === 'ndis') {
    attrs.push(
      { name: 'Funding Type',      value: formData.ndis_funding_type || '' },
      { name: 'NDIS Number',       value: formData.ndis_number || '' },
      { name: 'Submitter Role',    value: formData.ndis_submitter_role || '' },
    );
    if (formData.ndis_funding_type === 'plan_managed') {
      attrs.push(
        { name: 'Plan Manager',    value: formData.plan_manager_company || '' },
        { name: 'Plan Mgr Email',  value: formData.plan_manager_email || '' },
      );
    }
  }

  // Aged Care-specific
  if (formType === 'aged_care') {
    attrs.push(
      { name: 'Funding Program',   value: formData.ac_funding_type || '' },
      { name: 'Submitter Role',    value: formData.ac_submitter_role || '' },
      { name: 'Client Reference',  value: formData.client_reference || '' },
    );
  }

  if (formData.notes) {
    attrs.push({ name: 'Notes', value: formData.notes });
  }

  return attrs.filter(a => a.value !== '');
}

/**
 * Create a Shopify Draft Order via the Admin API.
 *
 * @param {object} params
 * @param {string} params.formType
 * @param {object} params.formData
 * @param {object} params.cart
 * @param {object} params.shippingLine   { title, price, total_kg }
 * @returns {Promise<object>}  The created draft_order object from Shopify
 */
async function createShopifyDraftOrder({ formType, formData, cart, shippingLine }) {
  const lineItems       = buildLineItems(cart.items);
  const shippingAddress = buildShippingAddress(formData);
  const noteAttributes  = buildNoteAttributes(formType, formData, shippingLine);
  const shopifyShipping = buildShopifyShippingLine(shippingLine);

  const draftOrderPayload = {
    draft_order: {
      line_items:        lineItems,
      shipping_address:  shippingAddress,
      billing_address:   shippingAddress,
      note_attributes:   noteAttributes,
      note:              formData.notes || '',
      email:             formData.submitter_email || '',
      phone:             formData.submitter_phone || '',
      tags:              [
        formType === 'ndis' ? 'NDIS' : 'Aged Care',
        formData.ndis_funding_type || formData.ac_funding_type || '',
        'Modal Order',
      ].filter(Boolean).join(', '),
      // Apply the calculated shipping line if available
      ...(shopifyShipping && { shipping_line: shopifyShipping }),
    },
  };

  const url = `https://${SHOPIFY_DOMAIN}/admin/api/${SHOPIFY_VERSION}/draft_orders.json`;

  const res = await fetch(url, {
    method:  'POST',
    headers: {
      'Content-Type':              'application/json',
      'X-Shopify-Access-Token':    SHOPIFY_TOKEN,
    },
    body: JSON.stringify(draftOrderPayload),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Shopify draft order creation failed (${res.status}): ${errBody}`);
  }

  const json = await res.json();
  return json.draft_order;
}


// ─── PDF INVOICE — SHIPPING LINE HELPERS ─────────────────────────────────────
//
// Call these functions from your existing PDF generation module.
// They return the data structure your PDF renderer expects for a line item row.
//

/**
 * Build a shipping row object for the PDF invoice line items table.
 * Drop this into the same array as your product line items before rendering.
 *
 * @param {object} shippingLine  { title, price, total_kg }
 * @returns {object}  PDF line item row
 */
function buildPdfShippingRow(shippingLine) {
  if (!shippingLine || shippingLine.price === null || shippingLine.price === undefined) {
    return {
      sku:         '',
      description: 'Delivery — to be arranged',
      qty:         1,
      unit_price:  null,
      total:       null,
      is_shipping: true,
      note:        'Please contact us for a delivery quote.',
    };
  }

  const priceDisplay = shippingLine.price === 0
    ? 'FREE'
    : `$${Number(shippingLine.price).toFixed(2)}`;

  const weightNote = shippingLine.total_kg
    ? ` (${Number(shippingLine.total_kg).toFixed(2)} kg)`
    : '';

  return {
    sku:         '',
    description: `${shippingLine.title || 'Delivery'}${weightNote}`,
    qty:         1,
    unit_price:  shippingLine.price === 0 ? 0 : Number(shippingLine.price),
    total:       shippingLine.price === 0 ? 0 : Number(shippingLine.price),
    display:     priceDisplay,
    is_shipping: true,   // Use this flag in your PDF template to style differently if needed
    note:        null,
  };
}

/**
 * Build the invoice totals block for the PDF.
 * Returns subtotal, shipping, and grand total.
 *
 * @param {object} cart         Shopify cart object (total_price in cents)
 * @param {object} shippingLine { title, price, total_kg }
 * @returns {object}  { subtotal_cents, subtotal_display, shipping_display, grand_total_cents, grand_total_display }
 */
function buildPdfTotals(cart, shippingLine) {
  const subtotalCents  = cart.total_price || 0;                 // cents
  const subtotalDollar = subtotalCents / 100;

  const shippingDollar = (shippingLine && shippingLine.price !== null && shippingLine.price !== undefined)
    ? Number(shippingLine.price)
    : 0;

  const grandTotal = subtotalDollar + shippingDollar;

  return {
    subtotal_cents:       subtotalCents,
    subtotal_display:     `$${subtotalDollar.toFixed(2)}`,
    shipping_price:       shippingDollar,
    shipping_display:     shippingDollar === 0
                            ? (shippingLine?.price === 0 ? 'FREE' : 'TBC')
                            : `$${shippingDollar.toFixed(2)}`,
    shipping_title:       shippingLine?.title || 'Delivery',
    grand_total_cents:    Math.round(grandTotal * 100),
    grand_total_display:  `$${grandTotal.toFixed(2)}`,
  };
}


// ─── MAIN ROUTE HANDLER ───────────────────────────────────────────────────────
//
// Plug this into your Express / Azure Function / whatever framework you use.
// Example for Express:
//
//   const { handleSubmitOrder } = require('./submit-order');
//   app.post('/api/submit-order', express.json(), handleSubmitOrder);
//

/**
 * Main order submission handler.
 *
 * Expected request body:
 * {
 *   formType:      'ndis' | 'aged_care',
 *   formData:      { ...form fields including shipping_price, shipping_title, shipping_total_kg },
 *   cart:          { items: [...], total_price: Number (cents), ... },
 *   shipping_line: { title: String, price: Number|null, total_kg: Number|null }
 * }
 */
async function handleSubmitOrder(req, res) {
  try {
    const { formType, formData, cart, shipping_line } = req.body;

    if (!formType || !formData) {
      return res.status(400).json({ success: false, message: 'Missing formType or formData.' });
    }

    // ── 1. Create Shopify Draft Order ─────────────────────────────────────────
    let draftOrder = null;
    try {
      draftOrder = await createShopifyDraftOrder({
        formType,
        formData,
        cart:         cart || { items: [], total_price: 0 },
        shippingLine: shipping_line,
      });
    } catch (shopifyErr) {
      console.error('[submit-order] Shopify draft order error:', shopifyErr);
      // Don't block the whole submission if Shopify fails —
      // fall through to PDF generation and flag in response.
    }

    // ── 2. Build PDF data ─────────────────────────────────────────────────────
    // Pass these objects to your existing PDF generation function.
    const pdfShippingRow = buildPdfShippingRow(shipping_line);
    const pdfTotals      = buildPdfTotals(cart || { total_price: 0 }, shipping_line);

    // ── 3. Generate PDF ───────────────────────────────────────────────────────
    // Replace this block with your actual PDF generation call, e.g.:
    //
    //   const pdfBuffer = await generateInvoicePdf({
    //     formType,
    //     formData,
    //     cart,
    //     shippingRow: pdfShippingRow,
    //     totals:      pdfTotals,
    //     draftOrder,
    //   });
    //   await sendInvoiceEmail(formData.submitter_email, pdfBuffer, draftOrder);
    //
    // The key additions are `shippingRow` and `totals` — pipe them into
    // wherever your PDF template renders the line items table and totals block.

    console.log('[submit-order] PDF shipping row:', pdfShippingRow);
    console.log('[submit-order] PDF totals:', pdfTotals);

    return res.json({
      success:          true,
      draft_order_id:   draftOrder?.id || null,
      draft_order_name: draftOrder?.name || null,
      shipping_applied: {
        title:   shipping_line?.title || null,
        price:   shipping_line?.price ?? null,
        total_kg: shipping_line?.total_kg ?? null,
      },
    });

  } catch (err) {
    console.error('[submit-order] Unhandled error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
}

module.exports = {
  handleSubmitOrder,
  createShopifyDraftOrder,
  buildPdfShippingRow,
  buildPdfTotals,
  buildShopifyShippingLine,
  buildLineItems,
  buildShippingAddress,
  buildNoteAttributes,
};