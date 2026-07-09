/**
 * Shipping Weights Config
 * Approximate parcel weight/dimensions per shipping category, used to
 * request an accurate Sendle quote via services/sendle.js.
 *
 * These are estimates covering the TYPICAL item in each category — pick
 * numbers on the generous side within a category so the quote doesn't
 * undercharge for your heavier items. Adjust freely; this is the main file
 * to tune if quoted prices look off for a category.
 *
 * weightKg:      total parcel weight in kilograms
 * dimensionsCm:  {length, width, height} in cm — used to estimate cubic
 *                weight (Sendle charges on whichever of actual weight or
 *                cubic weight is greater)
 *
 * NOTE: 'bulky' is intentionally NOT included here — bulky items never
 * call Sendle (see checkout-modal.js SHIPPING MODULE v6 notes), they
 * always go through the manual quote flow instead.
 */

'use strict';

module.exports = {
  small: {
    weightKg:     2,
    dimensionsCm: { length: 40, width: 30, height: 15 },
  },
  medium: {
    weightKg:     8,
    dimensionsCm: { length: 60, width: 40, height: 30 },
  },
  large: {
    weightKg:     20,
    dimensionsCm: { length: 100, width: 60, height: 50 },
  },
};
