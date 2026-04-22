/**
 * Checkout Modal - Theme Extension
 * Intercepts the cart checkout button and shows a 3-option modal.
 * Install: paste into Dawn theme > Assets > checkout-modal.js
 * Then add {% render 'checkout-modal' %} to theme.liquid before </body>
 *
 * Forms updated to match:
 *  - NDIS Order Request Form (Plan Managed / Self Managed / Private)
 *  - Government & Aged Care Funded Order Request Form
 */

(function () {
  'use strict';

  // ─── CONFIG ──────────────────────────────────────────────────────────────────
  const BACKEND_URL = 'https://custom-invoice-app-d2eeaufpc5a4h6ag.australiaeast-01.azurewebsites.net';
  // ─────────────────────────────────────────────────────────────────────────────

  const styles = `
    #co-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.55);
      z-index: 99999;
      align-items: center;
      justify-content: center;
      font-family: var(--font-body-family, sans-serif);
    }
    #co-overlay.active { display: flex; }
    #co-modal {
      background: #fff;
      border-radius: 16px;
      padding: 36px 32px 28px;
      max-width: 560px;
      width: 95%;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 24px 64px rgba(0,0,0,0.18);
      position: relative;
    }
    #co-modal h2 {
      font-size: 20px;
      font-weight: 600;
      margin: 0 0 6px;
      color: #111;
    }
    #co-modal p.co-sub {
      font-size: 14px;
      color: #666;
      margin: 0 0 24px;
    }
    .co-btn {
      display: flex;
      align-items: center;
      gap: 14px;
      width: 100%;
      padding: 16px 20px;
      border-radius: 10px;
      border: 1.5px solid #e5e5e5;
      background: #fafafa;
      cursor: pointer;
      margin-bottom: 12px;
      text-align: left;
      transition: border-color 0.15s, background 0.15s;
    }
    .co-btn:hover { border-color: #1a1a1a; background: #f0f0f0; }
    .co-btn:last-child { margin-bottom: 0; }
    .co-btn-icon {
      width: 40px; height: 40px;
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      font-size: 20px;
      flex-shrink: 0;
    }
    .co-btn-icon.green  { background: #e6f4ea; }
    .co-btn-icon.blue   { background: #e8f0fe; }
    .co-btn-icon.purple { background: #f3e8fd; }
    .co-btn-label { font-size: 15px; font-weight: 600; color: #111; display: block; }
    .co-btn-desc  { font-size: 12px; color: #777; display: block; margin-top: 2px; }
    #co-close {
      position: absolute; top: 16px; right: 18px;
      background: none; border: none; font-size: 22px;
      cursor: pointer; color: #999; line-height: 1;
    }

    /* ── FORM PANEL ── */
    #co-form-panel { display: none; }
    #co-form-panel.active { display: block; }
    #co-options-panel.hidden { display: none; }

    .co-form-title {
      font-size: 17px; font-weight: 600; color: #111;
      margin: 0 0 4px; display: flex; align-items: center; gap: 10px;
    }
    .co-form-subtitle {
      font-size: 13px; color: #666;
      margin: 0 0 20px; padding-left: 30px;
    }
    .co-back {
      background: none; border: none; cursor: pointer;
      font-size: 20px; color: #555; padding: 0; line-height: 1;
    }

    /* Section headings inside form */
    .co-section-heading {
      font-size: 11px; font-weight: 700; text-transform: uppercase;
      letter-spacing: .8px; color: #888;
      margin: 22px 0 12px;
      padding-bottom: 6px;
      border-bottom: 1px solid #eee;
    }
    .co-section-heading:first-child { margin-top: 0; }

    .co-field { margin-bottom: 14px; }
    .co-field label {
      display: block; font-size: 13px; font-weight: 500;
      color: #444; margin-bottom: 5px;
    }
    .co-field label .co-optional {
      font-weight: 400; color: #aaa; font-size: 12px; margin-left: 4px;
    }
    .co-field input, .co-field textarea, .co-field select {
      width: 100%; box-sizing: border-box;
      padding: 10px 13px;
      border: 1.5px solid #ddd;
      border-radius: 8px;
      font-size: 14px; color: #111;
      font-family: inherit;
      transition: border-color 0.15s;
      background: #fff;
    }
    .co-field input:focus, .co-field textarea:focus, .co-field select:focus {
      outline: none; border-color: #1a1a1a;
    }
    .co-field textarea { resize: vertical; min-height: 76px; }
    .co-row { display: flex; gap: 12px; }
    .co-row .co-field { flex: 1; }

    /* Radio groups */
    .co-radio-group { display: flex; flex-direction: column; gap: 8px; }
    .co-radio-option {
      display: flex; align-items: flex-start; gap: 10px;
      padding: 10px 13px;
      border: 1.5px solid #ddd;
      border-radius: 8px;
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s;
    }
    .co-radio-option:has(input:checked) {
      border-color: #1a1a1a; background: #f8f8f8;
    }
    .co-radio-option input[type="radio"] {
      margin-top: 2px; flex-shrink: 0;
      width: auto; padding: 0; border: none;
    }
    .co-radio-label { font-size: 13px; font-weight: 500; color: #111; }
    .co-radio-desc  { font-size: 12px; color: #777; display: block; margin-top: 1px; }

    /* Checkbox */
    .co-checkbox-group { display: flex; flex-direction: column; gap: 8px; }
    .co-checkbox-option {
      display: flex; align-items: flex-start; gap: 10px;
      padding: 10px 13px;
      border: 1.5px solid #ddd;
      border-radius: 8px;
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s;
    }
    .co-checkbox-option:has(input:checked) {
      border-color: #1a1a1a; background: #f8f8f8;
    }
    .co-checkbox-option input[type="checkbox"] {
      margin-top: 2px; flex-shrink: 0;
      width: auto; padding: 0; border: none;
    }
    .co-checkbox-label { font-size: 13px; color: #333; line-height: 1.5; }

    /* Policy/info boxes */
    .co-info-box {
      background: #f8f9fa; border-left: 3px solid #1a1a1a;
      border-radius: 6px; padding: 12px 14px;
      font-size: 12px; color: #555; line-height: 1.6;
      margin-bottom: 14px;
    }
    .co-info-box strong { color: #1a1a1a; }

    /* Conditional sections */
    .co-conditional { display: none; }
    .co-conditional.visible { display: block; }

    .co-submit {
      width: 100%; padding: 14px;
      background: #1a1a1a; color: #fff;
      border: none; border-radius: 10px;
      font-size: 15px; font-weight: 600;
      cursor: pointer; margin-top: 12px;
      transition: background 0.15s;
    }
    .co-submit:hover { background: #333; }
    .co-submit:disabled { background: #999; cursor: not-allowed; }
    .co-error {
      color: #c0392b; font-size: 13px;
      margin-top: 10px; display: none;
    }
    .co-success-msg {
      text-align: center; padding: 20px 0 10px;
    }
    .co-success-msg .co-tick { font-size: 42px; margin-bottom: 10px; }
    .co-success-msg h3 { font-size: 18px; color: #111; margin: 0 0 8px; }
    .co-success-msg p  { font-size: 14px; color: #666; margin: 0; }

    /* Table wrapper */
    .table-wrapper {
      border: 1px solid #e5e5e5;
      border-radius: 6px;
      overflow: hidden;
      margin-bottom: 16px;
    }
  `;

  // ─── NDIS FORM ───────────────────────────────────────────────────────────────
  // Based on the NDIS Order Request Form spec.
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
      <p style="font-size:12px;color:#888;margin-top:8px;">We will guide you through the correct process for your selected funding type. All orders must be paid in full prior to dispatch, delivery or installation.</p>
    </div>

    <!-- SECTION 2: PERSON COMPLETING FORM -->
    <div class="co-section-heading">Section 2 — Your Details</div>
    <p style="font-size:12px;color:#666;margin-bottom:12px;">So we know who to contact if anything requires clarification.</p>
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
    <p style="font-size:12px;color:#888;margin-bottom:4px;">Order confirmations will be sent to the email provided above.</p>

    <!-- SECTION 3: PARTICIPANT DETAILS -->
    <div class="co-section-heading">Section 3 — Participant Details</div>
    <p style="font-size:12px;color:#666;margin-bottom:12px;">These details ensure the invoice, funding and delivery are processed accurately and without delay.</p>
    <div class="co-field">
      <label>Participant Full Name * <span class="co-optional">(as it appears on the NDIS plan)</span></label>
      <input type="text" name="participant_full_name" required placeholder="Participant full name">
    </div>
    <div class="co-field" id="co-ndis-number-field">
      <label>NDIS Number * <span class="co-optional">(required for NDIS-funded orders)</span></label>
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
      <p style="font-size:12px;color:#666;margin-bottom:12px;">We will send a formal invoice directly to your nominated Plan Manager.</p>
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
      <p style="font-size:12px;color:#888;margin-bottom:4px;">Orders are processed once payment has been received from the Plan Manager.</p>
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

    <!-- SECTION 6: FUNDING CONFIRMATION (conditional – NDIS funding) -->
    <div class="co-conditional visible" id="co-ndis-funding-confirmation">
      <div class="co-section-heading">Section 6 — Funding Confirmation</div>
      <p style="font-size:12px;color:#666;margin-bottom:12px;">This helps ensure the order aligns with NDIS requirements.</p>
      <div class="co-checkbox-group">
        <label class="co-checkbox-option">
          <input type="checkbox" name="ndis_funding_available" required>
          <span class="co-checkbox-label">I confirm funding is available within the participant's NDIS plan. *</span>
        </label>
        <label class="co-checkbox-option">
          <input type="checkbox" name="ndis_reasonable_necessary" required>
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
    <p style="font-size:12px;color:#666;margin-bottom:12px;">By submitting this order request:</p>
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
  // Based on the Government & Aged Care Funded Order Request Form spec.
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
      <p style="font-size:12px;color:#888;margin-top:8px;">Selecting the correct funding type ensures invoices and documentation are issued correctly.</p>
    </div>

    <!-- SECTION 2: PERSON COMPLETING FORM -->
    <div class="co-section-heading">Section 2 — Your Details</div>
    <p style="font-size:12px;color:#666;margin-bottom:12px;">So we know who to contact if anything requires clarification.</p>
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
    <p style="font-size:12px;color:#888;margin-bottom:4px;">Order confirmations will be sent to the email provided above.</p>

    <!-- SECTION 3: PARTICIPANT / CLIENT DETAILS -->
    <div class="co-section-heading">Section 3 — Participant / Client Details</div>
    <p style="font-size:12px;color:#666;margin-bottom:12px;">These details ensure accurate invoicing, funding compliance and delivery.</p>
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
      <p style="font-size:12px;color:#666;margin-bottom:12px;">Invoices will be issued directly to the provider organisation.</p>
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
    <div class="co-conditional visible" id="co-ac-funding-confirmation">
      <div class="co-section-heading">Section 6 — Funding Confirmation</div>
      <div class="co-checkbox-group">
        <label class="co-checkbox-option">
          <input type="checkbox" name="ac_funding_obtained" required>
          <span class="co-checkbox-label">I confirm funding or program approval has been obtained for this purchase. *</span>
        </label>
        <label class="co-checkbox-option">
          <input type="checkbox" name="ac_authorised_request" required>
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
    <p style="font-size:12px;color:#666;margin-bottom:12px;">By submitting this request:</p>
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
    return fetch('/cart.js').then(r => r.json());
  }

  function buildModal() {
    const overlay = document.createElement('div');
    overlay.id = 'co-overlay';
    overlay.innerHTML = `
      <div id="co-modal" role="dialog" aria-modal="true" aria-labelledby="co-title">
        <button id="co-close" aria-label="Close">&times;</button>

        <!-- OPTIONS PANEL -->
        <div id="co-options-panel">
          <h2 id="co-title">How would you like to proceed?</h2>
          <p class="co-sub">Choose your payment or billing method below.</p>

          <button class="co-btn" id="co-paynow">
            <span class="co-btn-icon green">💳</span>
            <span>
              <span class="co-btn-label">Pay Now</span>
              <span class="co-btn-desc">Proceed to standard Shopify checkout</span>
            </span>
          </button>

          <button class="co-btn" id="co-agedcare">
            <span class="co-btn-icon blue">🏠</span>
            <span>
              <span class="co-btn-label">Government & Aged Care</span>
              <span class="co-btn-desc">Support at Home, HCP, DVA, SWEP and other funded programs</span>
            </span>
          </button>

          <button class="co-btn" id="co-ndis">
            <span class="co-btn-icon purple">♿</span>
            <span>
              <span class="co-btn-label">NDIS</span>
              <span class="co-btn-desc">Plan Managed, Self Managed — we'll handle invoicing for your plan</span>
            </span>
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
      </div>
    `;
    document.body.appendChild(overlay);
    return overlay;
  }

  // ─── CONDITIONAL LOGIC: NDIS ──────────────────────────────────────────────────
  function bindNdisConditionals(formFields) {
    const fundingRadios = formFields.querySelectorAll('[name="ndis_funding_type"]');
    const planManagerSection = formFields.querySelector('#co-ndis-plan-manager-section');
    const ndisNumberField = formFields.querySelector('#co-ndis-number-field');
    const fundingConfirmation = formFields.querySelector('#co-ndis-funding-confirmation');

    function update() {
      const selected = formFields.querySelector('[name="ndis_funding_type"]:checked');
      const val = selected ? selected.value : '';
      const isNdis = val === 'plan_managed' || val === 'self_managed';
      const isPlanManaged = val === 'plan_managed';

      // Plan manager section – only for plan managed
      planManagerSection.classList.toggle('visible', isPlanManaged);

      // NDIS number required for NDIS-funded orders
      const ndisInput = ndisNumberField ? ndisNumberField.querySelector('input') : null;
      if (ndisInput) {
        ndisInput.required = isNdis;
        const label = ndisNumberField.querySelector('label');
        if (label) {
          label.innerHTML = isNdis
            ? 'NDIS Number *'
            : 'NDIS Number <span class="co-optional">(if applicable)</span>';
        }
      }

      // Plan manager fields required when plan managed
      if (planManagerSection) {
        const pmCompany = planManagerSection.querySelector('[name="plan_manager_company"]');
        const pmEmail   = planManagerSection.querySelector('[name="plan_manager_email"]');
        if (pmCompany) pmCompany.required = isPlanManaged;
        if (pmEmail)   pmEmail.required   = isPlanManaged;
      }

      // Funding confirmation only shown for NDIS types (not private)
      if (fundingConfirmation) {
        fundingConfirmation.classList.toggle('visible', isNdis);
        fundingConfirmation.querySelectorAll('[required]').forEach(el => {
          el.required = isNdis;
        });
      }
    }

    fundingRadios.forEach(r => r.addEventListener('change', update));
    update();
  }

  // ─── CONDITIONAL LOGIC: AGED CARE ────────────────────────────────────────────
  function bindAgedCareConditionals(formFields) {
    const fundingRadios = formFields.querySelectorAll('[name="ac_funding_type"]');
    const hcpSection    = formFields.querySelector('#co-ac-hcp-section');
    const dvaSection    = formFields.querySelector('#co-ac-dva-section');
    const swepSection   = formFields.querySelector('#co-ac-swep-section');
    const otherSection  = formFields.querySelector('#co-ac-other-section');
    const fundingConf   = formFields.querySelector('#co-ac-funding-confirmation');

    const conditionalSections = [
      { el: hcpSection,   val: 'home_care_package',  requiredNames: ['hcp_provider_name','hcp_accounts_email'] },
      { el: dvaSection,   val: 'dva_allianz',         requiredNames: ['dva_file_number'] },
      { el: swepSection,  val: 'swep',                requiredNames: ['swep_reference','swep_prescriber'] },
      { el: otherSection, val: 'other_state_program', requiredNames: ['other_program_name','other_approval_ref'] },
    ];

    function update() {
      const selected = formFields.querySelector('[name="ac_funding_type"]:checked');
      const val = selected ? selected.value : '';
      const isPrivate = val === 'private' || val === 'support_at_home';

      conditionalSections.forEach(({ el, val: sectionVal, requiredNames }) => {
        if (!el) return;
        const show = val === sectionVal;
        el.classList.toggle('visible', show);
        requiredNames.forEach(name => {
          const input = el.querySelector(`[name="${name}"]`);
          if (input) input.required = show;
        });
      });

      // Funding confirmation hidden for private/self-funded
      if (fundingConf) {
        const showConf = !isPrivate && val !== '';
        fundingConf.classList.toggle('visible', showConf);
        fundingConf.querySelectorAll('input[type="checkbox"]').forEach(el => {
          el.required = showConf;
        });
      }
    }

    fundingRadios.forEach(r => r.addEventListener('change', update));
    update();
  }

  // ─── VALIDATION ───────────────────────────────────────────────────────────────
  function validateForm(form) {
    const inputs = form.querySelectorAll('[required]');
    let valid = true;
    inputs.forEach(input => {
      input.style.borderColor = '';
      // Only validate visible inputs (skip inputs inside hidden conditional sections)
      const inHiddenConditional = input.closest('.co-conditional:not(.visible)');
      if (inHiddenConditional) return;
      if (input.type === 'checkbox' && !input.checked) {
        input.closest('.co-checkbox-option').style.borderColor = '#c0392b';
        valid = false;
      } else if (input.type !== 'checkbox' && !input.value.trim()) {
        input.style.borderColor = '#c0392b';
        valid = false;
      }
    });
    // Validate at least one radio selected for required radio groups
    const radioGroups = {};
    form.querySelectorAll('input[type="radio"][required]').forEach(r => {
      radioGroups[r.name] = radioGroups[r.name] || [];
      radioGroups[r.name].push(r);
    });
    Object.entries(radioGroups).forEach(([name, radios]) => {
      const anyChecked = radios.some(r => r.checked);
      if (!anyChecked) {
        radios.forEach(r => {
          r.closest('.co-radio-option').style.borderColor = '#c0392b';
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
    // Capture unchecked checkboxes as false
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

    function openModal() {
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
        formHeading.textContent = '🏠 Government & Aged Care Order Request';
        formSubtitle.textContent = 'We work with Support at Home, HCP, DVA, SWEP and state-based programs.';
        formFields.innerHTML = AGED_CARE_FIELDS;
        bindAgedCareConditionals(formFields);
      } else {
        formHeading.textContent = '♿ NDIS Order Request';
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
        // Clear Shopify cart
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
})()