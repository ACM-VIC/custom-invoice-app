const express       = require('express');
const router        = express.Router();
const shopifyService = require('../services/shopify');
const pdfService    = require('../services/pdf');
const emailService  = require('../services/email');
/**
 * POST /api/submit-order
 * Body: { formType: 'aged_care'|'ndis', formData: {...}, cart: {...} }
 */
router.post('/submit-order', async (req, res) => {
  const { formType, formData, cart } = req.body;
  // ── Basic validation ─────────────────────────────────────────────────────
  if (!formType || !formData || !cart) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }
  if (!['aged_care', 'ndis'].includes(formType)) {
    return res.status(400).json({ error: 'Invalid form type.' });
  }
  if (!formData.email || !formData.first_name || !formData.last_name) {
    return res.status(400).json({ error: 'Name and email are required.' });
  }
  try {
    // 1. Create Shopify Draft Order
    console.log(`[${formType}] Creating draft order for ${formData.email}`);
    console.log(`[DEBUG] cart received:`, JSON.stringify(cart, null, 2));
    console.log(`[DEBUG] formData received:`, JSON.stringify(formData, null, 2));

    const draftOrder = await shopifyService.createDraftOrder({ formType, formData, cart });
    console.log(`[DEBUG] draftOrder returned:`, JSON.stringify(draftOrder, null, 2));

    // 2. Generate PDF invoice
    console.log(`[${formType}] Generating PDF for draft order #${draftOrder.name}`);
    const pdfBuffer = await pdfService.generateInvoice({ formType, formData, draftOrder });
    // 3. Send email with PDF attached
    console.log(`[${formType}] Sending invoice email to ${formData.email}`);
    await emailService.sendInvoice({ formType, formData, draftOrder, pdfBuffer });
    return res.json({
      success: true,
      draftOrderId: draftOrder.id,
      draftOrderName: draftOrder.name,
    });
  } catch (err) {
    console.error('submit-order error:', err);
    console.error('submit-order error stack:', err.stack);
    return res.status(500).json({ error: 'Failed to process order. Please try again.' });
  }
});
module.exports = router;