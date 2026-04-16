/**
 * PDF Service
 * Generates a professional tax invoice PDF using Puppeteer Core +
 * @sparticuz/chromium — a Chromium build designed for serverless/Azure
 * environments where the system does NOT have Chrome installed.
 *
 * FIX: The original service used `puppeteer` (full package) which bundles
 * its own Chromium but fails on Azure App Service due to sandbox restrictions
 * and missing system dependencies. This version uses puppeteer-core +
 * @sparticuz/chromium which is purpose-built for these environments.
 *
 * Required packages (add to package.json):
 *   "@sparticuz/chromium": "^123.0.0"
 *   "puppeteer-core": "^22.0.0"
 *   "handlebars": "^4.7.8"
 */

const chromium   = require('@sparticuz/chromium');
const puppeteer  = require('puppeteer-core');
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

/**
 * Format line items from Shopify draft order for the template.
 */
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

/**
 * Generate a PDF invoice buffer.
 */
async function generateInvoice({ formType, formData, draftOrder }) {
  const STORE_NAME    = process.env.STORE_NAME    || 'Aged Care & Medical';
  const STORE_ABN     = process.env.STORE_ABN     || '54 164 689 294';
  const STORE_EMAIL   = process.env.STORE_EMAIL   || 'accounts@agedcareandmedical.com.au';
  const STORE_PHONE   = process.env.STORE_PHONE   || '1300 003 930';
  const STORE_ADDRESS = process.env.STORE_ADDRESS || '46/107 Wells Road, Chelsea Heights, Victoria, Australia';

  const subtotal = parseFloat(draftOrder.subtotal_price || 0).toFixed(2);
  const tax      = parseFloat(draftOrder.total_tax       || 0).toFixed(2);
  const total    = parseFloat(draftOrder.total_price     || 0).toFixed(2);

  const templateData = {
    // Store info
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

    // Billing type
    isNdis:     formType === 'ndis',
    isAgedCare: formType === 'aged_care',
    billingType: formType === 'ndis' ? 'NDIS' : 'Aged Care',

    // Customer
    customerName:  `${formData.first_name} ${formData.last_name}`,
    customerEmail: formData.email,
    deliveryAddress: [
      formData.address_line1,
      `${formData.suburb} ${formData.state} ${formData.postcode}`,
      'Australia'
    ].join(', '),

    // NDIS-specific
    ndisNumber:     formData.ndis_number     || '',
    providerName:   formData.provider_name   || '',
    providerEmail:  formData.provider_email  || '',

    // Aged Care-specific
    packageLevel: formData.package_level || '',

    // Notes
    customerNotes: formData.notes || '',

    // Line items
    lineItems: formatLineItems(draftOrder),

    // Totals
    subtotal: `$${subtotal}`,
    tax:      `$${tax}`,
    total:    `$${total}`,

    // GST note
    gstNote: `GST included in total: $${tax}`,
  };

  const html = template(templateData);

  // FIX: Use @sparticuz/chromium to get a valid executablePath on Azure.
  // chromium.executablePath() downloads/extracts the Chromium binary on first
  // run and caches it — works on Azure App Service, Lambda, and other
  // restricted environments where `puppeteer` (full package) fails.
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH
    || await chromium.executablePath();

  const browser = await puppeteer.launch({
    executablePath,
    headless: chromium.headless,
    args: [
      ...chromium.args,             // includes --no-sandbox, --disable-gpu, etc.
      '--disable-dev-shm-usage',    // prevent /dev/shm crashes on Azure
      '--single-process',           // required for some Azure sandbox configs
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
