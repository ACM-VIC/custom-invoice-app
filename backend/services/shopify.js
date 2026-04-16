/**
 * Shopify Service
 * Creates Draft Orders via the Shopify Admin REST API.
 * Draft orders do NOT affect inventory.
 *
 * FIX: Added startup validation for required environment variables.
 * Previously, missing SHOPIFY_SHOP_DOMAIN or SHOPIFY_ACCESS_TOKEN would
 * silently set BASE_URL to "https://undefined/..." causing a cryptic
 * fetch error instead of a clear config error.
 */

const API_VERSION = '2024-01';

function getConfig() {
  const domain      = process.env.SHOPIFY_SHOP_DOMAIN;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

  if (!domain) {
    throw new Error('Missing environment variable: SHOPIFY_SHOP_DOMAIN');
  }
  if (!accessToken) {
    throw new Error('Missing environment variable: SHOPIFY_ACCESS_TOKEN');
  }

  return {
    baseUrl: `https://${domain}/admin/api/${API_VERSION}`,
    accessToken,
  };
}

/**
 * Map Shopify cart line items to Draft Order line items format.
 */
function mapLineItems(cartItems) {
  return cartItems.map(item => ({
    variant_id: item.variant_id,
    quantity:   item.quantity,
  }));
}

/**
 * Build note string from form data (appears in Shopify draft order notes).
 */
function buildNote(formType, formData) {
  if (formType === 'aged_care') {
    return [
      `BILLING TYPE: Aged Care`,
      `Package Level: ${formData.package_level || '—'}`,
      `Provider/Coordinator: ${formData.provider_name || '—'}`,
      `Delivery: ${formData.address_line1}, ${formData.suburb} ${formData.state} ${formData.postcode}`,
      formData.notes ? `Notes: ${formData.notes}` : null,
    ].filter(Boolean).join('\n');
  }
  return [
    `BILLING TYPE: NDIS`,
    `NDIS Number: ${formData.ndis_number || '—'}`,
    `Plan Manager/Coordinator: ${formData.provider_name || '—'}`,
    `Provider Invoice Email: ${formData.provider_email || '—'}`,
    `Delivery: ${formData.address_line1}, ${formData.suburb} ${formData.state} ${formData.postcode}`,
    formData.notes ? `Notes: ${formData.notes}` : null,
  ].filter(Boolean).join('\n');
}

/**
 * Create a Shopify Draft Order.
 * @returns {Object} The created draft order object from Shopify
 */
async function createDraftOrder({ formType, formData, cart }) {
  // FIX: Validate config at call time so missing env vars throw a clear error
  // rather than a confusing "fetch failed: https://undefined/..." error.
  const { baseUrl, accessToken } = getConfig();

  const lineItems = mapLineItems(cart.items);
  const shippingAddress = {
    first_name: formData.first_name,
    last_name:  formData.last_name,
    address1:   formData.address_line1,
    city:       formData.suburb,
    province:   formData.state,
    zip:        formData.postcode,
    country:    'AU',
  };

  const draftOrderPayload = {
    draft_order: {
      line_items:       lineItems,
      customer: {
        first_name: formData.first_name,
        last_name:  formData.last_name,
        email:      formData.email,
      },
      shipping_address: shippingAddress,
      billing_address:  shippingAddress,
      note:             buildNote(formType, formData),
      note_attributes: [
        { name: 'billing_type', value: formType === 'aged_care' ? 'Aged Care' : 'NDIS' },
        { name: 'submitted_at', value: new Date().toISOString() },
        ...(formType === 'ndis' ? [
          { name: 'ndis_number',   value: formData.ndis_number    || '' },
          { name: 'provider_name', value: formData.provider_name  || '' },
          { name: 'provider_email',value: formData.provider_email || '' },
        ] : [
          { name: 'package_level', value: formData.package_level  || '' },
          { name: 'provider_name', value: formData.provider_name  || '' },
        ]),
      ],
      tags:                        formType === 'aged_care' ? 'aged-care-invoice' : 'ndis-invoice',
      use_customer_default_address: false,
    }
  };

  const response = await fetch(`${baseUrl}/draft_orders.json`, {
    method: 'POST',
    headers: {
      'Content-Type':           'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: JSON.stringify(draftOrderPayload),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Shopify Draft Order creation failed (${response.status}): ${errText}`);
  }

  const data = await response.json();
  return data.draft_order;
}

module.exports = { createDraftOrder };
