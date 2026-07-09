/**
 * Sendle Service
 * Requests a live shipping quote from Sendle's authenticated /api/quote
 * endpoint. Never throws — always resolves to { success, ... } so callers
 * (routes/shipping-quote.js) don't need try/catch around every call.
 *
 * Sendle API reference: https://developers.sendle.com/reference/getquote
 *
 * AUTH:
 *   Basic Auth using SENDLE_API_ID (username) and SENDLE_API_KEY (password).
 *   Set both in Azure Portal → App Service → Configuration.
 *
 * PICKUP ADDRESS:
 *   Must match SHIPPING_CONFIG.warehousePostcode / warehouseState in
 *   checkout-modal.js. Set WAREHOUSE_SUBURB to the exact suburb name Sendle
 *   recognises for that postcode (suburb + postcode must match on Sendle's
 *   side or the quote request will fail).
 *
 * DNS WORKAROUND (added 2026-07-09):
 *   Azure App Service Linux's container DNS forwarder (127.0.0.11) has been
 *   observed failing to fully resolve api.sendle.com — it resolves the first
 *   CNAME hop (api.sendle.com → api.sendle.com.herokudns.com) but never
 *   returns a final A record, causing Node's fetch() to throw ENOTFOUND.
 *   This was confirmed independently of Sendle's API via `nslookup` and
 *   `curl` directly in the App Service SSH console.
 *
 *   Fix: route DNS lookups for outbound Sendle requests through a direct
 *   resolver (Cloudflare/Google) instead of the container's default
 *   resolver, via a custom undici Agent `lookup` function. The system
 *   resolver is kept as a fallback in case the public resolvers are ever
 *   blocked by network policy.
 *
 *   Requires the `undici` package: npm install undici
 */

'use strict';

const dns = require('dns');
const { Agent } = require('undici');

const SENDLE_API_ID  = process.env.SENDLE_API_ID;
const SENDLE_API_KEY = process.env.SENDLE_API_KEY;

// Sandbox vs live — set SENDLE_ENV=sandbox while testing.
const SENDLE_BASE_URL = process.env.SENDLE_ENV === 'sandbox'
  ? 'https://sandbox.sendle.com/api'
  : 'https://api.sendle.com/api';

// ── Pickup (warehouse) location ───────────────────────────────────────────
// Must match SHIPPING_CONFIG.warehousePostcode / warehouseState in
// checkout-modal.js. Suburb name must be the one Sendle recognises for this
// postcode — mismatches cause a 422 from Sendle.
const WAREHOUSE_SUBURB   = process.env.WAREHOUSE_SUBURB   || 'Diggers Rest';
const WAREHOUSE_POSTCODE = process.env.WAREHOUSE_POSTCODE || '3337';

// ─── STARTUP GUARD ────────────────────────────────────────────────────────
if (!SENDLE_API_ID || !SENDLE_API_KEY) {
  console.error(
    '[sendle] ⚠️  SENDLE_API_ID or SENDLE_API_KEY is not set. ' +
    'Set them in Azure Portal → App Service → Configuration → Application Settings.'
  );
}

function authHeader() {
  const token = Buffer.from(`${SENDLE_API_ID}:${SENDLE_API_KEY}`).toString('base64');
  return `Basic ${token}`;
}

// ─── CUSTOM DNS RESOLVER (Azure container DNS workaround) ─────────────────
// Use a direct resolver instead of the container's default (127.0.0.11),
// which has been observed failing to resolve api.sendle.com's CNAME chain.
const directResolver = new dns.Resolver();
directResolver.setServers([
  '1.1.1.1',  // Cloudflare
  '8.8.8.8',  // Google
]);

/**
 * Custom `lookup` function for undici's Agent. Tries the direct resolver
 * first; falls back to the system resolver (dns.lookup) if that fails, so
 * this degrades gracefully if 1.1.1.1/8.8.8.8 are ever blocked by network
 * policy (e.g. future VNet/NSG changes).
 */
function resolveViaDirectDns(hostname, options, callback) {
  directResolver.resolve4(hostname, (err, addresses) => {
    if (!err && addresses && addresses.length > 0) {
      const family = 4;
      if (options && options.all) {
        return callback(null, addresses.map((address) => ({ address, family })));
      }
      return callback(null, addresses[0], family);
    }

    console.error(
      `[sendle] Direct DNS resolution failed for ${hostname}, falling back to system resolver:`,
      err ? err.message : 'no addresses returned'
    );
    // Fall back to whatever the system resolver can do.
    dns.lookup(hostname, options, callback);
  });
}

