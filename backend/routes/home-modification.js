'use strict';
const express = require('express');
const multer  = require('multer');
const router  = express.Router();
const { sendHomeModsEnquiryNotification } = require('../services/email');

// In-memory storage — file is only forwarded as an email attachment, never
// written to disk. Cap at 10MB so a large upload can't stall the request.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

/**
 * POST /api/home-modifications-enquiry
 * multipart/form-data body matching the sections/home-modifications-form.liquid
 * field names: first_name, last_name, email, phone, client_name,
 * assessment_type, description, funding_source, attachment (file, optional)
 */
router.post('/home-modifications-enquiry', upload.single('attachment'), async (req, res) => {
  try {
    const formData = req.body || {};

    if (!formData.email || !formData.email.trim()) {
      return res.status(400).json({ success: false, message: 'Email is required.' });
    }

    const attachment = req.file
      ? {
          filename:    req.file.originalname,
          content:     req.file.buffer,
          contentType: req.file.mimetype,
        }
      : null;

    try {
      await sendHomeModsEnquiryNotification({ formData, attachment });
      console.log('[home-modifications] ✅ Internal notification sent to contact@agedcareandmedical.com.au');
    } catch (emailErr) {
      console.error('[home-modifications] ❌ Internal notification FAILED:', emailErr.message);
      return res.status(500).json({ success: false, message: 'Could not send notification email.' });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('[home-modifications] Unhandled error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

module.exports = router;