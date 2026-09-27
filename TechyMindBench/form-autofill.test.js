// TechyMindBench/form-autofill.test.js
// Verification suite for Phase 3: Universal Form Autofill & E-Commerce Engine.
// Validates semantic field classification, sensitive PII tagging, and profile plan generation
// across simulated e-commerce checkouts, government portals, and standard HTML5 forms.

import {
  classifyFormField,
  discoverFormFields,
  buildAutofillPlan,
  FIELD_DEFINITIONS,
  AUTOFILL_ENGINE_VERSION
} from '../src/lib/form-autofill.js';

export async function run() {
  const results = [];
  const add = (name, ok, error = null) => results.push({ name, ok, error });

  // 1. Semantic Field Classification (HTML5 & Autocomplete standard tokens)
  try {
    const inputName = { tagName: 'INPUT', type: 'text', autocomplete: 'name', id: 'f_name', getAttribute: (k) => inputName[k] };
    const inputEmail = { tagName: 'INPUT', type: 'email', autocomplete: 'email', id: 'f_email', getAttribute: (k) => inputEmail[k] };
    const inputPhone = { tagName: 'INPUT', type: 'tel', autocomplete: 'tel', id: 'f_phone', getAttribute: (k) => inputPhone[k] };
    const inputAddress = { tagName: 'TEXTAREA', type: 'textarea', autocomplete: 'street-address', id: 'f_addr', getAttribute: (k) => inputAddress[k] };
    const inputCity = { tagName: 'INPUT', type: 'text', autocomplete: 'address-level2', id: 'f_city', getAttribute: (k) => inputCity[k] };
    const inputState = { tagName: 'INPUT', type: 'text', autocomplete: 'address-level1', id: 'f_state', getAttribute: (k) => inputState[k] };
    const inputPin = { tagName: 'INPUT', type: 'text', autocomplete: 'postal-code', id: 'f_pin', getAttribute: (k) => inputPin[k] };

    const cName = classifyFormField(inputName);
    const cEmail = classifyFormField(inputEmail);
    const cPhone = classifyFormField(inputPhone);
    const cAddress = classifyFormField(inputAddress);
    const cCity = classifyFormField(inputCity);
    const cState = classifyFormField(inputState);
    const cPin = classifyFormField(inputPin);

    const ok = cName?.fieldKey === 'fullName' &&
               cEmail?.fieldKey === 'email' &&
               cPhone?.fieldKey === 'phone' &&
               cAddress?.fieldKey === 'address' &&
               cCity?.fieldKey === 'city' &&
               cState?.fieldKey === 'state' &&
               cPin?.fieldKey === 'pincode';

    add('W3C Autocomplete & HTML5 field classification', ok);
  } catch (err) {
    add('W3C Autocomplete & HTML5 field classification', false, err.message);
  }

  // 2. Realistic E-Commerce Checkout Form (Amazon & Flipkart simulated attributes)
  try {
    const mockAmazonCheckout = [
      { tagName: 'INPUT', type: 'text', id: 'address-ui-widgets-enterAddressFullName', placeholder: 'Full Name', getAttribute(k) { return this[k]; } },
      { tagName: 'INPUT', type: 'text', id: 'address-ui-widgets-enterAddressPhoneNumber', placeholder: '10-digit mobile number', getAttribute(k) { return this[k]; } },
      { tagName: 'INPUT', type: 'text', id: 'address-ui-widgets-enterAddressPostalCode', placeholder: '6 digits [0-9] PIN code', getAttribute(k) { return this[k]; } },
      { tagName: 'INPUT', type: 'text', id: 'address-ui-widgets-enterAddressLine1', placeholder: 'Flat, House no., Building, Company, Apartment', getAttribute(k) { return this[k]; } },
      { tagName: 'INPUT', type: 'text', id: 'address-ui-widgets-enterAddressCity', placeholder: 'Town/City', getAttribute(k) { return this[k]; } },
      { tagName: 'INPUT', type: 'text', id: 'address-ui-widgets-enterAddressStateOrRegion', placeholder: 'State', getAttribute(k) { return this[k]; } },
    ];

    const mockDoc = {
      querySelectorAll(sel) {
        return mockAmazonCheckout;
      }
    };

    const discovered = discoverFormFields(mockDoc);
    const keys = discovered.map(d => d.fieldKey);

    const hasName = keys.includes('fullName');
    const hasPhone = keys.includes('phone');
    const hasPin = keys.includes('pincode');
    const hasAddress = keys.includes('address');
    const hasCity = keys.includes('city');
    const hasState = keys.includes('state');

    add('E-commerce address form field extraction (Amazon/Flipkart patterns)', hasName && hasPhone && hasPin && hasAddress && hasCity && hasState);
  } catch (err) {
    add('E-commerce address form field extraction', false, err.message);
  }

  // 3. PII & Sensitive Field Tagging for Visual Agency
  try {
    const phoneField = classifyFormField({ tagName: 'INPUT', type: 'tel', name: 'contact_number', getAttribute(k) { return this[k]; } });
    const addressField = classifyFormField({ tagName: 'TEXTAREA', id: 'delivery_street_address', getAttribute(k) { return this[k]; } });
    const pinField = classifyFormField({ tagName: 'INPUT', name: 'pincode', getAttribute(k) { return this[k]; } });
    const emailField = classifyFormField({ tagName: 'INPUT', type: 'email', name: 'email', getAttribute(k) { return this[k]; } });
    const nameField = classifyFormField({ tagName: 'INPUT', type: 'text', name: 'full_name', getAttribute(k) { return this[k]; } });
    const cityField = classifyFormField({ tagName: 'INPUT', type: 'text', name: 'city_town', getAttribute(k) { return this[k]; } });

    // Phone, address, pincode, email MUST be flagged as sensitive (for amber highlight & privacy fence)
    const pSensitive = phoneField?.isSensitive === true &&
                       addressField?.isSensitive === true &&
                       pinField?.isSensitive === true &&
                       emailField?.isSensitive === true;

    // Name and city are safe demographic info
    const pSafe = nameField?.isSensitive === false &&
                  cityField?.isSensitive === false;

    add('PII Sensitivity tagging for Visual Agency security theme', pSensitive && pSafe);
  } catch (err) {
    add('PII Sensitivity tagging', false, err.message);
  }

  // 4. Autofill Plan Generation from User Profile
  try {
    const userProfile = {
      fullName: 'Vikhyath Gowda',
      email: 'vikhyath@techymind.ai',
      phone: '+91 9876543210',
      address: 'Plot 42, Silicon Valley Tech Corridor',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560100',
      country: 'India',
    };

    const mockInputs = [
      { tagName: 'INPUT', type: 'text', name: 'full_name', getAttribute(k) { return this[k]; } },
      { tagName: 'INPUT', type: 'email', name: 'email', getAttribute(k) { return this[k]; } },
      { tagName: 'INPUT', type: 'tel', name: 'phone', getAttribute(k) { return this[k]; } },
      { tagName: 'INPUT', type: 'text', name: 'shipping_address', getAttribute(k) { return this[k]; } },
      { tagName: 'INPUT', type: 'text', name: 'city', getAttribute(k) { return this[k]; } },
      { tagName: 'INPUT', type: 'text', name: 'state', getAttribute(k) { return this[k]; } },
      { tagName: 'INPUT', type: 'text', name: 'pincode', getAttribute(k) { return this[k]; } },
      { tagName: 'INPUT', type: 'text', name: 'country', getAttribute(k) { return this[k]; } },
    ];

    const mockDoc = {
      querySelectorAll() { return mockInputs; }
    };

    const plan = buildAutofillPlan(mockDoc, userProfile);

    const pCount = plan.fillCount === 8;
    const pValues = plan.operations.every(op => op.value === userProfile[op.fieldKey]);
    const pMissing = plan.missingFields.length === 0;

    add('Profile-to-form value mapping & plan generation', pCount && pValues && pMissing);
  } catch (err) {
    add('Profile-to-form value mapping', false, err.message);
  }

  // 5. Partial Profile Handling & Non-Editable Input Filtering
  try {
    const partialProfile = {
      fullName: 'Arjun Rao',
      email: 'arjun@example.com',
      // Missing phone, address, pincode
    };

    const mockMixedInputs = [
      { tagName: 'INPUT', type: 'text', name: 'full_name', getAttribute(k) { return this[k]; } },
      { tagName: 'INPUT', type: 'email', name: 'email', getAttribute(k) { return this[k]; } },
      { tagName: 'INPUT', type: 'tel', name: 'phone', getAttribute(k) { return this[k]; } },
      // Hidden, disabled, and button inputs should be ignored
      { tagName: 'INPUT', type: 'hidden', name: 'csrf_token', getAttribute(k) { return this[k]; } },
      { tagName: 'INPUT', type: 'submit', value: 'Place Order', getAttribute(k) { return this[k]; } },
      { tagName: 'INPUT', type: 'text', name: 'pincode', disabled: true, getAttribute(k) { return this[k]; } },
    ];

    const mockDoc = {
      querySelectorAll() { return mockMixedInputs; }
    };

    const plan = buildAutofillPlan(mockDoc, partialProfile);

    // Only full_name and email should be in operations
    const pFilled = plan.fillCount === 2;
    const pKeys = plan.operations.map(o => o.fieldKey);
    const pHasValid = pKeys.includes('fullName') && pKeys.includes('email');
    const pMissingReported = plan.missingFields.includes('phone');

    add('Non-editable input filtering & graceful partial profile handling', pFilled && pHasValid && pMissingReported);
  } catch (err) {
    add('Non-editable input filtering', false, err.message);
  }

  const pass = results.every(r => r.ok);
  return {
    name: 'Universal Form Autofill & E-Commerce Engine',
    pass,
    metrics: {
      totalTests: results.length,
      passedTests: results.filter(r => r.ok).length,
      version: AUTOFILL_ENGINE_VERSION,
    },
    results,
  };
}