const sendleDnsAgent = new Agent({
  connect: {
    lookup: resolveViaDirectDns,
  },
});

/**
 * Requests a live quote from Sendle for a single parcel.
 *
 * @param {Object} params
 * @param {number} params.weightKg        - parcel weight in kg
 * @param {Object} [params.dimensionsCm]  - {length, width, height} in cm, used to compute cubic volume
 * @param {string} params.deliverySuburb
 * @param {string} params.deliveryPostcode
 * @returns {Promise<{success:boolean, price?:string, priceDisplay?:string, planName?:string, reason?:string}>}
 */
async function getSendleQuote({ weightKg, dimensionsCm, deliverySuburb, deliveryPostcode }) {
  if (!SENDLE_API_ID || !SENDLE_API_KEY) {
    return { success: false, reason: 'not_configured' };
  }
  if (!deliverySuburb || !deliveryPostcode || !weightKg) {
    return { success: false, reason: 'missing_params' };
  }

  const params = new URLSearchParams({
    pickup_suburb:     WAREHOUSE_SUBURB,
    pickup_postcode:   WAREHOUSE_POSTCODE,
    pickup_country:    'AU',
    delivery_suburb:   deliverySuburb,
    delivery_postcode: String(deliveryPostcode),
    delivery_country:  'AU',
    weight_value:      String(weightKg),
    weight_units:      'kg',
  });

  if (dimensionsCm && dimensionsCm.length && dimensionsCm.width && dimensionsCm.height) {
    // Sendle wants volume in cubic metres.
    const volumeM3 =
      (dimensionsCm.length / 100) *
      (dimensionsCm.width  / 100) *
      (dimensionsCm.height / 100);
    params.set('volume_value', volumeM3.toFixed(4));
    params.set('volume_units', 'm3');
  }

  const url = `${SENDLE_BASE_URL}/quote?${params.toString()}`;

  let res;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': authHeader(),
        'Accept':        'application/json',
        // Sendle asks integrations to identify themselves via User-Agent.
        'User-Agent':    'Aged Care & Medical (https://agedcareandmedical.com.au)',
      },
      // Route this request's connection through our custom DNS resolver
      // instead of the container's default, broken one.
      dispatcher: sendleDnsAgent,
    });
  } catch (networkErr) {
    // Node's fetch (undici) hides the real reason behind `.cause` — the
    // top-level message is always the unhelpful generic "fetch failed".
    console.error(
      '[sendle] Network error calling Sendle:',
      networkErr.message,
      '| cause:', networkErr.cause ? String(networkErr.cause) : '(no cause)',
      '| code:', networkErr.cause?.code || '(none)'
    );
    return { success: false, reason: 'network_error' };
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    console.error(`[sendle] Sendle API error (${res.status}) for ${deliverySuburb} ${deliveryPostcode}: ${errBody}`);
    return { success: false, reason: 'api_error', status: res.status };
  }

  let quotes;
  try {
    quotes = await res.json();
  } catch (parseErr) {
    console.error('[sendle] Failed to parse Sendle response:', parseErr.message);
    return { success: false, reason: 'parse_error' };
  }

  if (!Array.isArray(quotes) || quotes.length === 0) {
    console.error(`[sendle] Sendle returned no quote options for ${deliverySuburb} ${deliveryPostcode}.`);
    return { success: false, reason: 'no_quotes' };
  }

  // Sendle can return multiple plan/product options (e.g. "Premium", "Easy").
  // Pick the cheapest GROSS price — gross includes GST, which is what the
  // customer actually pays at checkout.
  let cheapest = null;
  for (const q of quotes) {
    const gross = q?.quote?.gross?.amount;
    if (typeof gross === 'number' && (cheapest === null || gross < cheapest.amount)) {
      cheapest = { amount: gross, planName: q.plan_name || '' };
    }
  }

  if (!cheapest) {
    console.error('[sendle] Could not extract a price from Sendle quote response:', JSON.stringify(quotes));
    return { success: false, reason: 'no_price_in_response' };
  }

  return {
    success:      true,
    price:        cheapest.amount.toFixed(2),
    priceDisplay: `$${cheapest.amount.toFixed(2)}`,
    planName:     cheapest.planName,
  };
}

module.exports = { getSendleQuote };