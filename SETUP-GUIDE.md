# Setup Guide — Shopify Aged Care / NDIS Invoice App

## Overview
This app replaces Hulk Form Builder + YouQuote + Vify with a single custom system
hosted on Azure. No monthly app fees. You own the code.

---

## Part 1 — Create the Shopify Custom App

1. In Shopify Admin go to **Settings → Apps → Develop apps**
2. Click **Create an app** and name it (e.g. "Invoice App")
3. Click **Configure Admin API scopes** and enable:
   - `write_draft_orders`
   - `read_draft_orders`
   - `read_products`
   - `read_customers`
4. Click **Save** then **Install app**
5. Copy the **Admin API access token** (shown once — save it securely)
6. Add this token to your Azure environment variables as `SHOPIFY_ACCESS_TOKEN`
7. Add your store domain (e.g. `your-store.myshopify.com`) as `SHOPIFY_SHOP_DOMAIN`

---

## Part 2 — Deploy backend to Azure App Service

### Option A: Deploy via VS Code (easiest)
1. Install the **Azure App Service** extension for VS Code
2. Open the `/backend` folder in VS Code
3. Right-click the backend folder → **Deploy to Web App**
4. Create a new App Service: choose **Node 18 LTS**, **Linux**, **Free F1** tier to start
5. After deploy, go to Azure Portal → Your App Service → **Configuration → Application settings**
6. Add all values from `.env.example` as Application Settings (these become env vars)

### Option B: Deploy via Azure CLI
```bash
cdcd 
az login
az webapp up --name your-invoice-app --resource-group your-rg --runtime "NODE:18-lts"
# Then set env vars:
az webapp config appsettings set --name your-invoice-app --resource-group your-rg --settings \
  SHOPIFY_SHOP_DOMAIN=your-store.myshopify.com \
  SHOPIFY_ACCESS_TOKEN=shpat_xxx \
  OUTLOOK_EMAIL=invoices@yourstore.com.au \
  OUTLOOK_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx \
  STORE_NAME="Your Store Name Pty Ltd" \
  STORE_ABN="12 345 678 901" \
  STORE_EMAIL=info@yourstore.com.au \
  NODE_ENV=production
```

### Note on Puppeteer on Azure
Puppeteer runs headless Chrome to generate PDFs. On Azure App Service Linux you need to:
```bash
# Add to startup command in Azure Portal → Configuration → Startup Command:
npm install && node server.js
```
Puppeteer auto-downloads Chromium. If it fails, set:
`PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false` in Application Settings.

---

## Part 3 — Set up Microsoft Outlook App Password

1. Go to **https://account.microsoft.com/security**
2. Click **Advanced security options**
3. Under **App passwords**, click **Create a new app password**
4. Copy the generated password and add it as `OUTLOOK_APP_PASSWORD` in Azure

> **Note:** If your Microsoft 365 account is managed by an IT admin,
> they may need to enable SMTP AUTH for your account in the M365 admin panel.
> Go to: Microsoft 365 Admin > Users > [your user] > Mail > Manage email apps
> → Enable "Authenticated SMTP"

---

## Part 4 — Install the theme extension in Dawn

1. In Shopify Admin go to **Online Store → Themes → Actions → Edit code**
2. Under **Assets**, click **Add a new asset** → upload `checkout-modal.js`
3. Under **Snippets**, click **Add a new snippet** → name it `checkout-modal`
4. Paste the contents of `checkout-modal.liquid` into this snippet
5. Open **Layout → theme.liquid**
6. Find `</body>` and add this line just before it:
   ```liquid
   {% render 'checkout-modal' %}
   ```
7. In `checkout-modal.js`, update line 9:
   ```js
   const BACKEND_URL = 'https://YOUR-AZURE-APP.azurewebsites.net';
   ```
   Replace with your actual Azure App Service URL.
8. Save all files

---

## Part 5 — Test end to end

1. Add an item to your cart on the storefront
2. Click Checkout — the 3-option modal should appear
3. Click **NDIS** or **Aged Care** and fill in the form
4. Submit — check:
   - [ ] Draft order appears in Shopify Admin → Orders → Drafts
   - [ ] Draft order is tagged `ndis-invoice` or `aged-care-invoice`
   - [ ] Customer receives email with PDF attached
   - [ ] PDF shows correct line items, totals, and form details
   - [ ] Your team receives BCC copy

---

## Part 6 — Processing approved orders (your team workflow)

1. Customer receives invoice email and forwards to their provider/coordinator
2. Provider pays your store
3. In Shopify Admin → Orders → Drafts → find the draft order
4. Click **Create order** — this converts it to a live order and reserves inventory
5. Fulfil as normal

---

## Customisation

- **Invoice logo**: Add a `<img>` tag to `templates/invoice.html` with a base64-encoded logo
- **Email styling**: Edit `services/email.js` → `buildEmailHtml()`
- **Add form fields**: Edit the `AGED_CARE_FIELDS` / `NDIS_FIELDS` strings in `checkout-modal.js`
  and map new fields in `services/shopify.js` → `buildNote()` and `services/pdf.js` → `templateData`
- **GST rate**: Currently hardcoded as 10% (Australian standard). Shopify returns tax amounts
  from the draft order so this adjusts automatically with your tax settings.

---

## File structure

```
shopify-app/
├── theme-extension/
│   ├── checkout-modal.js       ← Upload to Shopify Assets
│   └── checkout-modal.liquid   ← Upload to Shopify Snippets
└── backend/                    ← Deploy to Azure App Service
    ├── server.js
    ├── package.json
    ├── .env.example
    ├── routes/
    │   └── submit-order.js
    ├── services/
    │   ├── shopify.js          ← Creates draft orders
    │   ├── pdf.js              ← Generates PDF with Puppeteer
    │   └── email.js            ← Sends via Outlook SMTP
    └── templates/
        └── invoice.html        ← PDF invoice template
```
