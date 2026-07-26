'use strict';
const express = require('express');
const router  = express.Router();
const { getAramexQuote } = require('../services/aramex');

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/shipping-quote
// Called from checkout-modal.js (fetchSendleQuote / resolveLiveQuote) with:
//   { category, suburb, postcode }
// Returns:
//   { success: true, price: "12.40", priceDisplay: "$12.40" }
//   { success: false }   ← frontend shows a "contact us" message on failure
//
// ⚠ KNOWN GAP: confirmed via test-aramex-quote.js that the Aramex quote
// endpoint expects a full To.Address (StreetAddress/Locality/StateOrProvince/
// PostalCode/Country) plus To.ContactName/PhoneNumber/Email — but
// checkout-modal.js only sends { category, suburb, postcode } at the
// pre-checkout quote stage, with no street address or contact details yet.
// Using placeholders below until confirmed whether Aramex will accept a
// blank/generic StreetAddress + contact block, or whether we need to run a
// separate minimal-address test against the live endpoint first.
// ─────────────────────────────────────────────────────────────────────────────

const STATE_BY_POSTCODE_PREFIX = [
  { prefix: /^0/, state: 'NT' },
  { prefix: /^(08|09)/, state: 'NT' },
  { prefix: /^2/, state: 'NSW' },
  { prefix: /^3/, state: 'VIC' },
  { prefix: /^4/, state: 'QLD' },
  { prefix: /^5/, state: 'SA' },
  { prefix: /^6/, state: 'WA' },
  { prefix: /^7/, state: 'TAS' },
];

function resolveState(postcode) {
  const match = STATE_BY_POSTCODE_PREFIX.find((r) => r.prefix.test(postcode));
  return match ? match.state : 'VIC';
}

const CATEGORY_DIMS = {
  small:  { WeightDead: 1.5, Length: 30, Width: 20, Height: 10 },
  medium: { WeightDead: 8,   Length: 50, Width: 40, Height: 30 },
  large:  { WeightDead: 20,  Length: 100, Width: 60, Height: 50 },
};

function buildConsignmentPayload({ category, suburb, postcode }) {
  return {
    To: {
      // Placeholder contact details — Aramex requires these fields but the
      // frontend doesn't have real customer details at quote-time.
      ContactName: 'Website Quote',
      PhoneNumber: '0000000000',
      Email: 'quotes@agedcareandmedical.com.au',
      Address: {
        // Placeholder — real street address isn't known until checkout.
        StreetAddress: suburb || 'N/A',
        Locality: suburb,
        StateOrProvince: resolveState(postcode),
        PostalCode: postcode,
        Country: 'AU',
      },
    },
    Items: [
      {
        Quantity: 1,
        PackageType: 'P', // confirmed via test-aramex-quote.js
        ...CATEGORY_DIMS[category],
      },
    ],
  };
}

async function handleShippingQuote(req, res) {
  try {
    const { category, suburb, postcode } = req.body || {};

    if (!category || !postcode) {
      return res.status(400).json({ success: false, message: 'Missing category or postcode.' });
    }

    if (category === 'bulky') {
      return res.json({ success: false, message: 'Bulky/freight items use manual quoting, not live rates.' });
    }

    if (!CATEGORY_DIMS[category]) {
      return res.status(400).json({ success: false, message: `Unknown category: ${category}` });
    }

    const consignment = buildConsignmentPayload({ category, suburb, postcode });

    let quoteData;
    try {
      quoteData = await getAramexQuote(consignment);
    } catch (err) {
      console.error('[shipping-quote] Aramex quote failed:', err.response?.data || err.message);
      return res.json({ success: false });
    }

    if (!quoteData || quoteData.price == null) {
      console.error('[shipping-quote] Aramex quote returned no price:', quoteData);
      return res.json({ success: false });
    }

    const rawCost    = parseFloat(quoteData.price);
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