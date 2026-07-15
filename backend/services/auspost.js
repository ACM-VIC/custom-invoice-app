/**
 * =========================================
 * AUSPOST + ARAMEX SERVICE (LIVE SHIPPING QUOTES)
 * =========================================
 *
 * PURPOSE:
 * Calls AusPost's Shipping & Tracking "Get Item Prices" endpoint to return
 * your CONTRACTED eParcel rate for a parcel — replaces services/sendle.js.
 *
 * [2026-07-15] Extended with Aramex (aramexConnect / myFastway) as a
 * GAP-FILLER, not a parallel carrier. AusPost remains the sole quote source
 * for everything it already handles (small/medium — both zones, large —
 * Melbourne). Aramex is only called for the two cases that previously had
 * no live quote at all:
 *   - large + interstate   (previously a hard block)
 *   - bulky (any zone)     (previously routed to manual quote / staff)
 * See getShippingQuote() at the bottom — that's the new single entry point
 * routes/shipping-quote.js should call instead of getEparcelQuote() directly.
 * getEparcelQuote() and getAramexQuote() remain exported individually too,
 * in case you want to call a specific carrier directly.
 *
 * Note: this deliberately does NOT use AusPost's public Postage Assessment
 * Calculator (PAC) API. PAC only ever returns full retail pricing, not your
 * negotiated eParcel contract rates — so it would show customers a higher
 * price than what you're actually charged.
 *
 * AUTH:
 * - AusPost: HTTP Basic Auth: username = AUSPOST_API_KEY, password = AUSPOST_API_PASSWORD
 *   Header: Account-Number: AUSPOST_ACCOUNT_NUMBER
 * - Aramex: OAuth2 client_credentials against aramexConnect's identity server,
 *   using ARAMEX_CLIENT_ID / ARAMEX_CLIENT_SECRET (see Aramex section below).
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
 * ⚠️ ARAMEX SECTION SPECIFICALLY — ALSO UNVERIFIED AGAINST A LIVE CALL:
 *   - The quote endpoint (POST /api/consignments/quote) requires a full
 *     consignment-shaped payload (address + item weight/dims), per the
 *     myFastway API wiki. It does NOT need a "from" address — Aramex quotes
 *     from your account's configured despatch location.
 *   - The API base address is assumed to be https://api.aramexconnect.com.au
 *     (following the identity.aramexconnect.com.au pattern) but the wiki's
 *     example client config was written against the older
 *     api.myfastway.com.au domain — CONFIRM the current base address in
 *     your aramexConnect API Keys / developer docs before going live.
 *   - It's unconfirmed whether the quote endpoint can accept a bulky/freight
 *     item over standard parcel weight & dimension limits — test with your
 *     actual bulky item dimensions (see config/shippingWeights.js) before
 *     relying on this for the bulky category. If Aramex rejects it, bulky
 *     should keep falling through to the existing manual-quote flow.
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
const WAREHOUSE_POSTCODE = process.env.WAREHOUSE_POSTCODE || '3196';

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
    priceEntry.calculated_price, // confirmed real AusPost field (2026-07-15 log)
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
        // Real AusPost responses (confirmed 2026-07-15) carry product_type
        // (e.g. "PARCEL POST + SIGNATURE") and product_id, not product_name.
        serviceName: p.product_type || p.product_id || 'AusPost eParcel',
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

// ═════════════════════════════════════════════════════════════════════════
// ██  ARAMEX (aramexConnect / myFastway) — GAP-FILLER QUOTES  ██
// ═════════════════════════════════════════════════════════════════════════
//
// Handles the two cases AusPost's block above doesn't cover today:
//   - category 'large'  + interstate delivery
//   - category 'bulky'  (any zone)
// Everything else keeps going through getEparcelQuote() untouched.

const ARAMEX_CLIENT_ID     = process.env.ARAMEX_CLIENT_ID;
const ARAMEX_CLIENT_SECRET = process.env.ARAMEX_CLIENT_SECRET;

// AU-only for now (PickUp Country = Aramex Australia, per your account setup).
const ARAMEX_TOKEN_URL = 'https://identity.aramexconnect.com.au/connect/token';
const ARAMEX_SCOPE     = 'ac-api-au';

// ── ADJUST HERE if aramexConnect's API Keys page / docs show a different
//    current base address (see the warning block at the top of this file).
const ARAMEX_API_BASE = 'https://api.aramexconnect.com.au';
const ARAMEX_QUOTE_PATH = '/api/consignments/quote';

// In-memory token cache. A token is valid ~60 minutes; refreshed 5 minutes
// early so a slow request never straddles expiry.
let aramexTokenCache = { token: null, expiresAt: 0 };

async function getAramexToken() {
  const now = Date.now();
  if (aramexTokenCache.token && aramexTokenCache.expiresAt > now) {
    return aramexTokenCache.token;
  }

  if (!ARAMEX_CLIENT_ID || !ARAMEX_CLIENT_SECRET) {
    console.error('[aramex] Missing ARAMEX_CLIENT_ID / ARAMEX_CLIENT_SECRET env vars.');
    return null;
  }

  const body = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     ARAMEX_CLIENT_ID,
    client_secret: ARAMEX_CLIENT_SECRET,
    scope:         ARAMEX_SCOPE,
  });

  try {
    const res = await fetch(ARAMEX_TOKEN_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    body.toString(),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.error(`[aramex] Token request failed (${res.status}): ${errBody}`);
      return null;
    }

    const json = await res.json();
    if (!json.access_token) {
      console.error('[aramex] Token response missing access_token:', JSON.stringify(json));
      return null;
    }

    // expires_in is in seconds (default 3600); refresh 5 min early.
    const ttlMs = ((json.expires_in || 3600) - 300) * 1000;
    aramexTokenCache = {
      token:     json.access_token,
      expiresAt: now + Math.max(ttlMs, 60 * 1000), // never cache for less than 1 min
    };

    return aramexTokenCache.token;
  } catch (e) {
    console.error('[aramex] Token request error:', e.message);
    return null;
  }
}

/**
 * Builds the minimum consignment-shaped payload the /consignments/quote
 * endpoint accepts. No "from" address — quotes from your account's
 * configured despatch location.
 *
 * toContactName / toPhoneNumber are placeholders — the quote endpoint's
 * documented "minimum" shape includes them as part of the To.Address block,
 * but for a pre-checkout price lookup you don't have a confirmed customer
 * contact yet. Placeholder values are used since they shouldn't affect
 * pricing; swap in real values from the form if Aramex's quote response
 * turns out to validate/require them strictly.
 */
