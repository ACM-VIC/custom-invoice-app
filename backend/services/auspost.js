/**
 * =========================================
 * AUSPOST SERVICE (LIVE EPARCEL QUOTES)
 * =========================================
 *
 * PURPOSE:
 * Calls AusPost's Shipping & Tracking "Get Item Prices" endpoint to return
 * your CONTRACTED eParcel rate for a parcel — replaces services/sendle.js.
 *
 * Note: this deliberately does NOT use AusPost's public Postage Assessment
 * Calculator (PAC) API. PAC only ever returns full retail pricing, not your
 * negotiated eParcel contract rates — so it would show customers a higher
 * price than what you're actually charged.
 *
 * AUTH:
 * - HTTP Basic Auth: username = AUSPOST_API_KEY, password = AUSPOST_API_PASSWORD
 * - Header: Account-Number: AUSPOST_ACCOUNT_NUMBER
 *
 * -----------------------------------------
 *  ⚠️ BEFORE GOING LIVE — VERIFY THIS AGAINST YOUR ACCOUNT
 * -----------------------------------------
 * AusPost's Shipping & Tracking API reference pages are gated behind a
 * logged-in developer account, so the exact endpoint path / request body
 * shape below is built from AusPost's documented v1 "Get Item Prices"
 * pattern, NOT verified against a live call. Before relying on this in
 * production:
 *
 *   1. Log into https://developers.auspost.com.au with your account,
 *      open the "Shipping and Tracking" API's Get Item Prices reference
 *      (or the Postman/API Explorer collection linked from there), and
 *      confirm the endpoint path and JSON field names below still match.
 *   2. Test with a real postcode pair using AUSPOST_API_TEST_MODE=true
 *      (points at the /test path) before flipping to production.
 *   3. If the shape differs, the only thing that needs updating is
 *      buildItemPricesPayload() and extractCheapestPrice() below (search
 *      "ADJUST HERE").
 *
 * FLOW:
 * category + postcode → weight/dimensions (config/shippingWeights.js)
 *   → AusPost Get Item Prices → cheapest available service → { success, price }
 *
 * CHANGE LOG:
 * - [fix] Added NaN guard: a response that parses to a non-numeric price no
 *   longer returns success:true with priceDisplay "$NaN" — it now fails
 *   cleanly so the frontend shows the "contact us" message instead.
 * - [fix] extractCheapestPrice() now tries a few plausible AusPost response
 *   shapes (flat `price`, `total_cost`, and nested `price.gross.amount` /
 *   `price.value`) instead of assuming only one field name.
 * - [temp] Raw response is logged whenever parsing fails, so the exact
 *   shape can be confirmed from Azure logs on the next real request.
 */

const { getParcelProfile } = require('../config/shippingWeights');

const AUSPOST_API_KEY       = process.env.AUSPOST_API_KEY;
const AUSPOST_API_PASSWORD  = process.env.AUSPOST_API_PASSWORD;
const AUSPOST_ACCOUNT_NUMBER = process.env.AUSPOST_ACCOUNT_NUMBER;

// Your dispatch / warehouse postcode — parcels are quoted FROM here.
// Mirrors WAREHOUSE_POSTCODE used previously in services/sendle.js.
const WAREHOUSE_POSTCODE = process.env.WAREHOUSE_POSTCODE || '3337';

// Set AUSPOST_API_TEST_MODE=true in env to hit AusPost's sandbox path
// instead of production while you're validating the integration.
const IS_TEST_MODE = String(process.env.AUSPOST_API_TEST_MODE).toLowerCase() === 'true';

const BASE_URL = IS_TEST_MODE
  ? 'https://digitalapi.auspost.com.au/test'
  : 'https://digitalapi.auspost.com.au';

// ── ADJUST HERE (1/2) if your account's endpoint path differs ───────────────
const ITEM_PRICES_PATH = '/shipping/v1/prices/items';

function getAuthHeader() {
  const token = Buffer
    .from(`${AUSPOST_API_KEY}:${AUSPOST_API_PASSWORD}`)
    .toString('base64');
  return `Basic ${token}`;
}

/**
 * Builds the request payload for the Get Item Prices call.
 * ── ADJUST HERE (2/2) if AusPost's reference docs show different field
 *    names for your account/contract version.
 */
function buildItemPricesPayload({ category, fromPostcode, toPostcode }) {
  const profile = getParcelProfile(category);

  return {
    from: { postcode: fromPostcode },
    to:   { postcode: toPostcode },
    items: [
      {
        item_reference: `acm-${category}-${Date.now()}`,
        length: profile.length_cm,
        width:  profile.width_cm,
        height: profile.height_cm,
        weight: profile.weight_kg,
      },
    ],
  };
}

