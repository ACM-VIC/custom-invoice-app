/**
 * services/aramex.js
 *
 * Aramex Australia (myFastway) Business API integration.
 * Handles OAuth2 client-credentials token retrieval (with caching)
 * and live rate quotes via the /api/consignments/quote endpoint.
 *
 * Required environment variables:
 *   ARAMEX_CLIENT_ID
 *   ARAMEX_CLIENT_SECRET
 *
 * Docs: https://github.com/mindfulsoftware/myFastway.ApiClient/wiki
 */

const axios = require('axios');

const TOKEN_URL = 'https://identity.aramexconnect.com.au/connect/token';
const SCOPE = 'ac-api-au';

// Confirmed working via test-aramex-connection.js (200 response from
// /api/consignment-services). api.myfastway.com.au returned 401 for this
// account, so this is the correct base URL.
const API_BASE_URL = 'https://api.aramexconnect.com.au';

let cachedToken = null;
let tokenExpiry = 0; // epoch ms

/**
 * Retrieves a bearer token, using a cached one if still valid.
 * Tokens have a ~60 min lifetime; we refresh 60s early to be safe.
 */
async function getAramexToken() {
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  const clientId = process.env.ARAMEX_CLIENT_ID;
  const clientSecret = process.env.ARAMEX_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      'Missing ARAMEX_CLIENT_ID or ARAMEX_CLIENT_SECRET environment variables'
    );
  }

  const response = await axios.post(
    TOKEN_URL,
    new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: SCOPE,
    }).toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }
  );

  const { access_token, expires_in } = response.data;

  cachedToken = access_token;
  tokenExpiry = Date.now() + (expires_in - 60) * 1000;

  return cachedToken;
}

/**
 * Requests a live shipping quote from the Aramex/myFastway API.
 *
 * @param {Object} consignment - Consignment/quote payload matching the
 *   shape documented at:
 *   https://github.com/mindfulsoftware/myFastway.ApiClient/wiki/Endpoints%EA%9E%89-Consignments#quote
 *   e.g. { LocationDetailsKey, Items: [{ Quantity, PackageType, WeightDead, Length, Width, Height }] }
 * @returns {Promise<Object>} quote data: { price, tax, total, items }
 */
async function getAramexQuote(consignment) {
  const token = await getAramexToken();

  try {
    const response = await axios.post(
      `${API_BASE_URL}/api/consignments/quote`,
      consignment,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data.data; // API wraps responses in a `data` envelope
  } catch (err) {
    // 401 likely means an expired/invalid token — clear cache so the
    // next call re-authenticates, per Aramex's recommended retry practice.
    if (err.response && err.response.status === 401) {
      cachedToken = null;
      tokenExpiry = 0;
    }
    throw err;
  }
}

module.exports = { getAramexToken, getAramexQuote };