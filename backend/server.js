require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const orderRoute = require('./routes/submit-order');

const app  = express();
const PORT = process.env.PORT || 8080;

// ── Trust Azure's reverse proxy ───────────────────────────────────────────────
app.set('trust proxy', 1);

// ── Security middleware ───────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: [
    `https://${process.env.SHOPIFY_SHOP_DOMAIN || 'agedcareandmedical.com.au'}`,
  ],
  methods: ['POST', 'OPTIONS'],
}));

// Rate limit: max 20 submissions per 15 minutes per IP
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many requests, please try again later.' }
}));

app.use(express.json({ limit: '2mb' }));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api', orderRoute);
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;