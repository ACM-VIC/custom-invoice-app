'use strict';
const express    = require('express');
const router     = express.Router();
const { generateInvoice }                                          = require('../services/pdf');
const { sendInvoice, sendQuoteRequest, sendQuoteAcknowledgement, sendInternalInvoiceNotification } = require('../services/email');
// ─── ENV VARIABLES ────────────────────────────────────────────────────────────
const SHOPIFY_SHOP_DOMAIN  = process.env.SHOPIFY_SHOP_DOMAIN;
const SHOPIFY_ACCESS_TOKEN   = process.env.SHOPIFY_ACCESS_TOKEN;
const SHOPIFY_VERSION = process.env.SHOPIFY_API_VERSION || '2024-01';

// ─── STARTUP GUARD ────────────────────────────────────────────────────────────
if (!SHOPIFY_SHOP_DOMAIN) {
  console.error(
    '[submit-order] ⚠️  SHOPIFY_SHOP_DOMAIN is not set. ' +
    'Set it in Azure Portal → App Service → Configuration → Application Settings.'
  );
}
if (!SHOPIFY_ACCESS_TOKEN) {
  console.error(
    '[submit-order] ⚠️  SHOPIFY_ACCESS_TOKEN is not set. ' +
    'Set it in Azure Portal → App Service → Configuration.'
  );
}
console.warn(
  '[submit-order] ⚠️  PDF generation is TEMPORARILY DISABLED and all emails ' +
  '(customer + bulky) are TEMPORARILY routed to internal notification only, no PDF attached. ' +
  'See the commented-out Steps 3 & 4 in handleSubmitOrder to restore normal behaviour.'
);
// ─────────────────────────────────────────────────────────────────────────────
// SHIPPING HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function extractShippingLine(formData) {
  const rawPrice    = formData.shipping_price;
  const isQuote     = rawPrice === 'quote';
  const priceNumber = (!rawPrice || isQuote) ? null : parseFloat(rawPrice);
  return {
    title:         formData.shipping_title         || 'Delivery',
    price:         isQuote ? 'quote' : priceNumber,
    priceDisplay:  formData.shipping_price_display  || (isQuote ? 'Manual Quote' : 'TBC'),
    category:      formData.shipping_category       || '',
    categoryLabel: formData.shipping_category_label || '',
    zone:          formData.shipping_zone           || '',
    zoneLabel:     formData.shipping_zone_label     || '',
    isQuote,
    overrideNotes:   formData.shipping_override_notes   || '',
    upgradeSummary:  formData.shipping_upgrade_summary  || '',
    drivingItem:     formData.shipping_driving_item     || '',
  };
}
// ─────────────────────────────────────────────────────────────────────────────
// DISCOUNT CODE HELPERS
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Looks up a customer-entered discount code against Shopify and resolves it
 * to the underlying price rule's value/type, so it can be applied to the
 * draft order as an `applied_discount`.
 *
 * Returns null if no code was entered. Otherwise always resolves (never
 * throws) to an object describing whether the code is usable:
 *   { code, valid: true,  value_type: 'percentage'|'fixed_amount', value, title }
 *   { code, valid: false, reason: '<human readable reason>' }
 */
