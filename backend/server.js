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
app.options('*', cors(corsOptions)); // handle preflight requests

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
    // Strip IPv6 prefix and port e.g. "::ffff:1.2.3.4" or "1.2.3.4:28578"
    return raw.replace(/^::ffff:/, '').replace(/:\d+$/, '');
  },
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
