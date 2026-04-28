/**
 * Checkout Modal - Theme Extension
 * Intercepts the cart checkout button and shows a 3-option modal.
 * Install: paste into Dawn theme > Assets > checkout-modal.js
 * Then add {% render 'checkout-modal' %} to theme.liquid before </body>
 *
 * Forms updated to match:
 *  - NDIS Order Request Form (Plan Managed / Self Managed / Private)
 *  - Government & Aged Care Funded Order Request Form
 *
 * Brand: Montserrat headings, Poppins body, #DC4E00 accent, #696969 grey
 */

(function () {
  'use strict';

  // ─── CONFIG ──────────────────────────────────────────────────────────────────
  const BACKEND_URL = 'https://custom-invoice-app-d2eeaufpc5a4h6ag.australiaeast-01.azurewebsites.net';
  // ─────────────────────────────────────────────────────────────────────────────

  const styles = `
    @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&family=Poppins:wght@400;500&display=swap');

    /* ── BRAND TOKENS ── */
    :root {
      --co-orange:   #DC4E00;
      --co-orange-d: #b83e00;
      --co-grey:     #696969;
      --co-grey-hl:  #929487;
      --co-white:    #FFFFFF;
      --co-bg:       #F9F9F8;
      --co-border:   #E2E2DF;
      --co-text:     #1A1A1A;
      --co-radius:   10px;
    }

    #co-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(26, 26, 26, 0.60);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      z-index: 99999;
      align-items: center;
      justify-content: center;
      font-family: 'Poppins', sans-serif;
    }
    #co-overlay.active { display: flex; }

    #co-modal {
      background: var(--co-white);
      border-radius: 16px;
      padding: 0;
      max-width: 620px;
      width: 95%;
      max-height: 90vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      box-shadow: 0 32px 80px rgba(0,0,0,0.22), 0 2px 8px rgba(220,78,0,0.08);
      position: relative;
    }

    /* ── MODAL HEADER STRIPE ── */
    #co-modal-header {
      background: var(--co-orange);
      padding: 20px 28px 18px;
      flex-shrink: 0;
      position: relative;
    }
    #co-modal-header h2 {
      font-family: 'Montserrat', sans-serif;
      font-size: 18px;
      font-weight: 700;
      color: var(--co-white);
      margin: 0 40px 4px 0;
      letter-spacing: -0.2px;
      line-height: 1.3;
      text-align: center;
    }
    #co-modal-header p.co-sub {
      font-size: 13px;
      color: rgba(255,255,255,0.82);
      margin: 0;
      font-family: 'Poppins', sans-serif;
      font-weight: 400;
      text-align: center;
    }

    /* ── CLOSE BUTTON ── */
    #co-close {
      position: absolute;
      top: 16px; right: 18px;
      background: rgba(255,255,255,0.18);
      border: none;
      font-size: 18px;
      cursor: pointer;
      color: var(--co-white);
      line-height: 1;
      width: 32px; height: 32px;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s;
    }
    #co-close:hover { background: rgba(255,255,255,0.32); }

    /* ── SCROLLABLE BODY ── */
    #co-modal-body {
      overflow-y: auto;
      padding: 24px 28px 28px;
      flex: 1;
    }

    /* ── OPTION BUTTONS GRID ── */
    #co-options-panel {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 4px 2px;
    }
    .co-btn {
      width: 100%;
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: flex-start;
      gap: 20px;
      padding: 18px 24px;
      border-radius: 12px;
      border: none;
      background: var(--co-orange);
      cursor: pointer;
      text-align: left;
      transition: background 0.18s, transform 0.14s, box-shadow 0.18s;
      font-family: 'Poppins', sans-serif;
      min-height: 80px;
    }
    .co-btn:hover {
      background: #3DAA5C;
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(0,0,0,0.18);
    }
    .co-btn:active { transform: translateY(0); }

    .co-btn-icon {
      width: 56px; height: 56px;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .co-btn-img {
      width: 56px;
      height: 56px;
      object-fit: contain;
    }

    .co-btn-label {
      font-family: 'Montserrat', sans-serif;
      font-size: 14px;
      font-weight: 700;
      color: #fff;
      display: block;
      line-height: 1.3;
    }
    .co-btn-desc {
      display: none;
    }

    /* ── FORM PANEL ── */
    #co-form-panel { display: none; }
    #co-form-panel.active { display: block; }
    #co-options-panel.hidden { display: none; }

    .co-form-title {
      font-family: 'Montserrat', sans-serif;
      font-size: 15px;
      font-weight: 700;
      color: var(--co-text);
      margin: 0 0 2px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .co-form-subtitle {
      font-size: 12px;
      color: var(--co-grey);
      margin: 0 0 20px;
      padding-left: 30px;
      font-family: 'Poppins', sans-serif;
    }
    .co-back {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 20px;
      color: var(--co-orange);
      padding: 0;
      line-height: 1;
      transition: opacity 0.15s;
    }
    .co-back:hover { opacity: 0.7; }

    /* ── SECTION HEADINGS ── */
    .co-section-heading {
      font-family: 'Montserrat', sans-serif;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--co-orange);
      margin: 24px 0 12px;
      padding-bottom: 8px;
      border-bottom: 2px solid #F2E0D8;
    }
    .co-section-heading:first-child { margin-top: 0; }

    /* ── FIELDS ── */
    .co-field { margin-bottom: 14px; }
    .co-field label {
      display: block;
      font-family: 'Montserrat', sans-serif;
      font-size: 12px;
      font-weight: 600;
      color: var(--co-grey);
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }
    .co-field label .co-optional {
      font-weight: 400;
      color: var(--co-grey-hl);
      font-size: 11px;
      margin-left: 4px;
      text-transform: none;
      letter-spacing: 0;
    }
    .co-field input,
    .co-field textarea,
    .co-field select {
      width: 100%;
      box-sizing: border-box;
      padding: 10px 13px;
      border: 1.5px solid var(--co-border);
      border-radius: 8px;
      font-size: 13px;
      color: var(--co-text);
      font-family: 'Poppins', sans-serif;
      transition: border-color 0.15s, box-shadow 0.15s;
      background: var(--co-white);
    }
    .co-field input:focus,
    .co-field textarea:focus,
    .co-field select:focus {
      outline: none;
      border-color: var(--co-orange);
      box-shadow: 0 0 0 3px rgba(220,78,0,0.10);
    }
    .co-field input::placeholder,
    .co-field textarea::placeholder { color: #BBBAB5; }
    .co-field textarea { resize: vertical; min-height: 76px; }

    .co-row { display: flex; gap: 12px; }
    .co-row .co-field { flex: 1; }

    /* ── RADIO GROUPS ── */
    .co-radio-group { display: flex; flex-direction: column; gap: 8px; }
    .co-radio-option {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 10px 13px;
      border: 1.5px solid var(--co-border);
      border-radius: 8px;
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s;
      font-family: 'Poppins', sans-serif;
    }
    .co-radio-option:has(input:checked) {
      border-color: var(--co-orange);
      background: #FFF7F3;
    }
    .co-radio-option input[type="radio"] {
      margin-top: 3px;
      flex-shrink: 0;
      width: auto;
      padding: 0;
      border: none;
      accent-color: var(--co-orange);
    }
    .co-radio-label {
      font-family: 'Montserrat', sans-serif;
      font-size: 13px;
      font-weight: 600;
      color: var(--co-text);
    }
    .co-radio-desc {
      font-size: 12px;
      color: var(--co-grey);
      display: block;
      margin-top: 2px;
      font-family: 'Poppins', sans-serif;
    }

    /* ── CHECKBOXES ── */
    .co-checkbox-group { display: flex; flex-direction: column; gap: 8px; }
    .co-checkbox-option {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 10px 13px;
      border: 1.5px solid var(--co-border);
      border-radius: 8px;
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s;
    }
    .co-checkbox-option:has(input:checked) {
      border-color: var(--co-orange);
      background: #FFF7F3;
    }
    .co-checkbox-option input[type="checkbox"] {
      margin-top: 2px;
      flex-shrink: 0;
      width: auto;
      padding: 0;
      border: none;
      accent-color: var(--co-orange);
    }
    .co-checkbox-label {
      font-size: 13px;
      color: var(--co-grey);
      line-height: 1.5;
      font-family: 'Poppins', sans-serif;
    }

    /* ── INFO BOX ── */
    .co-info-box {
      background: #FFF7F3;
      border-left: 3px solid var(--co-orange);
      border-radius: 6px;
      padding: 12px 14px;
      font-size: 12px;
      color: var(--co-grey);
      line-height: 1.7;
      margin-bottom: 14px;
      font-family: 'Poppins', sans-serif;
    }
    .co-info-box strong {
      font-family: 'Montserrat', sans-serif;
      font-weight: 700;
      color: var(--co-orange);
    }

    /* ── CONDITIONAL SECTIONS ── */
    .co-conditional { display: none; }
    .co-conditional.visible { display: block; }

    /* ── SUBMIT BUTTON ── */
    .co-submit {
      width: 100%;
      padding: 14px;
      background: var(--co-orange);
      color: var(--co-white);
      border: none;
      border-radius: var(--co-radius);
      font-family: 'Montserrat', sans-serif;
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.3px;
      cursor: pointer;
      margin-top: 16px;
      transition: background 0.15s, box-shadow 0.15s, transform 0.12s;
    }
    .co-submit:hover {
      background: var(--co-orange-d);
      box-shadow: 0 4px 16px rgba(220,78,0,0.28);
      transform: translateY(-1px);
    }
    .co-submit:active { transform: translateY(0); }
    .co-submit:disabled {
      background: var(--co-grey-hl);
      cursor: not-allowed;
      box-shadow: none;
      transform: none;
    }

    .co-error {
      color: #C0392B;
      font-size: 12px;
      margin-top: 10px;
      display: none;
      font-family: 'Poppins', sans-serif;
      text-align: center;
    }

    /* ── SUCCESS ── */
    .co-success-msg {
      text-align: center;
      padding: 32px 0 16px;
    }
    .co-success-msg .co-tick { font-size: 48px; margin-bottom: 14px; }
    .co-success-msg h3 {
      font-family: 'Montserrat', sans-serif;
      font-size: 20px;
      font-weight: 700;
      color: var(--co-text);
      margin: 0 0 10px;
    }
    .co-success-msg p {
      font-size: 13px;
      color: var(--co-grey);
      margin: 0;
      font-family: 'Poppins', sans-serif;
      line-height: 1.7;
    }

    /* ── HELPER TEXT ── */
    p[style*="color:#888"],
    p[style*="color: #888"],
    p[style*="color:#666"],
    p[style*="color: #666"] {
      font-family: 'Poppins', sans-serif !important;
    }

    /* Scrollbar styling */
    #co-modal-body::-webkit-scrollbar { width: 4px; }
    #co-modal-body::-webkit-scrollbar-track { background: transparent; }
    #co-modal-body::-webkit-scrollbar-thumb { background: var(--co-border); border-radius: 4px; }
    #co-modal-body::-webkit-scrollbar-thumb:hover { background: var(--co-grey-hl); }

    .table-wrapper {
      border: 1px solid var(--co-border);
      border-radius: 6px;
      overflow: hidden;
      margin-bottom: 16px;
    }

    /* ── MOBILE RESPONSIVE ── */
    @media (max-width: 480px) {
      #co-modal {
        max-width: 95%;
        width: 95%;
        max-height: 90dvh;
        border-radius: 16px;
        margin: auto;
      }
      #co-overlay {
        align-items: center;
      }
      #co-modal-header {
        padding: 18px 20px 14px;
      }
      #co-modal-header h2 {
        font-size: 16px;
      }
      #co-modal-body {
        padding: 18px 16px 32px;
      }
      .co-btn {
        padding: 14px 18px;
        gap: 16px;
        min-height: 68px;
      }
      .co-btn-icon {
        width: 44px; height: 44px;
      }
      .co-btn-img {
        width: 44px; height: 44px;
      }
      .co-btn-label {
        font-size: 14px;
      }
      .co-row {
        flex-direction: column;
        gap: 0;
      }
      .co-row .co-field[style*="max-width"] {
        max-width: 100% !important;
      }
      .co-field input,
      .co-field textarea,
      .co-field select {
        font-size: 16px; /* prevents iOS zoom on focus */
      }
      .co-submit {
        font-size: 15px;
        padding: 15px;
      }
      #co-modal-header h2 {
        margin-right: 36px;
      }
    }

    @media (max-width: 360px) {
      .co-btn-label { font-size: 13px; }
      .co-btn { padding: 12px 14px; gap: 12px; }
    }
  `;

  // ─── NDIS FORM ───────────────────────────────────────────────────────────────
  const NDIS_FIELDS = `
    <!-- SECTION 1: FUNDING TYPE -->
    <div class="co-section-heading">Section 1 — Funding Type</div>
    <div class="co-field">
      <label>How will this order be funded? *</label>
      <div class="co-radio-group" id="co-ndis-funding-type">
        <label class="co-radio-option">
          <input type="radio" name="ndis_funding_type" value="plan_managed" required>
          <span>
            <span class="co-radio-label">NDIS – Plan Managed</span>
            <span class="co-radio-desc">Invoice sent to Plan Manager</span>
          </span>
        </label>
        <label class="co-radio-option">
          <input type="radio" name="ndis_funding_type" value="self_managed">
          <span>
            <span class="co-radio-label">NDIS – Self Managed</span>
            <span class="co-radio-desc">Participant pays at checkout</span>
          </span>
        </label>
        <label class="co-radio-option">
          <input type="radio" name="ndis_funding_type" value="private">
          <span>
            <span class="co-radio-label">Private / Self Funded</span>
            <span class="co-radio-desc">Payment at checkout</span>
          </span>
        </label>
      </div>
      <p style="font-size:12px;color:#888;margin-top:8px;font-family:'Poppins',sans-serif;">We will guide you through the correct process for your selected funding type. All orders must be paid in full prior to dispatch, delivery or installation.</p>
    </div>

    <!-- SECTION 2: PERSON COMPLETING FORM -->
    <div class="co-section-heading">Section 2 — Your Details</div>
    <p style="font-size:12px;color:#696969;margin-bottom:12px;font-family:'Poppins',sans-serif;">So we know who to contact if anything requires clarification.</p>
    <div class="co-field">
      <label>I am: *</label>
      <div class="co-radio-group">
        <label class="co-radio-option">
          <input type="radio" name="ndis_submitter_role" value="participant" required>
          <span class="co-radio-label">The NDIS Participant</span>
        </label>
        <label class="co-radio-option">
          <input type="radio" name="ndis_submitter_role" value="support_coordinator">
          <span class="co-radio-label">Support Coordinator</span>
        </label>
        <label class="co-radio-option">
          <input type="radio" name="ndis_submitter_role" value="plan_nominee">
          <span class="co-radio-label">Plan Nominee / Guardian</span>
        </label>
        <label class="co-radio-option">
          <input type="radio" name="ndis_submitter_role" value="other_rep">
          <span class="co-radio-label">Other authorised representative</span>
        </label>
      </div>
    </div>
    <div class="co-row">
      <div class="co-field">
        <label>Full Name *</label>
        <input type="text" name="submitter_full_name" required placeholder="Your full name">
      </div>
    </div>
    <div class="co-field">
      <label>Organisation <span class="co-optional">(if applicable)</span></label>
      <input type="text" name="submitter_organisation" placeholder="Organisation name">
    </div>
    <div class="co-row">
      <div class="co-field">
        <label>Email Address *</label>
        <input type="email" name="submitter_email" required placeholder="you@example.com">
      </div>
      <div class="co-field">
        <label>Phone Number *</label>
        <input type="tel" name="submitter_phone" required placeholder="04XX XXX XXX">
      </div>
    </div>
    <p style="font-size:12px;color:#888;margin-bottom:4px;font-family:'Poppins',sans-serif;">Order confirmations will be sent to the email provided above.</p>

    <!-- SECTION 3: PARTICIPANT DETAILS -->
    <div class="co-section-heading">Section 3 — Participant Details</div>
    <p style="font-size:12px;color:#696969;margin-bottom:12px;font-family:'Poppins',sans-serif;">These details ensure the invoice, funding and delivery are processed accurately and without delay.</p>
    <div class="co-field">
      <label>Participant Full Name * <span class="co-optional">(as it appears on the NDIS plan)</span></label>
      <input type="text" name="participant_full_name" required placeholder="Participant full name">
    </div>
    <div class="co-field" id="co-ndis-number-field">
      <label>NDIS Number <span class="co-optional">(if applicable)</span></label>
      <input type="text" name="ndis_number" placeholder="43XXXXXXXX" maxlength="9">
    </div>
    <div class="co-field">
      <label>Date of Birth <span class="co-optional">(optional – assists with accurate participant matching)</span></label>
      <input type="date" name="participant_dob">
    </div>
    <div class="co-field">
      <label>Participant Email Address <span class="co-optional">(optional)</span></label>
      <input type="email" name="participant_email" placeholder="participant@example.com">
    </div>
    <div class="co-field">
      <label>Delivery Address *</label>
      <input type="text" name="address_line1" required placeholder="Street address">
    </div>
    <div class="co-row">
      <div class="co-field">
        <label>Suburb *</label>
        <input type="text" name="suburb" required placeholder="Suburb">
      </div>
      <div class="co-field" style="max-width:100px">
        <label>State *</label>
        <select name="state" required>
          <option value="">—</option>
          <option>NSW</option><option>VIC</option><option>QLD</option>
          <option>WA</option><option>SA</option><option>TAS</option>
          <option>ACT</option><option>NT</option>
        </select>
      </div>
      <div class="co-field" style="max-width:110px">
        <label>Postcode *</label>
        <input type="text" name="postcode" required placeholder="3000" maxlength="4">
      </div>
    </div>
    <div class="co-field">
      <label>Contact Phone for Delivery *</label>
      <input type="tel" name="delivery_phone" required placeholder="04XX XXX XXX">
    </div>

    <!-- SECTION 4: PLAN MANAGER DETAILS (conditional – plan managed only) -->
    <div class="co-conditional" id="co-ndis-plan-manager-section">
      <div class="co-section-heading">Section 4 — Plan Manager Details</div>
      <p style="font-size:12px;color:#696969;margin-bottom:12px;font-family:'Poppins',sans-serif;">We will send a formal invoice directly to your nominated Plan Manager.</p>
      <div class="co-field">
        <label>Plan Manager Company Name *</label>
        <input type="text" name="plan_manager_company" placeholder="Company name">
      </div>
      <div class="co-field">
        <label>Accounts Email Address *</label>
        <input type="email" name="plan_manager_email" placeholder="accounts@planmanager.com.au">
      </div>
      <div class="co-row">
        <div class="co-field">
          <label>Phone Number <span class="co-optional">(optional)</span></label>
          <input type="tel" name="plan_manager_phone" placeholder="03 XXXX XXXX">
        </div>
        <div class="co-field">
          <label>Reference / Budget Category <span class="co-optional">(optional)</span></label>
          <input type="text" name="plan_manager_reference" placeholder="e.g. Daily Activities">
        </div>
      </div>
      <p style="font-size:12px;color:#888;margin-bottom:4px;font-family:'Poppins',sans-serif;">Orders are processed once payment has been received from the Plan Manager.</p>
    </div>

    <!-- SECTION 5: PAYMENT & DISPATCH POLICY -->
    <div class="co-section-heading">Section 5 — Payment & Dispatch Policy</div>
    <div class="co-info-box">
      <strong>How Payment & Processing Works</strong><br>
      To protect participant funding and ensure compliance with NDIS requirements:<br>
      <strong>Plan Managed</strong> – An invoice will be sent to the Plan Manager.<br>
      <strong>Self Managed</strong> – Payment is required at checkout.<br>
      <strong>Private</strong> – Payment is required at checkout.<br><br>
      Orders are processed once payment has been received and confirmed. No goods or services will be dispatched, delivered or installed until payment has cleared.
    </div>
    <div class="co-checkbox-group">
      <label class="co-checkbox-option">
        <input type="checkbox" name="ndis_payment_acknowledged" required>
        <span class="co-checkbox-label">I understand and agree that this order will only be processed once payment has been received in full. *</span>
      </label>
    </div>

    <!-- SECTION 6: FUNDING CONFIRMATION (conditional – NDIS funding only, not private) -->
    <div class="co-conditional" id="co-ndis-funding-confirmation">
      <div class="co-section-heading">Section 6 — Funding Confirmation</div>
      <p style="font-size:12px;color:#696969;margin-bottom:12px;font-family:'Poppins',sans-serif;">This helps ensure the order aligns with NDIS requirements.</p>
      <div class="co-checkbox-group">
        <label class="co-checkbox-option">
          <input type="checkbox" name="ndis_funding_available">
          <span class="co-checkbox-label">I confirm funding is available within the participant's NDIS plan. *</span>
        </label>
        <label class="co-checkbox-option">
          <input type="checkbox" name="ndis_reasonable_necessary">
          <span class="co-checkbox-label">I confirm the requested supports are reasonable and necessary. *</span>
        </label>
      </div>
    </div>

    <!-- SECTION 7: RETURNS & HYGIENE POLICY -->
    <div class="co-section-heading">Section 7 — Returns & Hygiene Policy</div>
    <div class="co-info-box">
      For health and safety reasons, hygiene and personal-use items cannot be returned unless deemed faulty in accordance with Australian Consumer Law. All sales are subject to Aged Care & Medical's Terms & Conditions.
    </div>
    <div class="co-checkbox-group">
      <label class="co-checkbox-option">
        <input type="checkbox" name="ndis_returns_acknowledged" required>
        <span class="co-checkbox-label">I understand and accept the returns and hygiene policy. *</span>
      </label>
    </div>

    <!-- SECTION 8: DECLARATION -->
    <div class="co-section-heading">Section 8 — Declaration & Authority</div>
    <p style="font-size:12px;color:#696969;margin-bottom:12px;font-family:'Poppins',sans-serif;">By submitting this order request:</p>
    <div class="co-checkbox-group">
      <label class="co-checkbox-option">
        <input type="checkbox" name="ndis_authorised" required>
        <span class="co-checkbox-label">I confirm I am authorised to place this order on behalf of the participant (where applicable). *</span>
      </label>
      <label class="co-checkbox-option">
        <input type="checkbox" name="ndis_participant_approved" required>
        <span class="co-checkbox-label">I confirm the participant has approved this purchase. *</span>
      </label>
      <label class="co-checkbox-option">
        <input type="checkbox" name="ndis_tcs_acknowledged" required>
        <span class="co-checkbox-label">I acknowledge that Aged Care & Medical's Terms & Conditions of Sale apply. *</span>
      </label>
      <label class="co-checkbox-option">
        <input type="checkbox" name="ndis_info_accurate" required>
        <span class="co-checkbox-label">I confirm the information provided is accurate and complete. *</span>
      </label>
    </div>

    <!-- OPTIONAL: Service area -->
    <div class="co-section-heading" style="margin-top:22px;">Optional</div>
    <div class="co-checkbox-group">
      <label class="co-checkbox-option">
        <input type="checkbox" name="ndis_melbourne_metro">
        <span class="co-checkbox-label">I confirm the service/delivery location is within the Melbourne Metro area (where applicable).</span>
      </label>
    </div>
    <div class="co-field" style="margin-top:14px;">
      <label>Additional Notes <span class="co-optional">(optional)</span></label>
      <textarea name="notes" placeholder="Any additional requirements, supporting document references or notes…"></textarea>
    </div>
  `;

  // ─── GOVERNMENT / AGED CARE FORM ─────────────────────────────────────────────
  const AGED_CARE_FIELDS = `
    <!-- SECTION 1: FUNDING PROGRAM -->
    <div class="co-section-heading">Section 1 — Funding Program</div>
    <div class="co-field">
      <label>How will this order be funded? *</label>
      <div class="co-radio-group" id="co-ac-funding-type">
        <label class="co-radio-option">
          <input type="radio" name="ac_funding_type" value="support_at_home" required>
          <span>
            <span class="co-radio-label">Support at Home</span>
            <span class="co-radio-desc">Participant Managed</span>
          </span>
        </label>
        <label class="co-radio-option">
          <input type="radio" name="ac_funding_type" value="home_care_package">
          <span>
            <span class="co-radio-label">Home Care Package</span>
            <span class="co-radio-desc">Via Provider</span>
          </span>
        </label>
        <label class="co-radio-option">
          <input type="radio" name="ac_funding_type" value="aged_care_provider">
          <span>
            <span class="co-radio-label">Aged Care Service Provider</span>
            <span class="co-radio-desc">Organisation purchase</span>
          </span>
        </label>
        <label class="co-radio-option">
          <input type="radio" name="ac_funding_type" value="dva_allianz">
          <span>
            <span class="co-radio-label">DVA – Allianz</span>
          </span>
        </label>
        <label class="co-radio-option">
          <input type="radio" name="ac_funding_type" value="swep">
          <span>
            <span class="co-radio-label">SWEP</span>
          </span>
        </label>
        <label class="co-radio-option">
          <input type="radio" name="ac_funding_type" value="other_state_program">
          <span>
            <span class="co-radio-label">Other State-Based Program</span>
          </span>
        </label>
        <label class="co-radio-option">
          <input type="radio" name="ac_funding_type" value="private">
          <span>
            <span class="co-radio-label">Private / Self Funded</span>
          </span>
        </label>
      </div>
      <p style="font-size:12px;color:#888;margin-top:8px;font-family:'Poppins',sans-serif;">Selecting the correct funding type ensures invoices and documentation are issued correctly.</p>
    </div>

    <!-- SECTION 2: PERSON COMPLETING FORM -->
    <div class="co-section-heading">Section 2 — Your Details</div>
    <p style="font-size:12px;color:#696969;margin-bottom:12px;font-family:'Poppins',sans-serif;">So we know who to contact if anything requires clarification.</p>
    <div class="co-field">
      <label>I am: *</label>
      <div class="co-radio-group">
        <label class="co-radio-option">
          <input type="radio" name="ac_submitter_role" value="participant" required>
          <span class="co-radio-label">The Participant</span>
        </label>
        <label class="co-radio-option">
          <input type="radio" name="ac_submitter_role" value="care_coordinator">
          <span class="co-radio-label">Care Coordinator</span>
        </label>
        <label class="co-radio-option">
          <input type="radio" name="ac_submitter_role" value="case_manager">
          <span class="co-radio-label">Case Manager</span>
        </label>
        <label class="co-radio-option">
          <input type="radio" name="ac_submitter_role" value="provider_rep">
          <span class="co-radio-label">Provider Representative</span>
        </label>
        <label class="co-radio-option">
          <input type="radio" name="ac_submitter_role" value="authorised_rep">
          <span class="co-radio-label">Authorised Representative</span>
        </label>
      </div>
    </div>
    <div class="co-field">
      <label>Full Name *</label>
      <input type="text" name="submitter_full_name" required placeholder="Your full name">
    </div>
    <div class="co-field">
      <label>Organisation <span class="co-optional">(if applicable)</span></label>
      <input type="text" name="submitter_organisation" placeholder="Organisation name">
    </div>
    <div class="co-row">
      <div class="co-field">
        <label>Email Address *</label>
        <input type="email" name="submitter_email" required placeholder="you@example.com">
      </div>
      <div class="co-field">
        <label>Phone Number *</label>
        <input type="tel" name="submitter_phone" required placeholder="04XX XXX XXX">
      </div>
    </div>
    <p style="font-size:12px;color:#888;margin-bottom:4px;font-family:'Poppins',sans-serif;">Order confirmations will be sent to the email provided above.</p>

    <!-- SECTION 3: PARTICIPANT / CLIENT DETAILS -->
    <div class="co-section-heading">Section 3 — Participant / Client Details</div>
    <p style="font-size:12px;color:#696969;margin-bottom:12px;font-family:'Poppins',sans-serif;">These details ensure accurate invoicing, funding compliance and delivery.</p>
    <div class="co-field">
      <label>Participant / Client Full Name *</label>
      <input type="text" name="participant_full_name" required placeholder="Client full name">
    </div>
    <div class="co-row">
      <div class="co-field">
        <label>Date of Birth <span class="co-optional">(if required by funding body)</span></label>
        <input type="date" name="participant_dob">
      </div>
      <div class="co-field">
        <label>Client ID / Reference Number <span class="co-optional">(if applicable)</span></label>
        <input type="text" name="client_reference" placeholder="Client ID">
      </div>
    </div>
    <div class="co-field">
      <label>Delivery Address *</label>
      <input type="text" name="address_line1" required placeholder="Street address">
    </div>
    <div class="co-row">
      <div class="co-field">
        <label>Suburb *</label>
        <input type="text" name="suburb" required placeholder="Suburb">
      </div>
      <div class="co-field" style="max-width:100px">
        <label>State *</label>
        <select name="state" required>
          <option value="">—</option>
          <option>NSW</option><option>VIC</option><option>QLD</option>
          <option>WA</option><option>SA</option><option>TAS</option>
          <option>ACT</option><option>NT</option>
        </select>
      </div>
      <div class="co-field" style="max-width:110px">
        <label>Postcode *</label>
        <input type="text" name="postcode" required placeholder="3000" maxlength="4">
      </div>
    </div>
    <div class="co-field">
      <label>Contact Phone for Delivery *</label>
      <input type="tel" name="delivery_phone" required placeholder="04XX XXX XXX">
    </div>
    <div class="co-field">
      <label>Participant Email <span class="co-optional">(optional)</span></label>
      <input type="email" name="participant_email" placeholder="participant@example.com">
    </div>

    <!-- SECTION 4: PROVIDER / FUNDING BODY DETAILS (conditional) -->

    <!-- Home Care Package -->
    <div class="co-conditional" id="co-ac-hcp-section">
      <div class="co-section-heading">Section 4 — Provider Details (Home Care Package)</div>
      <p style="font-size:12px;color:#696969;margin-bottom:12px;font-family:'Poppins',sans-serif;">Invoices will be issued directly to the provider organisation.</p>
      <div class="co-field">
        <label>Provider Organisation Name *</label>
        <input type="text" name="hcp_provider_name" placeholder="Provider name">
      </div>
      <div class="co-row">
        <div class="co-field">
          <label>Accounts Email *</label>
          <input type="email" name="hcp_accounts_email" placeholder="accounts@provider.com.au">
        </div>
        <div class="co-field">
          <label>Phone <span class="co-optional">(optional)</span></label>
          <input type="tel" name="hcp_phone" placeholder="03 XXXX XXXX">
        </div>
      </div>
      <div class="co-field">
        <label>Purchase Order Number <span class="co-optional">(if required)</span></label>
        <input type="text" name="hcp_po_number" placeholder="PO number">
      </div>
    </div>

    <!-- DVA – Allianz -->
    <div class="co-conditional" id="co-ac-dva-section">
      <div class="co-section-heading">Section 4 — DVA / Allianz Details</div>
      <div class="co-field">
        <label>DVA File Number *</label>
        <input type="text" name="dva_file_number" placeholder="DVA file number">
      </div>
      <div class="co-field">
        <label>Prescriber Details <span class="co-optional">(if required)</span></label>
        <input type="text" name="dva_prescriber" placeholder="Prescriber name and provider number">
      </div>
      <div class="co-field">
        <label>Authorisation Number <span class="co-optional">(if available)</span></label>
        <input type="text" name="dva_auth_number" placeholder="Authorisation number">
      </div>
    </div>

    <!-- SWEP -->
    <div class="co-conditional" id="co-ac-swep-section">
      <div class="co-section-heading">Section 4 — SWEP Details</div>
      <div class="co-field">
        <label>SWEP Application / Approval Reference *</label>
        <input type="text" name="swep_reference" placeholder="SWEP reference number">
      </div>
      <div class="co-row">
        <div class="co-field">
          <label>Prescriber Name *</label>
          <input type="text" name="swep_prescriber" placeholder="Prescriber name">
        </div>
        <div class="co-field">
          <label>SWEP Region <span class="co-optional">(if relevant)</span></label>
          <input type="text" name="swep_region" placeholder="Region">
        </div>
      </div>
    </div>

    <!-- Other State-Based Program -->
    <div class="co-conditional" id="co-ac-other-section">
      <div class="co-section-heading">Section 4 — Other State-Based Program Details</div>
      <div class="co-field">
        <label>Program Name *</label>
        <input type="text" name="other_program_name" placeholder="Program name">
      </div>
      <div class="co-field">
        <label>Approval Reference *</label>
        <input type="text" name="other_approval_ref" placeholder="Approval reference">
      </div>
      <div class="co-field">
        <label>Authorising Body Contact Email <span class="co-optional">(optional)</span></label>
        <input type="email" name="other_auth_email" placeholder="authority@body.gov.au">
      </div>
    </div>

    <!-- SECTION 5: PAYMENT & PROCESS -->
    <div class="co-section-heading">Section 5 — Payment & Processing</div>
    <div class="co-info-box">
      <strong>How Payment & Processing Works</strong><br>
      Orders funded through providers or government programs are processed once approval and payment confirmation are received (where applicable).<br>
      Private or participant-managed orders require payment prior to dispatch.<br><br>
      No goods or services will be dispatched, delivered or installed until payment or funding approval has been confirmed.
    </div>
    <div class="co-checkbox-group">
      <label class="co-checkbox-option">
        <input type="checkbox" name="ac_payment_acknowledged" required>
        <span class="co-checkbox-label">I understand and agree that this order will only be processed once payment or funding approval has been confirmed. *</span>
      </label>
    </div>

    <!-- SECTION 6: FUNDING CONFIRMATION (conditional – provider/govt funded) -->
    <div class="co-conditional" id="co-ac-funding-confirmation">
      <div class="co-section-heading">Section 6 — Funding Confirmation</div>
      <div class="co-checkbox-group">
        <label class="co-checkbox-option">
          <input type="checkbox" name="ac_funding_obtained">
          <span class="co-checkbox-label">I confirm funding or program approval has been obtained for this purchase. *</span>
        </label>
        <label class="co-checkbox-option">
          <input type="checkbox" name="ac_authorised_request">
          <span class="co-checkbox-label">I confirm I am authorised to request this purchase under the nominated funding program. *</span>
        </label>
      </div>
    </div>

    <!-- SECTION 7: RETURNS POLICY -->
    <div class="co-section-heading">Section 7 — Returns Policy</div>
    <div class="co-info-box">
      For health and safety reasons, hygiene and personal-use items cannot be returned unless faulty in accordance with Australian Consumer Law. All sales are subject to Aged Care & Medical's Terms & Conditions.
    </div>
    <div class="co-checkbox-group">
      <label class="co-checkbox-option">
        <input type="checkbox" name="ac_returns_acknowledged" required>
        <span class="co-checkbox-label">I understand and accept the returns policy. *</span>
      </label>
    </div>

    <!-- SECTION 8: DECLARATION -->
    <div class="co-section-heading">Section 8 — Declaration & Authority</div>
    <p style="font-size:12px;color:#696969;margin-bottom:12px;font-family:'Poppins',sans-serif;">By submitting this request:</p>
    <div class="co-checkbox-group">
      <label class="co-checkbox-option">
        <input type="checkbox" name="ac_authorised" required>
        <span class="co-checkbox-label">I confirm I am authorised to place this order. *</span>
      </label>
      <label class="co-checkbox-option">
        <input type="checkbox" name="ac_participant_approved" required>
        <span class="co-checkbox-label">I confirm the participant/client has approved this purchase (where applicable). *</span>
      </label>
      <label class="co-checkbox-option">
        <input type="checkbox" name="ac_info_accurate" required>
        <span class="co-checkbox-label">I confirm the information provided is accurate and complete. *</span>
      </label>
      <label class="co-checkbox-option">
        <input type="checkbox" name="ac_tcs_acknowledged" required>
        <span class="co-checkbox-label">I acknowledge that Aged Care & Medical's Terms & Conditions apply. *</span>
      </label>
    </div>

    <div class="co-field" style="margin-top:14px;">
      <label>Additional Notes <span class="co-optional">(optional)</span></label>
      <textarea name="notes" placeholder="Any additional requirements or notes…"></textarea>
    </div>
  `;

  // ─── HELPERS ─────────────────────────────────────────────────────────────────

  function injectStyles() {
    const el = document.createElement('style');
    el.textContent = styles;
    document.head.appendChild(el);
  }

  function getCartData() {
    return fetch('/cart.js')
      .then(r => {
        if (!r.ok) throw new Error('Cart fetch failed');
        return r.json();
      })
      .catch(() => {
        return { items: [], item_count: 0, total_price: 0 };
      });
  }

  function buildModal() {
    const overlay = document.createElement('div');
    overlay.id = 'co-overlay';
    overlay.innerHTML = `
      <div id="co-modal" role="dialog" aria-modal="true" aria-labelledby="co-title">

        <!-- BRANDED HEADER -->
        <div id="co-modal-header">
          <button id="co-close" aria-label="Close">&times;</button>
          <h2 id="co-title">How would you like to Pay</h2>
          <p class="co-sub">Choose your preferred payment method</p>
        </div>

        <!-- SCROLLABLE BODY -->
        <div id="co-modal-body">

          <!-- OPTIONS PANEL -->
          <div id="co-options-panel">

            <button class="co-btn" id="co-paynow">
              <span class="co-btn-icon">
                <img src="https://cdn.shopify.com/s/files/1/0363/8955/2187/files/Card-payment.png?v=1770793099" class="co-btn-img" alt="Credit Card / PayPal">
              </span>
              <span class="co-btn-label">Credit Card / PayPal</span>
            </button>

            <button class="co-btn" id="co-ndis">
              <span class="co-btn-icon">
                <img src="https://cdn.shopify.com/s/files/1/0363/8955/2187/files/NDIS-form.png?v=1770793099" class="co-btn-img" alt="I Have NDIS">
              </span>
              <span class="co-btn-label">I Have NDIS</span>
            </button>

            <button class="co-btn" id="co-agedcare">
              <span class="co-btn-icon">
                <img src="https://cdn.shopify.com/s/files/1/0363/8955/2187/files/SaH-icon.png?v=1770793100" class="co-btn-img" alt="Aged Care Invoice">
              </span>
              <span class="co-btn-label">Aged Care Invoice</span>
            </button>

          </div>

          <!-- FORM PANEL -->
          <div id="co-form-panel">
            <div class="co-form-title">
              <button class="co-back" id="co-back" aria-label="Back">&#8592;</button>
              <span id="co-form-heading"></span>
            </div>
            <p class="co-form-subtitle" id="co-form-subtitle"></p>
            <form id="co-form" novalidate>
              <div id="co-form-fields"></div>
              <button type="submit" class="co-submit" id="co-submit-btn">Submit Order Request</button>
              <div class="co-error" id="co-form-error">Something went wrong. Please try again.</div>
            </form>
            <div class="co-success-msg" id="co-success" style="display:none">
              <div class="co-tick">✅</div>
              <h3>Request submitted!</h3>
              <p>Our team will review your request and send confirmation shortly.<br>If you need assistance, please contact us — we're here to help.</p>
            </div>
          </div>

        </div><!-- /co-modal-body -->
      </div>
    `;
    document.body.appendChild(overlay);
    return overlay;
  }

  // ─── CONDITIONAL LOGIC: NDIS ──────────────────────────────────────────────────
  function bindNdisConditionals(formFields) {
    const fundingRadios      = formFields.querySelectorAll('[name="ndis_funding_type"]');
    const planManagerSection = formFields.querySelector('#co-ndis-plan-manager-section');
    const ndisNumberField    = formFields.querySelector('#co-ndis-number-field');
    const fundingConfirmation = formFields.querySelector('#co-ndis-funding-confirmation');

    if (planManagerSection)    planManagerSection.classList.remove('visible');
    if (fundingConfirmation)   fundingConfirmation.classList.remove('visible');

    if (fundingConfirmation) {
      fundingConfirmation.querySelectorAll('input[type="checkbox"]').forEach(el => {
        el.required = false;
      });
    }
    if (planManagerSection) {
      planManagerSection.querySelector('[name="plan_manager_company"]') &&
        (planManagerSection.querySelector('[name="plan_manager_company"]').required = false);
      planManagerSection.querySelector('[name="plan_manager_email"]') &&
        (planManagerSection.querySelector('[name="plan_manager_email"]').required = false);
    }

    function update() {
      const selected = formFields.querySelector('[name="ndis_funding_type"]:checked');
      const val = selected ? selected.value : '';
      const isNdis        = val === 'plan_managed' || val === 'self_managed';
      const isPlanManaged = val === 'plan_managed';

      fundingRadios.forEach(r => {
        r.closest('.co-radio-option').style.borderColor = '';
      });

      if (planManagerSection) {
        planManagerSection.classList.toggle('visible', isPlanManaged);
        const pmCompany = planManagerSection.querySelector('[name="plan_manager_company"]');
        const pmEmail   = planManagerSection.querySelector('[name="plan_manager_email"]');
        if (pmCompany) pmCompany.required = isPlanManaged;
        if (pmEmail)   pmEmail.required   = isPlanManaged;
      }

      const ndisInput = ndisNumberField ? ndisNumberField.querySelector('input') : null;
      if (ndisInput) {
        ndisInput.required = isNdis;
        const labelEl = ndisNumberField.querySelector('label');
        if (labelEl) {
          labelEl.innerHTML = isNdis
            ? 'NDIS Number *'
            : 'NDIS Number <span class="co-optional">(if applicable)</span>';
        }
      }

      if (fundingConfirmation) {
        fundingConfirmation.classList.toggle('visible', isNdis);
        fundingConfirmation.querySelectorAll('input[type="checkbox"]').forEach(el => {
          el.required = isNdis;
        });
      }
    }

    fundingRadios.forEach(r => r.addEventListener('change', update));
  }

  // ─── CONDITIONAL LOGIC: AGED CARE ────────────────────────────────────────────
  function bindAgedCareConditionals(formFields) {
    const fundingRadios = formFields.querySelectorAll('[name="ac_funding_type"]');
    const hcpSection    = formFields.querySelector('#co-ac-hcp-section');
    const dvaSection    = formFields.querySelector('#co-ac-dva-section');
    const swepSection   = formFields.querySelector('#co-ac-swep-section');
    const otherSection  = formFields.querySelector('#co-ac-other-section');
    const fundingConf   = formFields.querySelector('#co-ac-funding-confirmation');

    [hcpSection, dvaSection, swepSection, otherSection].forEach(el => {
      if (el) {
        el.classList.remove('visible');
        el.querySelectorAll('input, select, textarea').forEach(i => { i.required = false; });
      }
    });
    if (fundingConf) {
      fundingConf.classList.remove('visible');
      fundingConf.querySelectorAll('input[type="checkbox"]').forEach(el => {
        el.required = false;
      });
    }

    const conditionalSections = [
      { el: hcpSection,   val: 'home_care_package',  requiredNames: ['hcp_provider_name', 'hcp_accounts_email'] },
      { el: dvaSection,   val: 'dva_allianz',         requiredNames: ['dva_file_number'] },
      { el: swepSection,  val: 'swep',                requiredNames: ['swep_reference', 'swep_prescriber'] },
      { el: otherSection, val: 'other_state_program', requiredNames: ['other_program_name', 'other_approval_ref'] },
    ];

    function update() {
      const selected = formFields.querySelector('[name="ac_funding_type"]:checked');
      const val = selected ? selected.value : '';
      const isPrivate = val === 'private' || val === 'support_at_home';

      fundingRadios.forEach(r => {
        r.closest('.co-radio-option').style.borderColor = '';
      });

      conditionalSections.forEach(({ el, val: sectionVal, requiredNames }) => {
        if (!el) return;
        const show = val === sectionVal;
        el.classList.toggle('visible', show);
        el.querySelectorAll('input, select, textarea').forEach(i => { i.required = false; });
        if (show) {
          requiredNames.forEach(name => {
            const input = el.querySelector(`[name="${name}"]`);
            if (input) input.required = true;
          });
        }
      });

      if (fundingConf) {
        const showConf = !isPrivate && val !== '';
        fundingConf.classList.toggle('visible', showConf);
        fundingConf.querySelectorAll('input[type="checkbox"]').forEach(el => {
          el.required = showConf;
        });
      }
    }

    fundingRadios.forEach(r => r.addEventListener('change', update));
  }

  // ─── VALIDATION ───────────────────────────────────────────────────────────────
  function validateForm(form) {
    const inputs = form.querySelectorAll('[required]');
    let valid = true;

    inputs.forEach(input => {
      input.style.borderColor = '';

      const inHiddenConditional = input.closest('.co-conditional:not(.visible)');
      if (inHiddenConditional) return;

      if (input.type === 'checkbox' && !input.checked) {
        input.closest('.co-checkbox-option').style.borderColor = '#C0392B';
        valid = false;
      } else if (input.type !== 'checkbox' && !input.value.trim()) {
        input.style.borderColor = '#C0392B';
        valid = false;
      }
    });

    const radioGroups = {};
    form.querySelectorAll('input[type="radio"][required]').forEach(r => {
      if (r.closest('.co-conditional:not(.visible)')) return;
      if (!radioGroups[r.name]) {
        radioGroups[r.name] = Array.from(
          form.querySelectorAll(`input[type="radio"][name="${r.name}"]`)
        ).filter(rr => !rr.closest('.co-conditional:not(.visible)'));
      }
    });
    Object.entries(radioGroups).forEach(([name, radios]) => {
      const anyChecked = radios.some(r => r.checked);
      if (!anyChecked) {
        radios.forEach(r => {
          r.closest('.co-radio-option').style.borderColor = '#C0392B';
        });
        valid = false;
      }
    });

    return valid;
  }

  function formDataToObject(form) {
    const fd = new FormData(form);
    const obj = {};
    fd.forEach((val, key) => { obj[key] = val; });
    form.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      if (!(cb.name in obj)) obj[cb.name] = false;
      else obj[cb.name] = true;
    });
    return obj;
  }

  async function submitForm(formType, formData, cartData) {
    const payload = { formType, formData, cart: cartData };
    const res = await fetch(`${BACKEND_URL}/api/submit-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Server error');
    return res.json();
  }

  // ─── INIT ─────────────────────────────────────────────────────────────────────
  function init() {
    injectStyles();
    const overlay = buildModal();

    let currentFormType = null;
    let cartData = null;

    const optionsPanel = overlay.querySelector('#co-options-panel');
    const formPanel    = overlay.querySelector('#co-form-panel');
    const formFields   = overlay.querySelector('#co-form-fields');
    const formHeading  = overlay.querySelector('#co-form-heading');
    const formSubtitle = overlay.querySelector('#co-form-subtitle');
    const form         = overlay.querySelector('#co-form');
    const submitBtn    = overlay.querySelector('#co-submit-btn');
    const errorDiv     = overlay.querySelector('#co-form-error');
    const successDiv   = overlay.querySelector('#co-success');
    const modalHeader  = overlay.querySelector('#co-modal-header');
    const modalTitle   = overlay.querySelector('#co-title');
    const modalSub     = overlay.querySelector('.co-sub');

    function openModal() {
      // Reset header to default options state
      modalTitle.textContent = 'How would you like to Pay';
      modalSub.textContent = 'Choose your preferred payment method';

      overlay.classList.add('active');
      optionsPanel.classList.remove('hidden');
      formPanel.classList.remove('active');
      form.style.display = '';
      successDiv.style.display = 'none';
      errorDiv.style.display = 'none';
    }

    function closeModal() {
      overlay.classList.remove('active');
    }

    function showForm(type) {
      currentFormType = type;
      optionsPanel.classList.add('hidden');
      formPanel.classList.add('active');

      if (type === 'aged_care') {
        modalTitle.textContent = 'Government & Aged Care Order';
        modalSub.textContent = 'Support at Home, HCP, DVA, SWEP and state-based programs.';
        formHeading.textContent = 'Complete your order request below';
        formSubtitle.textContent = 'We specialise in supporting funded participants, care coordinators and providers.';
        formFields.innerHTML = AGED_CARE_FIELDS;
        bindAgedCareConditionals(formFields);
      } else {
        modalTitle.textContent = 'NDIS Order Request';
        modalSub.textContent = 'Plan Managed, Self Managed — we\'ll handle invoicing for your plan.';
        formHeading.textContent = 'Complete your order request below';
        formSubtitle.textContent = 'We specialise in supporting NDIS participants, Support Coordinators and Plan Managers.';
        formFields.innerHTML = NDIS_FIELDS;
        bindNdisConditionals(formFields);
      }
    }

    // Intercept checkout buttons
    document.addEventListener('click', function (e) {
      const btn = e.target.closest('[name="checkout"], .cart__checkout-button, [href="/checkout"]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      getCartData().then(cart => {
        cartData = cart;
        openModal();
      });
    }, true);

    overlay.querySelector('#co-close').addEventListener('click', closeModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

    overlay.querySelector('#co-paynow').addEventListener('click', () => {
      closeModal();
      window.location.href = '/checkout';
    });

    overlay.querySelector('#co-agedcare').addEventListener('click', () => showForm('aged_care'));
    overlay.querySelector('#co-ndis').addEventListener('click', () => showForm('ndis'));
    overlay.querySelector('#co-back').addEventListener('click', () => {
      modalTitle.textContent = 'How would you like to Pay';
      modalSub.textContent = 'Choose your preferred payment method';
      optionsPanel.classList.remove('hidden');
      formPanel.classList.remove('active');
    });

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      errorDiv.style.display = 'none';
      if (!validateForm(form)) {
        errorDiv.textContent = 'Please fill in all required fields marked with *.';
        errorDiv.style.display = 'block';
        return;
      }
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting…';
      try {
        const data = formDataToObject(form);
        await submitForm(currentFormType, data, cartData);
        form.style.display = 'none';
        successDiv.style.display = 'block';
        await fetch('/cart/clear.js', { method: 'POST' });
      } catch (err) {
        errorDiv.textContent = 'Something went wrong. Please try again or contact us directly.';
        errorDiv.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Order Request';
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();