function buildAramexQuotePayload({ category, toSuburb, toState, toPostcode }) {
  const profile = getParcelProfile(category);

  return {
    To: {
      ContactName: 'Website Quote',
      PhoneNumber: '0000000000',
      Address: {
        StreetAddress:   '',
        Locality:        toSuburb,
        StateOrProvince: toState,
        PostalCode:      toPostcode,
        Country:         'AU',
      },
    },
    Items: [
      {
        Quantity:    1,
        Reference:   `acm-${category}-${Date.now()}`,
        PackageType: 'P', // Parcel — see warning block re: bulky weight/dim limits
        WeightDead:  profile.weight_kg,
        Length:      profile.length_cm,
        Width:       profile.width_cm,
        Height:      profile.height_cm,
      },
    ],
  };
}

/**
 * Pulls the total price out of an Aramex quote response.
 * Per the myFastway wiki, the response shape is:
 *   { data: { price, tax, total, items: [...] } }
 */
function extractAramexPrice(json) {
  const data = json?.data;
  if (!data) return null;
  const total = parseFloat(data.total);
  if (isNaN(total)) return null;
  return total;
}

/**
 * Calls Aramex and returns a quote. Never throws — always resolves an
 * object with a `success` flag, matching getEparcelQuote()'s contract so
 * callers can treat both carriers identically.
 */
async function getAramexQuote({ category, toSuburb, toState, toPostcode }) {
  if (!toPostcode || !toState) {
    return { success: false, reason: 'missing_address' };
  }

  const token = await getAramexToken();
  if (!token) {
    return { success: false, reason: 'not_configured' };
  }

  const payload = buildAramexQuotePayload({ category, toSuburb, toState, toPostcode });
  const url     = `${ARAMEX_API_BASE}${ARAMEX_QUOTE_PATH}`;

  try {
    const res = await fetch(url, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.error(`[aramex] Quote request failed (${res.status}): ${errBody}`);
      return { success: false, reason: 'api_error', status: res.status };
    }

    const json  = await res.json();
    const total = extractAramexPrice(json);

    if (total === null) {
      console.error('[aramex] Could not extract a numeric total from quote response.');
      console.error('[aramex] RAW RESPONSE:', JSON.stringify(json));
      return { success: false, reason: 'bad_price_format' };
    }

    return {
      success:      true,
      price:        total.toFixed(2),
      priceDisplay: `$${total.toFixed(2)}`,
      serviceName:  'Aramex',
      raw:          IS_TEST_MODE ? json : undefined,
    };
  } catch (e) {
    console.error('[aramex] Quote request error:', e.message);
    return { success: false, reason: 'network_error' };
  }
}

// ═════════════════════════════════════════════════════════════════════════
// ██  COMBINED ROUTER — call this from routes/shipping-quote.js  ██
// ═════════════════════════════════════════════════════════════════════════
//
// Routing (Option C — Aramex as gap-filler, not a parallel carrier):
//   - category === 'bulky'                        → Aramex
//   - category === 'large' && isInterstate         → Aramex
//   - everything else (small/medium any zone,
//     large in Melbourne)                          → AusPost (unchanged)
//
// `isInterstate` and `toState` should come from the same zone-resolution
// logic checkout-modal.js already runs client-side (resolveDeliveryZone) —
// pass the result through in the request body from routes/shipping-quote.js.
async function getShippingQuote({ category, toPostcode, toSuburb, toState, fromPostcode, isInterstate }) {
  const useAramex =
    category === 'bulky' ||
    (category === 'large' && !!isInterstate);

  if (useAramex) {
    const result = await getAramexQuote({ category, toSuburb, toState, toPostcode });
    // No fallback to AusPost here on purpose — AusPost doesn't handle these
    // categories today either (large-interstate is blocked, bulky has no
    // parcel weight/dims to quote against). A failed Aramex call should
    // surface the existing "contact us" state, same as a failed AusPost call.
    return result;
  }

  return getEparcelQuote({ category, toPostcode, fromPostcode });
}

module.exports = { getEparcelQuote, getAramexQuote, getShippingQuote };