/**
 * Pulls a numeric price out of a single AusPost "price" entry, trying a
 * few plausible field shapes since the exact one hasn't been confirmed
 * against a live response yet. Returns a finite number, or null if none
 * of the known shapes match.
 *
 * ── ADJUST HERE if you find the real shape in the logs and it's not
 *    covered below — add another candidate to the `candidates` array.
 */
function extractNumericPrice(priceEntry) {
  if (!priceEntry || typeof priceEntry !== 'object') return null;

  const candidates = [
    priceEntry.price,
    priceEntry.total_cost,
    priceEntry.total_price,
    priceEntry.cost,
    priceEntry.amount,
    priceEntry.price?.gross?.amount,
    priceEntry.price?.value,
    priceEntry.price?.amount,
  ];

  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue;
    const num = parseFloat(candidate);
    if (!isNaN(num)) return num;
  }

  return null;
}

/**
 * Finds the cheapest priceable entry across the response's items/prices,
 * using extractNumericPrice() so we're resilient to a couple of possible
 * field-name shapes. Returns { priceDollars, serviceName } or null.
 */
function extractCheapestPrice(prices) {
  let best = null;

  for (const p of prices) {
    const num = extractNumericPrice(p);
    if (num === null) continue;
    if (best === null || num < best.priceDollars) {
      best = {
        priceDollars: num,
        serviceName: p.product_name || p.product_id || 'AusPost eParcel',
      };
    }
  }

  return best;
}

/**
 * Calls AusPost and returns the cheapest available item price.
 * Never throws — always resolves an object with a `success` flag so
 * callers (routes/shipping-quote.js) don't need try/catch.
 */
async function getEparcelQuote({ category, toPostcode, fromPostcode }) {
  if (!AUSPOST_API_KEY || !AUSPOST_API_PASSWORD || !AUSPOST_ACCOUNT_NUMBER) {
    console.error('[auspost] Missing AUSPOST_API_KEY / AUSPOST_API_PASSWORD / AUSPOST_ACCOUNT_NUMBER env vars.');
    return { success: false, reason: 'not_configured' };
  }
  if (!toPostcode) {
    return { success: false, reason: 'missing_postcode' };
  }

  const origin  = fromPostcode || WAREHOUSE_POSTCODE;
  const payload = buildItemPricesPayload({ category, fromPostcode: origin, toPostcode });
  const url     = `${BASE_URL}${ITEM_PRICES_PATH}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type':   'application/json',
        'Authorization':  getAuthHeader(),
        'Account-Number': AUSPOST_ACCOUNT_NUMBER,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.error(`[auspost] Get Item Prices failed (${res.status}): ${errBody}`);
      return { success: false, reason: 'api_error', status: res.status };
    }

    const json = await res.json();

    // Response shape per AusPost's documented v1 pattern: an array of
    // items, each with a `prices` array of { product_id, price, ... }.
    // ADJUST HERE if your account's response nests this differently —
    // check the logged raw response below and update extractCheapestPrice().
    const itemResult = json?.items?.[0];
    const prices      = itemResult?.prices || [];

    if (!prices.length) {
      console.error('[auspost] No prices array found for', { category, toPostcode, origin });
      console.error('[auspost] RAW RESPONSE:', JSON.stringify(json));
      return { success: false, reason: 'no_prices' };
    }

    const cheapest = extractCheapestPrice(prices);

    // NaN / unparseable guard — previously this fell through and produced
    // priceDisplay: "$NaN" with success:true. Now it fails cleanly so the
    // frontend shows the "contact us" message instead.
    if (!cheapest) {
      console.error('[auspost] Could not extract a numeric price from any entry — field names likely differ from what extractNumericPrice() expects.');
      console.error('[auspost] RAW RESPONSE:', JSON.stringify(json));
      return { success: false, reason: 'bad_price_format' };
    }

    const priceDollars = cheapest.priceDollars;

    return {
      success:      true,
      price:        priceDollars.toFixed(2),
      priceDisplay: `$${priceDollars.toFixed(2)}`,
      serviceName:  cheapest.serviceName,
      raw:          IS_TEST_MODE ? json : undefined, // only echo raw response in test mode
    };
  } catch (e) {
    console.error('[auspost] Get Item Prices request failed:', e.message);
    return { success: false, reason: 'network_error' };
  }
}

module.exports = { getEparcelQuote };