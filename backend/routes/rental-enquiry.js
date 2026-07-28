'use strict';
const express = require('express');
const router  = express.Router();
const { sendRentalEnquiryNotification } = require('../services/email');

// ─── ENV VARIABLES ────────────────────────────────────────────────────────────
const SHOPIFY_SHOP_DOMAIN  = process.env.SHOPIFY_SHOP_DOMAIN;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const SHOPIFY_VERSION      = process.env.SHOPIFY_API_VERSION || '2024-01';

console.warn(
  '[rental-enquiry] ⚠️  Draft order creation is TEMPORARILY DISABLED — rental ' +
  'enquiries now send an internal notification email only. See the commented-out ' +
  'Step 1 in handleRentalEnquiry to restore normal behaviour.'
);

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function buildNoteAttributes(formData) {
  const labels = {
    orderer_role:             'Person Placing Order',
    orderer_name:             'Name of Person Placing Order',
    company_name:             'Company Name',
    address_line1:            'Address Line 1',
    address_line2:            'Address Line 2',
    city:                     'City',
    postcode:                 'Post Code',
    suburb_area:               'Suburb / Area',
    shipping_phone:            'Shipping Phone Number',
    delivery_timeframe:        'Delivery Time Frame',
    has_ndis:                  'Has NDIS',
    participant_first_name:    'Participant First Name',
    participant_last_name:     'Participant Last Name',
    participant_dob:           'Participant DOB',
    participant_ndis_number:   'Participant NDIS Number',
    participant_email:         'Participant Email',
    notes:                     'Order Notes',
  };

  return Object.entries(formData)
    .filter(([key, value]) => labels[key] && value && String(value).trim() !== '')
    .map(([key, value]) => ({ name: labels[key], value: String(value) }));
}

async function createRentalDraftOrder({ product, formData }) {
  if (!SHOPIFY_SHOP_DOMAIN || !SHOPIFY_ACCESS_TOKEN) {
    throw new Error('Shopify env vars not configured — set SHOPIFY_SHOP_DOMAIN and SHOPIFY_ACCESS_TOKEN.');
  }

  const nameParts = (formData.orderer_name || '').trim().split(' ');

  const payload = {
    draft_order: {
      line_items: [{
        variant_id: product.variantId,
        quantity: 1,
        title: product.title,
      }],
      email: formData.email || '',
      phone: formData.phone || '',
      shipping_address: {
        first_name: nameParts[0] || '',
        last_name:  nameParts.slice(1).join(' ') || '',
        company:    formData.company_name || '',
        address1:   formData.address_line1 || '',
        address2:   formData.address_line2 || '',
        city:       formData.city || '',
        province:   formData.suburb_area || '',
        zip:        formData.postcode || '',
        country:    'AU',
        phone:      formData.shipping_phone || formData.phone || '',
      },
      note: formData.notes || '',
      note_attributes: buildNoteAttributes(formData),
      tags: [
        'Rental Enquiry',
        formData.delivery_timeframe || '',
        formData.has_ndis === 'Yes' ? 'NDIS' : '',
      ].filter(Boolean).join(', '),
    },
  };

  const url = `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/${SHOPIFY_VERSION}/draft_orders.json`;
  console.log(`[rental-enquiry] Creating Shopify draft order → ${url}`);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Shopify API error (${res.status}): ${errBody}`);
  }

  const json = await res.json();
  return json.draft_order;
}

// ─── MAIN ROUTE HANDLER ───────────────────────────────────────────────────────
// NOTE: This route intentionally sends ONE email only — the internal team
// notification (sendRentalEnquiryNotification), which goes to
// RENTAL_TEAM_EMAIL if set, otherwise falls back to
// contact@agedcareandmedical.com.au (see services/email.js). No email is
// sent to the customer for rental enquiries; the on-screen success message
// in rental-enquiry-modal.liquid is the only confirmation they receive.
async function handleRentalEnquiry(req, res) {
  try {
    const { product, formData } = req.body;
    if (!product || !formData) {
      return res.status(400).json({ success: false, message: 'Missing product or formData.' });
    }
    if (!formData.email) {
      return res.status(400).json({ success: false, message: 'Missing formData.email.' });
    }

    // ── Step 1: Create Shopify Draft Order — TEMPORARILY DISABLED ──────────────
    // let draftOrder = null;
    // try {
    //   if (!product.variantId) {
    //     throw new Error('Missing product.variantId.');
    //   }
    //   draftOrder = await createRentalDraftOrder({ product, formData });
    //   console.log(`[rental-enquiry] ✅ Draft order created: ${draftOrder.name} (${draftOrder.id})`);
    // } catch (shopifyErr) {
    //   console.error('[rental-enquiry] ❌ Draft order FAILED:', shopifyErr.message);
    // }

    // ── Step 2: Notify the internal team ────────────────────────────────────────
    try {
      await sendRentalEnquiryNotification({ formData, product });
      console.log('[rental-enquiry] ✅ Team notification sent');
    } catch (emailErr) {
      console.error('[rental-enquiry] ❌ Team notification FAILED:', emailErr.message);
      return res.status(500).json({ success: false, message: 'Failed to send enquiry notification.' });
    }

    // Step 3: Respond
    return res.json({ success: true });
  } catch (err) {
    console.error('[rental-enquiry] Unhandled error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
}

// ─── ROUTER ───────────────────────────────────────────────────────────────────
router.post('/rental-enquiry', handleRentalEnquiry);
module.exports = router;