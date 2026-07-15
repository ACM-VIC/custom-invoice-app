/**
 * =========================================
 * SHIPPING WEIGHTS / DIMENSIONS CONFIG
 * =========================================
 *
 * PURPOSE:
 * AusPost's pricing API needs a weight (kg) and box dimensions (cm) per
 * parcel to return a quote. Your Shopify products currently only carry a
 * size TAG (shipping:small / shipping:medium / shipping:large / shipping:bulky)
 * with no actual weight or dimensions set on the product/variant.
 *
 * This file is the single place that bridges that gap: it defines a
 * representative "standard box" per category, which is what gets sent to
 * AusPost when calculating a live quote.
 *
 * -----------------------------------------
 *  WHAT YOU EDIT HERE
 * -----------------------------------------
 * - weight_kg / length_cm / width_cm / height_cm per category, if your
 *   real average parcel sizes differ from these placeholders.
 *
 * IMPORTANT: These are placeholder estimates. Because they don't reflect
 * the actual weight of what's being shipped, quotes will be approximate —
 * likely close enough for small/medium items, but you may want to revisit
 * this once you have real numbers, especially for 'large' where a wrong
 * weight can swing the quote noticeably.
 *
 * Longer-term, the more accurate fix is to set an actual `weight` on each
 * Shopify product/variant and have this file fall back to it when present
 * (this file's category defaults are simply the initial baseline).
 *
 * -----------------------------------------
 *  AUSPOST-SPECIFIC RULES TO KEEP IN MIND
 * -----------------------------------------
 * - AusPost requires at least two of length/width/height to be >= 5cm, or
 *   the request will error out.
 * - Weight should reflect the DEAD weight of the parcel; if AusPost's
 *   cubic-weight calculation (L x W x H / 250 for parcels, per their
 *   published formula) exceeds the dead weight, they bill on cubic weight
 *   instead — this file doesn't need to calculate that, AusPost does it
 *   API-side, but keep dimensions honest so the quote is realistic.
 */

const SHIPPING_WEIGHTS = {
  small: {
    weight_kg: 1.5,
    length_cm: 30,
    width_cm: 20,
    height_cm: 15,
  },
  medium: {
    weight_kg: 5,
    length_cm: 45,
    width_cm: 35,
    height_cm: 25,
  },
  large: {
    weight_kg: 12,
    length_cm: 70,
    width_cm: 50,
    height_cm: 40,
  },
  // 'bulky' is intentionally NOT included — bulky/freight items always go
  // through the manual quote flow (see checkout-modal.js) and never call
  // the AusPost pricing API.
};

const DEFAULT_CATEGORY = 'medium';

/**
 * Returns { weight_kg, length_cm, width_cm, height_cm } for a given
 * shipping category, falling back to the 'medium' profile for any
 * unrecognised category.
 */
function getParcelProfile(category) {
  return SHIPPING_WEIGHTS[category] || SHIPPING_WEIGHTS[DEFAULT_CATEGORY];
}

module.exports = { SHIPPING_WEIGHTS, DEFAULT_CATEGORY, getParcelProfile };