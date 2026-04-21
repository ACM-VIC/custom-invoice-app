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
    // This is the standard cache location Puppeteer uses on Linux
    const { executablePath } = require('puppeteer');
    return executablePath();
  } catch (e) {
    // Fallback: walk the known cache directory
    const cacheDir = path.join(
      process.env.HOME || '/root',
      '.cache', 'puppeteer', 'chrome'
    );
    if (fs.existsSync(cacheDir)) {
      // Find the first chrome binary inside the cache
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

  const templateData = {
    storeName:    STORE_NAME,
    storeAbn:     STORE_ABN,
    storeEmail:   STORE_EMAIL,
    storePhone:   STORE_PHONE,
    storeAddress: STORE_ADDRESS,
    invoiceNumber: draftOrder.name,
    invoiceDate:   new Date().toLocaleDateString('en-AU', {
                     day: '2-digit', month: 'long', year: 'numeric'
                   }),
    dueDate: new Date(Date.now() + 14 * 86400000).toLocaleDateString('en-AU', {
               day: '2-digit', month: 'long', year: 'numeric'
             }),
    isNdis:      formType === 'ndis',
    isAgedCare:  formType === 'aged_care',
    billingType: formType === 'ndis' ? 'NDIS' : 'Aged Care',
    customerName:  `${formData.first_name} ${formData.last_name}`,
    customerEmail: formData.email,
    deliveryAddress: [
      formData.address_line1,
      `${formData.suburb} ${formData.state} ${formData.postcode}`,
      'Australia'
    ].join(', '),
    ndisNumber:    formData.ndis_number   || '',
    providerName:  formData.provider_name  || '',
    providerEmail: formData.provider_email || '',
    packageLevel:  formData.package_level  || '',
    customerNotes: formData.notes          || '',
    lineItems: formatLineItems(draftOrder),
    subtotal: `$${subtotal}`,
    tax:      `$${tax}`,
    total:    `$${total}`,
    gstNote:  `GST included in total: $${tax}`,
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