async function lookupDiscountCode(rawCode) {
  const code = (rawCode || '').trim();
  if (!code) return null;

  if (!SHOPIFY_SHOP_DOMAIN || !SHOPIFY_ACCESS_TOKEN) {
    console.error('[submit-order] Discount lookup skipped — Shopify env vars not configured.');
    return { code, valid: false, reason: 'Store not configured for discount lookup' };
  }

  try {
    // Step 1: resolve the discount code → price_rule_id
    const lookupUrl = `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/${SHOPIFY_VERSION}/discount_codes/lookup.json?code=${encodeURIComponent(code)}`;
    const lookupRes = await fetch(lookupUrl, {
      headers: { 'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN },
    });

    if (lookupRes.status === 404) {
      return { code, valid: false, reason: 'Discount code not found' };
    }
    if (!lookupRes.ok) {
      const errBody = await lookupRes.text().catch(() => '');
      console.error(`[submit-order] Discount lookup failed (${lookupRes.status}): ${errBody}`);
      return { code, valid: false, reason: `Lookup failed (${lookupRes.status})` };
    }

    const lookupJson   = await lookupRes.json();
    const discountCode = lookupJson.discount_code;
    if (!discountCode || !discountCode.price_rule_id) {
      return { code, valid: false, reason: 'Discount code not found' };
    }

    // Step 2: fetch the price rule to get the value/type
    const priceRuleUrl = `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/${SHOPIFY_VERSION}/price_rules/${discountCode.price_rule_id}.json`;
    const priceRuleRes = await fetch(priceRuleUrl, {
      headers: { 'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN },
    });

    if (!priceRuleRes.ok) {
      const errBody = await priceRuleRes.text().catch(() => '');
      console.error(`[submit-order] Price rule fetch failed (${priceRuleRes.status}): ${errBody}`);
      return { code, valid: false, reason: 'Could not load discount details' };
    }

    const priceRuleJson = await priceRuleRes.json();
    const priceRule     = priceRuleJson.price_rule;
    if (!priceRule) {
      return { code, valid: false, reason: 'Could not load discount details' };
    }

    // Skip codes that are expired or not yet active — treat as not usable.
    const now = new Date();
    if (priceRule.starts_at && new Date(priceRule.starts_at) > now) {
      return { code, valid: false, reason: 'Discount code is not active yet' };
    }
    if (priceRule.ends_at && new Date(priceRule.ends_at) < now) {
      return { code, valid: false, reason: 'Discount code has expired' };
    }
    if (priceRule.usage_limit != null && typeof discountCode.usage_count === 'number'
        && discountCode.usage_count >= priceRule.usage_limit) {
      return { code, valid: false, reason: 'Discount code has reached its usage limit' };
    }

    // price_rule.value is a negative string, e.g. "-10.0" (10% or $10 off)
    const numericValue = Math.abs(parseFloat(priceRule.value || '0'));

    return {
      code,
      valid: true,
      value_type: priceRule.value_type === 'percentage' ? 'percentage' : 'fixed_amount',
      value: numericValue,
      title: priceRule.title || code,
    };
  } catch (err) {
    console.error('[submit-order] Discount code lookup error:', err.message);
    return { code, valid: false, reason: 'Lookup error' };
  }
}
// ─── SHOPIFY HELPERS ──────────────────────────────────────────────────────────
function buildShopifyShippingLine(shipping) {
  if (!shipping || shipping.price === null) return null;
  const priceValue = (shipping.isQuote || shipping.price === 'quote')
    ? '0.00'
    : Number(shipping.price).toFixed(2);
  return { title: shipping.title || 'Delivery', price: priceValue, custom: true };
}
/**
 * Builds the draft order's top-level `applied_discount` object from a
 * resolved lookupDiscountCode() result. Returns null if there's nothing
 * valid to apply (no code entered, or the code failed validation).
 */
function buildShopifyAppliedDiscount(discount) {
  if (!discount || !discount.valid) return null;
  return {
    description: `Discount code: ${discount.code}`,
    value_type:  discount.value_type,
    value:       discount.value.toString(),
    title:       discount.title,
  };
}
function buildLineItems(cartItems) {
  if (!cartItems?.length) return [];
  return cartItems.map(item => ({
    variant_id: item.variant_id,
    quantity:   item.quantity,
    price:      (item.price / 100).toFixed(2),
    title:      item.product_title || item.title,
  }));
}
function buildShippingAddress(formData) {
  const fullName  = formData.participant_full_name || '';
  const nameParts = fullName.trim().split(' ');
  return {
    first_name: nameParts[0] || '',
    last_name:  nameParts.slice(1).join(' ') || '',
    address1:   formData.address_line1 || '',
    city:       formData.suburb        || '',
    province:   formData.state         || '',
    zip:        formData.postcode      || '',
    country:    'AU',
    phone:      formData.delivery_phone || formData.submitter_phone || '',
  };
}
function buildNoteAttributes(formType, formData, shipping, discount) {
  const priceNote = shipping.isQuote
    ? 'Manual Quote Required'
    : (shipping.price !== null ? `$${Number(shipping.price).toFixed(2)}` : 'TBC');
  const attrs = [
    { name: 'Form Type',         value: formType === 'ndis' ? 'NDIS' : 'Aged Care / Government' },
    { name: 'Submitter Name',    value: formData.submitter_full_name  || '' },
    { name: 'Submitter Email',   value: formData.submitter_email      || '' },
    { name: 'Submitter Phone',   value: formData.submitter_phone      || '' },
    { name: 'Participant Name',  value: formData.participant_full_name || '' },
    { name: 'Delivery Suburb',   value: formData.suburb               || '' },
    { name: 'Delivery State',    value: formData.state                || '' },
    { name: 'Delivery Postcode', value: formData.postcode             || '' },
    { name: 'Shipping Category', value: shipping.categoryLabel        || '' },
    { name: 'Delivery Zone',     value: shipping.zoneLabel            || '' },
    { name: 'Shipping Method',   value: shipping.title                || '' },
    { name: 'Shipping Fee',      value: priceNote                        },
  ];
  if (shipping.overrideNotes) {
    attrs.push({ name: 'Freight Notes', value: shipping.overrideNotes });
  }
  if (discount) {
    attrs.push({ name: 'Discount Code', value: discount.code });
    attrs.push({
      name: 'Discount Applied',
      value: discount.valid
        ? (discount.value_type === 'percentage'
            ? `${discount.value}% off (${discount.title})`
            : `$${Number(discount.value).toFixed(2)} off (${discount.title})`)
        : `Not applied — ${discount.reason}`,
    });
  }
  if (formType === 'ndis') {
    attrs.push(
      { name: 'Funding Type',   value: formData.ndis_funding_type   || '' },
      { name: 'NDIS Number',    value: formData.ndis_number         || '' },
      { name: 'Submitter Role', value: formData.ndis_submitter_role || '' },
    );
    if (formData.ndis_funding_type === 'plan_managed') {
      attrs.push(
        { name: 'Plan Manager',   value: formData.plan_manager_company || '' },
        { name: 'Plan Mgr Email', value: formData.plan_manager_email   || '' },
      );
    }
  }
  if (formType === 'aged_care') {
    attrs.push(
      { name: 'Funding Program',  value: formData.ac_funding_type   || '' },
      { name: 'Submitter Role',   value: formData.ac_submitter_role || '' },
      { name: 'Client Reference', value: formData.client_reference  || '' },
    );
  }
  if (formData.notes) {
    attrs.push({ name: 'Notes', value: formData.notes });
  }
  return attrs.filter(a => a.value && a.value.trim() !== '');
}
async function createShopifyDraftOrder({ formType, formData, cart, shipping, discount }) {
  if (!SHOPIFY_SHOP_DOMAIN || !SHOPIFY_ACCESS_TOKEN) {
    throw new Error(
      'Shopify env vars not configured — set SHOPIFY_SHOP_DOMAIN and SHOPIFY_ACCESS_TOKEN.'
    );
  }
  const lineItems        = buildLineItems(cart.items);
  const shippingAddress  = buildShippingAddress(formData);
  const noteAttributes   = buildNoteAttributes(formType, formData, shipping, discount);
  const shopifyShipping  = buildShopifyShippingLine(shipping);
  const appliedDiscount  = buildShopifyAppliedDiscount(discount);
  const draftOrderPayload = {
    draft_order: {
      line_items:       lineItems,
      shipping_address: shippingAddress,
      billing_address:  shippingAddress,
      note_attributes:  noteAttributes,
      note:             formData.notes || '',
      email:            formData.submitter_email || '',
      phone:            formData.submitter_phone || '',
      tags: [
        formType === 'ndis' ? 'NDIS' : 'Aged Care',
        formData.ndis_funding_type || formData.ac_funding_type || '',
        'Modal Order',
        shipping.isQuote ? 'Freight Quote Needed' : '',
        discount && discount.valid ? 'Discount Applied' : '',
        discount && !discount.valid ? 'Discount Code Invalid' : '',
      ].filter(Boolean).join(', '),
      ...(shopifyShipping && { shipping_line: shopifyShipping }),
      ...(appliedDiscount && { applied_discount: appliedDiscount }),
    },
  };
  const url = `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/${SHOPIFY_VERSION}/draft_orders.json`;
  console.log(`[submit-order] Creating Shopify draft order → ${url}`);
  const res = await fetch(url, {
    method:  'POST',
    headers: {
      'Content-Type':           'application/json',
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
    },
    body: JSON.stringify(draftOrderPayload),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Shopify API error (${res.status}): ${errBody}`);
  }
  const json = await res.json();
  return json.draft_order;
}
// ─── PDF HELPERS ──────────────────────────────────────────────────────────────
function buildPdfShippingRow(shipping) {
  if (!shipping || (shipping.price === null && !shipping.isQuote)) {
    return {
      sku: '', description: 'Delivery — to be arranged', qty: 1,
      unit_price: null, total: null, is_shipping: true,
      note: 'Please contact us for a delivery quote.',
    };
  }
  if (shipping.isQuote) {
    return {
      sku: '',
      description: `${shipping.title} — ${shipping.categoryLabel} (${shipping.zoneLabel})`,
      qty: 1, unit_price: null, total: null, display: 'Manual Quote', is_shipping: true,
      note: shipping.overrideNotes
        ? `Freight notes: ${shipping.overrideNotes}`
        : 'Freight cost to be confirmed. Our team will contact you.',
    };
  }
  const price = Number(shipping.price);
  return {
    sku: '', description: `${shipping.title}`, qty: 1,
    unit_price: price, total: price,
    display: shipping.priceDisplay || `$${price.toFixed(2)}`,
    is_shipping: true,
    note: `${shipping.categoryLabel} · ${shipping.zoneLabel}`,
  };
}
function buildPdfDiscountRow(discount) {
  if (!discount || !discount.valid) return null;
  const display = discount.value_type === 'percentage'
    ? `-${discount.value}%`
    : `-$${Number(discount.value).toFixed(2)}`;
  return {
    sku: '', description: `Discount — ${discount.title} (${discount.code})`,
    display, is_discount: true,
  };
}
function buildPdfTotals(cart, shipping, discount) {
  const subtotalCents  = cart.total_price || 0;
  const subtotalDollar = subtotalCents / 100;
  const shippingDollar = (shipping && !shipping.isQuote && shipping.price !== null)
    ? Number(shipping.price) : 0;

  let discountDollar = 0;
  if (discount && discount.valid) {
    discountDollar = discount.value_type === 'percentage'
      ? subtotalDollar * (discount.value / 100)
      : Math.min(discount.value, subtotalDollar);
  }

  const grandTotal = Math.max(0, subtotalDollar - discountDollar + shippingDollar);
  let shippingDisplay;
  if (!shipping || shipping.price === null)  shippingDisplay = 'TBC';
  else if (shipping.isQuote)                 shippingDisplay = 'Manual Quote — To Be Confirmed';
  else                                       shippingDisplay = shipping.priceDisplay || `$${shippingDollar.toFixed(2)}`;
  return {
    subtotal_cents:      subtotalCents,
    subtotal_display:    `$${subtotalDollar.toFixed(2)}`,
    discount_applied:    discount && discount.valid ? discount.code : null,
    discount_display:    (discount && discount.valid) ? `-$${discountDollar.toFixed(2)}` : null,
    shipping_price:      shippingDollar,
    shipping_display:    shippingDisplay,
    shipping_title:      shipping?.title        || 'Delivery',
    shipping_category:   shipping?.categoryLabel || '',
    shipping_zone:       shipping?.zoneLabel     || '',
    grand_total_cents:   Math.round(grandTotal * 100),
    grand_total_display: shipping?.isQuote
      ? `$${(subtotalDollar - discountDollar).toFixed(2)} + freight TBC`
      : `$${grandTotal.toFixed(2)}`,
  };
}
// ─── MAIN ROUTE HANDLER ───────────────────────────────────────────────────────
async function handleSubmitOrder(req, res) {
  try {
    const { formType, formData, cart } = req.body;
    if (!formType || !formData) {
      return res.status(400).json({ success: false, message: 'Missing formType or formData.' });
    }
    const safeCart = cart || { items: [], total_price: 0 };
    // ── Step 1: Extract shipping ──────────────────────────────────────────────
    const shipping = extractShippingLine(formData);
    console.log('[submit-order] Shipping extracted:', {
      category: shipping.categoryLabel, zone: shipping.zoneLabel,
      price: shipping.priceDisplay, isQuote: shipping.isQuote, title: shipping.title,
    });

    // ── Step 1b: Resolve discount code (if the customer entered one) ───────────
    const discount = await lookupDiscountCode(formData.discount_code);
    if (discount) {
      console.log('[submit-order] Discount code extracted:', {
        code: discount.code, valid: discount.valid,
        reason: discount.reason, value_type: discount.value_type, value: discount.value,
      });
    }

    // ── BULKY / FREIGHT FLAG ───────────────────────────────────────────────────
    // shipping.isQuote is true whenever the winning shipping category is
    // 'bulky'. Because category ranking always promotes the highest-ranked
    // item to the winning category, a single Bulky/Freight item anywhere in
    // the cart guarantees isQuote === true here — so this flag is equivalent
    // to "does this order contain any Bulky/Freight item".
    const hasBulkyItem = shipping.isQuote;
    if (hasBulkyItem) {
      console.log('[submit-order] 🚛 Bulky/Freight item detected — customer email will be suppressed.');
    }
    // ── Step 2: Create Shopify Draft Order ─────────────────────────────────────
    // Draft order is created for BOTH standard and bulky/freight orders, so the
    // bulky order is visible in Shopify awaiting manual review. If a discount
    // code was entered and resolves to a valid, active price rule, it's applied
    // to the draft order as applied_discount — otherwise the draft order still
    // goes through and a note attribute records that the code wasn't applied.
    let draftOrder = null;
    try {
      draftOrder = await createShopifyDraftOrder({ formType, formData, cart: safeCart, shipping, discount });
      console.log(`[submit-order] Shopify draft order created: ${draftOrder.name} (${draftOrder.id})`);
    } catch (shopifyErr) {
      console.error('[submit-order] ❌ Shopify draft order FAILED:', shopifyErr.message);
    }

    let pdfBuffer = null;

    // ── Step 3: Generate PDF — TEMPORARILY DISABLED ────────────────────────────
    // try {
    //   pdfBuffer = await generateInvoice({ formType, formData, draftOrder });
    //   console.log(`[submit-order] ✅ PDF generated (${pdfBuffer.length} bytes)`);
    // } catch (pdfErr) {
    //   console.error('[submit-order] ❌ PDF generation FAILED:', pdfErr.message);
    // }

    // ── Step 4: Send email — TEMPORARILY internal-only, no PDF, no customer email ──
    // Normal branching (customer invoice for standard orders, internal notice
    // for bulky orders) is disabled below. Every order — bulky or not — now
    // sends ONLY the internal notification, with no PDF attached.
    //
    // if (hasBulkyItem) {
    //   try {
    //     await sendInternalInvoiceNotification({ formType, formData, draftOrder, pdfBuffer, shipping });
    //     console.log('[submit-order] ✅ Internal bulky-item notification sent to contact@agedcareandmedical.com.au');
    //   } catch (emailErr) {
    //     console.error('[submit-order] ❌ Internal bulky-item notification FAILED:', emailErr.message);
    //   }
    // } else {
    //   try {
    //     await sendInvoice({ formType, formData, draftOrder, pdfBuffer });
    //     console.log(`[submit-order] ✅ Invoice email sent to ${formData.submitter_email}`);
    //   } catch (emailErr) {
    //     console.error('[submit-order] ❌ Invoice email FAILED:', emailErr.message);
    //   }
    // }

    try {
      await sendInternalInvoiceNotification({ formType, formData, draftOrder, pdfBuffer, shipping });
      console.log('[submit-order] ✅ Internal notification sent to contact@agedcareandmedical.com.au (no PDF, no customer email — TEMP).');
    } catch (emailErr) {
      console.error('[submit-order] ❌ Internal notification FAILED:', emailErr.message);
    }

    // Step 5: Respond
    return res.json({
      success:          true,
      draft_order_id:   draftOrder?.id   || null,
      draft_order_name: draftOrder?.name || null,
      bulky_item_detected: hasBulkyItem,
      shipping_applied: {
        category: shipping.categoryLabel,
        zone:     shipping.zoneLabel,
        title:    shipping.title,
        price:    shipping.price,
        display:  shipping.priceDisplay,
      },
      discount_applied: discount ? {
        code:  discount.code,
        valid: discount.valid,
        reason: discount.valid ? null : discount.reason,
      } : null,
    });
  } catch (err) {
    console.error('[submit-order] Unhandled error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
}
// ─── ROUTER ───────────────────────────────────────────────────────────────────
router.post('/submit-order', handleSubmitOrder);
module.exports = router;