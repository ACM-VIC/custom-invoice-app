/**
 * Checkout Modal - Theme Extension
 * Intercepts the cart checkout button and shows a 3-option modal.
 * Install: paste into Dawn theme > Assets > checkout-modal.js
 * Then add {% render 'checkout-modal' %} to theme.liquid before </body>
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
      max-width: 480px;
      width: 92%;
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
    #co-form-panel {
      display: none;
    }
    #co-form-panel.active { display: block; }
    #co-options-panel.hidden { display: none; }
    .co-form-title {
      font-size: 17px; font-weight: 600; color: #111;
      margin: 0 0 20px; display: flex; align-items: center; gap: 10px;
    }
    .co-back {
      background: none; border: none; cursor: pointer;
      font-size: 20px; color: #555; padding: 0; line-height: 1;
    }
    .co-field { margin-bottom: 16px; }
    .co-field label {
      display: block; font-size: 13px; font-weight: 500;
      color: #444; margin-bottom: 5px;
    }
    .co-field input, .co-field textarea, .co-field select {
      width: 100%; box-sizing: border-box;
      padding: 10px 13px;
      border: 1.5px solid #ddd;
      border-radius: 8px;
      font-size: 14px; color: #111;
      font-family: inherit;
      transition: border-color 0.15s;
    }
    .co-field input:focus, .co-field textarea:focus, .co-field select:focus {
      outline: none; border-color: #1a1a1a;
    }
    .co-field textarea { resize: vertical; min-height: 80px; }
    .co-row { display: flex; gap: 12px; }
    .co-row .co-field { flex: 1; }
    .co-submit {
      width: 100%; padding: 14px;
      background: #1a1a1a; color: #fff;
      border: none; border-radius: 10px;
      font-size: 15px; font-weight: 600;
      cursor: pointer; margin-top: 8px;
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
  `;

  function injectStyles() {
    const el = document.createElement('style');
    el.textContent = styles;
    document.head.appendChild(el);
  }

  function getCartData() {
    return fetch('/cart.js').then(r => r.json());
  }

  function getCustomerData() {
    // Attempt to pre-fill from Shopify customer (logged-in), else empty
    return {
      name: window.__st?.cid ? '' : '',
      email: ''
    };
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
              <span class="co-btn-label">Aged Care</span>
              <span class="co-btn-desc">Bill via Aged Care package — we'll send a tax invoice</span>
            </span>
          </button>

          <button class="co-btn" id="co-ndis">
            <span class="co-btn-icon purple">♿</span>
            <span>
              <span class="co-btn-label">NDIS</span>
              <span class="co-btn-desc">Bill via NDIS — we'll send a tax invoice to your provider</span>
            </span>
          </button>
        </div>

        <!-- FORM PANEL -->
        <div id="co-form-panel">
          <div class="co-form-title">
            <button class="co-back" id="co-back" aria-label="Back">&#8592;</button>
            <span id="co-form-heading"></span>
          </div>
          <form id="co-form" novalidate>
            <div id="co-form-fields"></div>
            <button type="submit" class="co-submit" id="co-submit-btn">Send Invoice Request</button>
            <div class="co-error" id="co-form-error">Something went wrong. Please try again.</div>
          </form>
          <div class="co-success-msg" id="co-success" style="display:none">
            <div class="co-tick">✅</div>
            <h3>Request submitted!</h3>
            <p>A tax invoice has been emailed to you for approval.<br>We'll process your order once payment is confirmed.</p>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    return overlay;
  }

  const AGED_CARE_FIELDS = `
    <div class="co-row">
      <div class="co-field">
        <label>First name *</label>
        <input type="text" name="first_name" required placeholder="Jane">
      </div>
      <div class="co-field">
        <label>Last name *</label>
        <input type="text" name="last_name" required placeholder="Smith">
      </div>
    </div>
    <div class="co-field">
      <label>Email address *</label>
      <input type="email" name="email" required placeholder="jane@example.com">
    </div>
    <div class="co-field">
      <label>Aged Care package level *</label>
      <select name="package_level" required>
        <option value="">Select level...</option>
        <option value="Level 1">Level 1 — Basic care needs</option>
        <option value="Level 2">Level 2 — Low-level care needs</option>
        <option value="Level 3">Level 3 — Intermediate care needs</option>
        <option value="Level 4">Level 4 — High-level care needs</option>
      </select>
    </div>
    <div class="co-field">
      <label>Aged Care provider / coordinator name</label>
      <input type="text" name="provider_name" placeholder="Provider or coordinator name">
    </div>
    <div class="co-field">
      <label>Delivery address *</label>
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
          <option>WA</option><option>SA</option><option>TAS</option>
          <option>ACT</option><option>NT</option>
        </select>
      </div>
      <div class="co-field" style="max-width:110px">
        <label>Postcode *</label>
        <input type="text" name="postcode" required placeholder="2000" maxlength="4">
      </div>
    </div>
    <div class="co-field">
      <label>Additional notes</label>
      <textarea name="notes" placeholder="Any special requirements or notes..."></textarea>
    </div>
  `;

  const NDIS_FIELDS = `
    <div class="co-row">
      <div class="co-field">
        <label>First name *</label>
        <input type="text" name="first_name" required placeholder="Jane">
      </div>
      <div class="co-field">
        <label>Last name *</label>
        <input type="text" name="last_name" required placeholder="Smith">
      </div>
    </div>
    <div class="co-field">
      <label>Email address *</label>
      <input type="email" name="email" required placeholder="jane@example.com">
    </div>
    <div class="co-field">
      <label>NDIS number *</label>
      <input type="text" name="ndis_number" required placeholder="43XXXXXXXX" maxlength="9">
    </div>
    <div class="co-field">
      <label>Plan manager / support coordinator name *</label>
      <input type="text" name="provider_name" required placeholder="Provider or plan manager name">
    </div>
    <div class="co-field">
      <label>Provider invoice email *</label>
      <input type="email" name="provider_email" required placeholder="invoices@provider.com.au">
    </div>
    <div class="co-field">
      <label>Participant delivery address *</label>
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
          <option>WA</option><option>SA</option><option>SA</option>
          <option>TAS</option><option>ACT</option><option>NT</option>
        </select>
      </div>
      <div class="co-field" style="max-width:110px">
        <label>Postcode *</label>
        <input type="text" name="postcode" required placeholder="2000" maxlength="4">
      </div>
    </div>
    <div class="co-field">
      <label>Additional notes</label>
      <textarea name="notes" placeholder="Any NDIS-specific requirements or notes..."></textarea>
    </div>
  `;

  function validateForm(form) {
    const inputs = form.querySelectorAll('[required]');
    let valid = true;
    inputs.forEach(input => {
      input.style.borderColor = '';
      if (!input.value.trim()) {
        input.style.borderColor = '#c0392b';
        valid = false;
      }
    });
    return valid;
  }

  function formDataToObject(form) {
    const fd = new FormData(form);
    const obj = {};
    fd.forEach((val, key) => { obj[key] = val; });
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

  function init() {
    injectStyles();
    const overlay = buildModal();

    let currentFormType = null;
    let cartData = null;

    const optionsPanel = overlay.querySelector('#co-options-panel');
    const formPanel    = overlay.querySelector('#co-form-panel');
    const formFields   = overlay.querySelector('#co-form-fields');
    const formHeading  = overlay.querySelector('#co-form-heading');
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
        formHeading.textContent = '🏠 Aged Care Invoice Request';
        formFields.innerHTML = AGED_CARE_FIELDS;
      } else {
        formHeading.textContent = '♿ NDIS Invoice Request';
        formFields.innerHTML = NDIS_FIELDS;
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
      if (!validateForm(form)) return;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting…';
      try {
        const formData = formDataToObject(form);
        await submitForm(currentFormType, formData, cartData);
        form.style.display = 'none';
        successDiv.style.display = 'block';
        // Clear Shopify cart
        await fetch('/cart/clear.js', { method: 'POST' });
      } catch (err) {
        errorDiv.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send Invoice Request';
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
