/**
 * Shopify Service
 * Creates Draft Orders via the Shopify Admin REST API.
 * Draft orders do NOT affect inventory.
 */
const SHOPIFY_DOMAIN  = process.env.SHOPIFY_SHOP_DOMAIN;
const ACCESS_TOKEN    = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION     = '2024-01';

const BASE_URL = `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}`;

/**
 * Map Shopify cart line items to Draft Order line items format.
 * Cart items use variant_id; Draft Orders accept variant_id directly.
 */
function mapLineItems(cartItems) {
  return cartItems.map(item => ({
    variant_id: item.variant_id,
    quantity: item.quantity,
    // price is read from the variant — no override needed unless custom pricing
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
      line_items: lineItems,
      customer: {
        first_name: formData.first_name,
        last_name:  formData.last_name,
        email:      formData.email,
      },
      shipping_address: shippingAddress,
      billing_address:  shippingAddress,
      note: buildNote(formType, formData),
      note_attributes: [
        { name: 'billing_type',   value: formType === 'aged_care' ? 'Aged Care' : 'NDIS' },
        { name: 'submitted_at',   value: new Date().toISOString() },
        ...(formType === 'ndis' ? [
          { name: 'ndis_number',      value: formData.ndis_number || '' },
          { name: 'provider_name',    value: formData.provider_name || '' },
          { name: 'provider_email',   value: formData.provider_email || '' },
        ] : [
          { name: 'package_level',    value: formData.package_level || '' },
          { name: 'provider_name',    value: formData.provider_name || '' },
        ]),
      ],
      // Do NOT set 'status' — it defaults to 'open' which is what we want
      // Inventory is only reserved when a draft order is converted to a real order
      tags: formType === 'aged_care' ? 'aged-care-invoice' : 'ndis-invoice',
      use_customer_default_address: false,
    }
  };

  const response = await fetch(`${BASE_URL}/draft_orders.json`, {
    method: 'POST',
    headers: {
      'Content-Type':           'application/json',
      'X-Shopify-Access-Token': ACCESS_TOKEN,
    },
    body: JSON.stringify(draftOrderPayload),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Shopify Draft Order creation failed: ${err}`);
  }

  const data = await response.json();
  return data.draft_order;
}

module.exports = { createDraftOrder };
