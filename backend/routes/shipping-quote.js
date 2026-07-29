'use strict';

const express = require('express');
const router = express.Router();
const { getShippingQuote } = require('../services/shipping');

const CATEGORY_DIMS = {
  small: {
    WeightDead: 1.5,
    Length: 30,
    Width: 20,
    Height: 10,
  },
  medium: {
    WeightDead: 8,
    Length: 50,
    Width: 40,
    Height: 30,
  },
  large: {
    WeightDead: 20,
    Length: 100,
    Width: 60,
    Height: 50,
  },
};

async function handleShippingQuote(req, res) {
  try {
    const { category, suburb, postcode } = req.body || {};

    if (!category || !postcode) {
      return res.status(400).json({
        success: false,
        message: 'Missing category or postcode.',
      });
    }

    if (category === 'bulky') {
      return res.json({
        success: false,
        message: 'Bulky/freight items require a manual quote.',
      });
    }

    if (!CATEGORY_DIMS[category]) {
      return res.status(400).json({
        success: false,
        message: `Unknown category: ${category}`,
      });
    }

    const payload = {
      category,
      suburb,
      postcode,
      dimensions: CATEGORY_DIMS[category],
    };

    let quote;

    try {
      quote = await getShippingQuote(payload);
    } catch (err) {
      console.error('[shipping-quote] Quote request failed:', err);
      return res.json({ success: false });
    }

    if (!quote || quote.price == null) {
      console.error('[shipping-quote] No price returned:', quote);
      return res.json({ success: false });
    }

    const finalPrice = Number(quote.price) * 1.12;

    return res.json({
      success: true,
      price: finalPrice.toFixed(2),
      priceDisplay: `$${finalPrice.toFixed(2)}`,
    });

  } catch (err) {
    console.error('[shipping-quote] Unhandled error:', err);

    return res.status(500).json({
      success: false,
      message: 'Internal server error.',
    });
  }
}

router.post('/shipping-quote', handleShippingQuote);

module.exports = router;