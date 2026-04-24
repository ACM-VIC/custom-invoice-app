/**
 * PDF Service
 * Generates a professional tax invoice PDF using Puppeteer + Handlebars.
 */
const puppeteer  = require('puppeteer');
const Handlebars = require('handlebars');
const fs         = require('fs');
const path       = require('path');

// Register Handlebars helpers
Handlebars.registerHelper('formatCurrency', val =>
  `$${(parseFloat(val) / 100).toFixed(2)}`
);
Handlebars.registerHelper('formatDate', dateStr =>
  new Date(dateStr).toLocaleDateString('en-AU', {
    day: '2-digit', month: 'long', year: 'numeric'
  })
);
Handlebars.registerHelper('eq', (a, b) => a === b);

// Load and compile template once at startup
const templatePath   = path.join(__dirname, '../templates/invoice.html');
const templateSource = fs.readFileSync(templatePath, 'utf8');
const template       = Handlebars.compile(templateSource);

function formatLineItems(draftOrder) {
  return (draftOrder.line_items || []).map(item => ({
    title:    item.title,
    variant:  item.variant_title && item.variant_title !== 'Default Title'
                ? item.variant_title : '',
    sku:      item.sku || '',
    quantity: item.quantity,
    price:    `$${parseFloat(item.price).toFixed(2)}`,
    total:    `$${(parseFloat(item.price) * item.quantity).toFixed(2)}`,
  }));
}

// Resolve the Chrome executable that Puppeteer downloaded at startup
function getChromePath() {
  try {
    const { executablePath } = require('puppeteer');
    return executablePath();
  } catch (e) {
    const cacheDir = path.join(
      process.env.HOME || '/root',
      '.cache', 'puppeteer', 'chrome'
    );
    if (fs.existsSync(cacheDir)) {
      const entries = fs.readdirSync(cacheDir);
      for (const entry of entries) {
        const candidate = path.join(cacheDir, entry, 'chrome-linux64', 'chrome');
        if (fs.existsSync(candidate)) return candidate;
      }
    }
    throw new Error(`Chrome not found. Looked in ${cacheDir}`);
  }
}

async function generateInvoice({ formType, formData, draftOrder }) {
  const STORE_NAME    = process.env.STORE_NAME    || 'Aged Care & Medical';
  const STORE_ABN     = process.env.STORE_ABN     || '54 164 689 294';
  const STORE_EMAIL   = process.env.STORE_EMAIL   || 'accounts@agedcareandmedical.com.au';
  const STORE_PHONE   = process.env.STORE_PHONE   || '1300 003 930';
  const STORE_ADDRESS = process.env.STORE_ADDRESS || '46/107 Wells Road, Chelsea Heights, Victoria, Australia';

  const subtotal = parseFloat(draftOrder.subtotal_price || 0).toFixed(2);
  const tax      = parseFloat(draftOrder.total_tax       || 0).toFixed(2);
  const total    = parseFloat(draftOrder.total_price     || 0).toFixed(2);

  // ── Resolve participant / client name ──────────────────────────────────────
  const participantName =
    formData.participant_full_name ||
    `${formData.first_name || ''} ${formData.last_name || ''}`.trim();

  // ── Bill-To block ──────────────────────────────────────────────────────────
  // For plan-managed NDIS: bill to the Plan Manager.
  // For all others: bill to the participant / client.
  const isPlanManaged = formType === 'ndis' && formData.ndis_funding_type === 'plan_managed';

  const billTo = isPlanManaged
    ? {
        name:    formData.plan_manager_company || '',
        address: '',
        email:   formData.plan_manager_email   || '',
        phone:   formData.plan_manager_phone   || '',
      }
    : {
        name:    participantName,
        address: [
          formData.address_line1,
          `${formData.suburb || ''} ${formData.state || ''} ${formData.postcode || ''}`.trim(),
        ].filter(Boolean).join(', '),
        email:   formData.participant_email || formData.submitter_email || '',
        phone:   formData.delivery_phone    || formData.submitter_phone || '',
      };

  // ── Deliver-To block ───────────────────────────────────────────────────────
  const deliverTo = {
    address: [
      formData.address_line1,
      `${formData.suburb || ''} ${formData.state || ''} ${formData.postcode || ''}`.trim(),
      'Australia',
    ].filter(Boolean).join(', '),
    phone: formData.delivery_phone || '',
  };

  // ── NDIS-specific fields ───────────────────────────────────────────────────
  const ndisData = formType === 'ndis' ? {
    number:          formData.ndis_number          || '',
    supportCategory: formData.support_category     || '',
    fundingType:     (formData.ndis_funding_type   || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    providerName:    formData.plan_manager_company  || '',
    providerEmail:   formData.plan_manager_email    || '',
  } : {};

  // ── Aged Care-specific fields ──────────────────────────────────────────────
  const agedCareData = formType === 'aged_care' ? {
    clientId:     formData.client_reference || '',
    packageLevel: formData.package_level    || '',
    fundingType:  (formData.ac_funding_type || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    providerName: formData.hcp_provider_name || formData.submitter_organisation || '',
  } : {};

  // ── Reference / PO ────────────────────────────────────────────────────────
  const reference = formData.plan_manager_reference || formData.client_reference || '';
  const poNumber  = formData.hcp_po_number || '';

  const templateData = {
    // Store
    storeName:    STORE_NAME,
    storeAbn:     STORE_ABN,
    storeEmail:   STORE_EMAIL,
    storePhone:   STORE_PHONE,
    storeAddress: STORE_ADDRESS,

    // Invoice meta
    invoiceNumber: draftOrder.name,
    invoiceDate:   new Date().toLocaleDateString('en-AU', {
                     day: '2-digit', month: 'long', year: 'numeric'
                   }),
    dueDate: new Date(Date.now() + 14 * 86400000).toLocaleDateString('en-AU', {
               day: '2-digit', month: 'long', year: 'numeric'
             }),
    paymentTerms: 'Net 14 Days',

    // Type flags
    isNdis:      formType === 'ndis',
    isAgedCare:  formType === 'aged_care',
    billingType: formType === 'ndis' ? 'NDIS' : 'Aged Care',

    // Parties
    billTo,
    deliverTo,

    // Type-specific blocks
    ndis:     ndisData,
    agedCare: agedCareData,

    // Reference / PO
    reference,
    referenceLabel: formType === 'ndis' ? 'NDIS Reference' : 'Reference',
    poNumber,

    // Line items + totals
    lineItems: formatLineItems(draftOrder),
    subtotal:  `$${subtotal}`,
    tax:       `$${tax}`,
    total:     `$${total}`,
    gstNote:   `GST included in total: $${tax}`,

    // Customer notes
    customerNotes: formData.notes || '',

    // Bank / payment details
    bankName:      process.env.BANK_NAME           || '',
    accountName:   process.env.BANK_ACCOUNT_NAME   || '',
    bsb:           process.env.BANK_BSB            || '',
    accountNumber: process.env.BANK_ACCOUNT_NUMBER || '',
  };

  const html = template(templateData);

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: getChromePath(),
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--single-process',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' },
      printBackground: true,
    });
    return pdfBuffer;
  } finally {
    await browser.close();
  }
}

module.exports = { generateInvoice };