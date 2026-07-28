/**
 * =========================================
 * SERVER.JS — MAIN EXPRESS BACKEND SERVER
 * =========================================
 *
 * PURPOSE:
 * This is the main entry point of the backend system.
 * It initializes the Express app, applies security middleware,
 * and registers all API routes.
 *
 * FLOW:
 * Shopify Frontend → /api/submit-order → services → Shopify + PDF + Email
 * Shopify Frontend → /api/rental-enquiry → services → Shopify + PDF + Email
 * Shopify Frontend → /api/shipping-quote → services → Sendle
 * Shopify Frontend → /api/home-modifications-enquiry → services → Email
 * Shopify Frontend → /api/home-mod-assessment-enquiry → services → Email
 *
 * -----------------------------------------
 * 🔧 WHAT YOU EDIT HERE
 * -----------------------------------------
 * PORT:
 * - Change server port (default: 8080)
 *
 * CORS SETTINGS:
 * - Update allowed Shopify domains here:
 *   corsOptions.origin
 *
 * RATE LIMITING:
 * - Adjust request limits here:
 *   app.use('/api/', rateLimit({...}))
 *
 * SECURITY:
 * - Helmet config (rarely needed unless debugging headers)
 *
 * -----------------------------------------
 * DO NOT TOUCH
 * -----------------------------------------
 * - express.json middleware (required for API body parsing)
 * - route registration: app.use('/api', orderRoute) / app.use('/api', rentalEnquiryRoute) / app.use('/api', shippingQuoteRoute) / app.use('/api', homeModificationsRoute) / app.use('/api', homeModAssessmentRoute)
 *
 * -----------------------------------------
 * ⚠️ DEPLOY CHECKLIST BEFORE PUSHING THIS FILE
 * -----------------------------------------
 * A missing route file previously crashed the ENTIRE app on startup (every
 * route went down, not just the missing one), because a top-level require()
 * throws synchronously before app.listen() ever runs. Before deploying this
 * version, confirm BOTH of these files exist and are committed:
 *   - routes/home-modifications.js
 *   - routes/home-mod-assessment.js
 * If either is missing, either add it or comment out its require + app.use
 * pair (both lines) rather than deploying with a dangling require().
 */
require('dotenv').config();

// ── Force IPv4 DNS resolution ─────────────────────────────────────────────
// Node's built-in fetch (undici) can prefer IPv6 first. On Azure App Service
// this sometimes has no working IPv6 route, causing every outbound fetch()
// to fail with a generic "fetch failed" error (the real cause is hidden in
// error.cause). This forces IPv4 first, which resolves that class of issue.
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const express               = require('express');
const cors                  = require('cors');
const helmet                = require('helmet');
const rateLimit             = require('express-rate-limit');
const orderRoute             = require('./routes/submit-order');
const rentalEnquiryRoute     = require('./routes/rental-enquiry');
const shippingQuoteRoute     = require('./routes/shipping-quote');
const homeModificationsRoute = require('./routes/home-modifications');
const homeModAssessmentRoute = require('./routes/home-mod-assessment');

const app  = express();
const PORT = process.env.PORT || 8080;

// ── Trust Azure's reverse proxy ───────────────────────────────────────────────
app.set('trust proxy', 1);

// ── Security middleware ───────────────────────────────────────────────────────
app.use(helmet());

// ── CORS ──────────────────────────────────────────────────────────────────────
const corsOptions = {
  origin: [
    'https://agedcareandmedical.com.au',
    'https://www.agedcareandmedical.com.au',
  ],
  methods: ['POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  credentials: false,
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// ── Rate limit: max 20 submissions per 15 minutes per IP ─────────────────────
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many requests, please try again later.' },
  keyGenerator: (req) => {
    const raw = req.ip
      || (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
      || req.socket.remoteAddress
      || 'unknown';
    return raw.replace(/^::ffff:/, '').replace(/:\d+$/, '');
  },
}));

app.use(express.json({ limit: '2mb' }));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api', orderRoute);
app.use('/api', rentalEnquiryRoute);
app.use('/api', shippingQuoteRoute);
app.use('/api', homeModificationsRoute);
app.use('/api', homeModAssessmentRoute);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;