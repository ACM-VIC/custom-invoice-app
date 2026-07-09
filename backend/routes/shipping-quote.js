'use strict';
const express = require('express');
const router  = express.Router();
const { getSendleQuote } = require('../services/sendle');
const SHIPPING_WEIGHTS   = require('../config/shippingWeights');

// ─── MAIN ROUTE HANDLER ───────────────────────────────────────────────────────
// Called by checkout-modal.js's fetchSendleQuote() for every small/medium
// (Melbourne + interstate) and large-Melbourne postcode/suburb change.
// Never called for 'bulky' — that stays on the manual quote flow.
async function handleShippingQuote(req, res) {
  try {
    const { category, suburb, postcode } = req.body || {};

    if (!category || !suburb || !postcode) {
      return res.status(400).json({
        success: false,
        message: 'Missing category, suburb, or postcode.',
      });
    }

    const weightConfig = SHIPPING_WEIGHTS[category];
    if (!weightConfig) {
      // 'bulky' or any unrecognised category should never reach here — the
      // frontend only calls this endpoint for small/medium/large.
      console.error(`[shipping-quote] No weight config for category "${category}"`);
      return res.status(400).json({
        success: false,
        message: `Unsupported shipping category: ${category}`,
      });
    }

    const quote = await getSendleQuote({
      weightKg:         weightConfig.weightKg,
      dimensionsCm:      weightConfig.dimensionsCm,
      deliverySuburb:    suburb,
      deliveryPostcode:  postcode,
    });

    if (!quote.success) {
      console.error(
        `[shipping-quote] Sendle quote failed (${quote.reason || 'unknown'}) ` +
        `for ${category} → ${suburb} ${postcode}`
      );
      // Frontend treats any { success:false } as "show contact-us message,
      // block submission" — no static fallback rate is used.
      return res.json({ success: false });
    }

    console.log(
      `[shipping-quote] ✅ ${category} → ${suburb} ${postcode}: ` +
      `${quote.priceDisplay} (${quote.planName || 'plan n/a'})`
    );

    return res.json({
      success:      true,
      price:        quote.price,
      priceDisplay: quote.priceDisplay,
    });
  } catch (err) {
    console.error('[shipping-quote] Unhandled error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
}

// ─── ROUTER ───────────────────────────────────────────────────────────────────
router.post('/shipping-quote', handleShippingQuote);
module.exports = router;
