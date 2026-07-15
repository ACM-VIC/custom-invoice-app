'use strict';
const express = require('express');
const router  = express.Router();
const { getEparcelQuote } = require('../services/auspost');

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/shipping-quote
// Called from checkout-modal.js (fetchSendleQuote / resolveLiveQuote) with:
//   { category, suburb, postcode }
// Returns:
//   { success: true, price: "12.40", priceDisplay: "$12.40" }
//   { success: false }   ← frontend shows a "contact us" message on failure
//
// Response contract is kept identical to the old Sendle-backed route so
// checkout-modal.js only needs its live-quote calls re-enabled, nothing
// about the request/response handling needs to change on the frontend.
// ─────────────────────────────────────────────────────────────────────────────
async function handleShippingQuote(req, res) {
  try {
    const { category, postcode } = req.body || {};

    if (!category || !postcode) {
      return res.status(400).json({ success: false, message: 'Missing category or postcode.' });
    }

    // Bulky/freight never gets a live quote — this shouldn't be called for
    // that category (checkout-modal.js routes bulky through the manual
    // quote flow instead), but guard anyway.
    if (category === 'bulky') {
      return res.json({ success: false, message: 'Bulky/freight items use manual quoting, not live rates.' });
    }

    const quote = await getEparcelQuote({ category, toPostcode: postcode });

    if (!quote.success) {
      console.error('[shipping-quote] AusPost quote failed:', quote.reason || 'unknown');
      return res.json({ success: false });
    }

    const rawCost    = parseFloat(quote.price);
    const finalPrice = rawCost * 1.12;

    return res.json({
      success:      true,
      price:        finalPrice.toFixed(2),
      priceDisplay: `$${finalPrice.toFixed(2)}`,
    });

  } catch (err) {
    console.error('[shipping-quote] Unhandled error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
}

router.post('/shipping-quote', handleShippingQuote);
module.exports = router;