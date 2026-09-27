// src/lib/form-autofill.js
// Universal Semantic Form Autofill Engine for TechyMind.
// Understands form fields (Name, Phone, Email, Address, City, State, PIN, Country)
// across ANY website using standard HTML5 attributes, ARIA roles, and semantic cues,
// with ZERO site-specific hardcoding.

export const AUTOFILL_ENGINE_VERSION = 'v1.0.0';

/**
 * Normalizes a text string for fuzzy semantic comparison.
 */
export function norm(val) {
  return String(val || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Standard semantic definitions for profile fields.
 * Specific single-entity fields (email, phone, pincode, fullName, city, state, country)
 * are prioritized before broad multi-attribute containers like address.
 */
export const FIELD_DEFINITIONS = [
  {
    key: 'email',
    isSensitive: true,
    htmlTypes: ['email'],
    autocompleteTokens: ['email'],
    regex: /\b(e-?mail|email\s*address)\b/i,
    negativeRegex: /\b(confirm|verify|repeat)\b/i,
  },
  {
    key: 'phone',
    isSensitive: true,
    htmlTypes: ['tel'],
    autocompleteTokens: ['tel', 'tel-national', 'tel-local', 'mobile'],
    regex: /\b(phone|mobile|tel|telephone|contact\s*no|contact\s*number|cell|phone\s*number)\b/i,
    negativeRegex: /\b(fax|work\s*phone|alt\s*phone)\b/i,
  },
  {
    key: 'pincode',
    isSensitive: true,
    htmlTypes: [],
    autocompleteTokens: ['postal-code', 'zip', 'postcode'],
    regex: /\b(pin\s*code|pincode|postal\s*code|postal|zip\s*code|zip)\b/i,
    negativeRegex: /\b(confirm|card|cvv)\b/i,
  },
  {
    key: 'fullName',
    isSensitive: false,
    htmlTypes: [],
    autocompleteTokens: ['name', 'given-name', 'family-name'],
    regex: /\b(full\s*name|your\s*name|first\s*name|last\s*name|recipient|customer\s*name|contact\s*name|enteraddressfullname)\b/i,
    negativeRegex: /\b(user\s*name|username|file|host|card|cardholder)\b/i,
  },
  {
    key: 'city',
    isSensitive: false,
    htmlTypes: [],
    autocompleteTokens: ['address-level2', 'city'],
    regex: /\b(city|district|town|municipality)\b/i,
    negativeRegex: /\b(electricity|capacity)\b/i,
  },
  {
    key: 'state',
    isSensitive: false,
    htmlTypes: [],
    autocompleteTokens: ['address-level1', 'state'],
    regex: /\b(state|province|region)\b/i,
    negativeRegex: /\b(statement|united|status)\b/i,
  },
  {
    key: 'country',
    isSensitive: false,
    htmlTypes: [],
    autocompleteTokens: ['country', 'country-name'],
    regex: /\b(country|nation)\b/i,
    negativeRegex: /\b(counter|county)\b/i,
  },
  {
    key: 'address',
    isSensitive: true,
    htmlTypes: [],
    autocompleteTokens: ['street-address', 'address-line1', 'address-line2', 'address'],
    regex: /\b(address|street|flat|house|building|apartment|suite|locality|road|address\s*line|shipping\s*address|delivery\s*address)\b/i,
    negativeRegex: /\b(email\s*address|mac\s*address|ip\s*address)\b/i,
  },
  {
    key: 'company',
    isSensitive: false,
    htmlTypes: [],
    autocompleteTokens: ['organization', 'organization-title', 'company'],
    regex: /\b(company|organization|organisation|business|workplace)\b/i,
    negativeRegex: /\b(companion)\b/i,
  },
];

/**
 * Checks if an element is currently visible and interactable in the DOM.
 */
export function isElementVisible(el) {
  if (!el) return false;
  if (typeof el.getBoundingClientRect !== 'function') return true; // mock/node environment
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0 && el.offsetParent === null) return false;
  const win = el.ownerDocument?.defaultView || (typeof window !== 'undefined' ? window : null);
  if (win && typeof win.getComputedStyle === 'function') {
    const s = win.getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
  }
  return true;
}

/**
 * Extracts all semantic hints associated with an editable form field:
 * - autocomplete attribute
 * - type attribute
 * - name, id, placeholder, title, aria-label, aria-labelledby
 * - associated <label> text content
 * 
 * @param {Element} el - DOM input/textarea element
 * @returns {string} Combined normalized semantic text blob
 */
export function extractFieldSemanticBlob(el) {
  if (!el) return '';
  const parts = [];

  // Direct attributes
  const directAttrs = ['autocomplete', 'type', 'name', 'id', 'placeholder', 'title', 'aria-label'];
  for (const attr of directAttrs) {
    const rawVal = el.getAttribute ? el.getAttribute(attr) : el[attr];
    if (rawVal && typeof rawVal === 'string') parts.push(rawVal);
  }

  // Associated label by 'for' attribute or enclosing <label>
  try {
    const doc = el.ownerDocument || (typeof document !== 'undefined' ? document : null);
    const elId = el.getAttribute ? el.getAttribute('id') : el.id;
    if (elId && doc && typeof doc.querySelector === 'function') {
      const label = doc.querySelector(`label[for="${elId}"]`);
      if (label && label.textContent) parts.push(label.textContent);
    }
    const parentLabel = el.closest ? el.closest('label') : null;
    if (parentLabel && parentLabel.textContent) parts.push(parentLabel.textContent);
  } catch {}

  return norm(parts.join(' '));
}

/**
 * Classifies an editable input or textarea element into a semantic profile field key.
 * 
 * @param {Element} el - DOM element
 * @returns {{
 *   fieldKey: string,
 *   isSensitive: boolean,
 *   confidence: number,
 *   matchedBy: string
 * }|null}
 */
export function classifyFormField(el) {
  if (!el) return null;
  const tagName = String(el.tagName || '').toUpperCase();
  if (tagName !== 'INPUT' && tagName !== 'TEXTAREA' && tagName !== 'SELECT') return null;

  // Skip non-typeable or read-only input types
  const rawType = el.getAttribute ? el.getAttribute('type') : el.type;
  const type = String(rawType || 'text').toLowerCase();
  if (['hidden', 'submit', 'button', 'checkbox', 'radio', 'file', 'image', 'reset'].includes(type)) {
    return null;
  }
  if (el.readOnly || el.disabled) return null;

  const rawAc = el.getAttribute ? el.getAttribute('autocomplete') : el.autocomplete;
  const autocomplete = (typeof rawAc === 'string' ? rawAc : '').toLowerCase();
  const blob = extractFieldSemanticBlob(el);

  for (const def of FIELD_DEFINITIONS) {
    // 1. W3C Autocomplete exact token match (highest confidence)
    if (autocomplete && def.autocompleteTokens.some(token => autocomplete.includes(token))) {
      return {
        fieldKey: def.key,
        isSensitive: def.isSensitive,
        confidence: 0.98,
        matchedBy: 'autocomplete',
      };
    }

    // 2. HTML5 Type match
    if (def.htmlTypes.includes(type)) {
      return {
        fieldKey: def.key,
        isSensitive: def.isSensitive,
        confidence: 0.95,
        matchedBy: 'html-type',
      };
    }

    // 3. Semantic attribute & label regex match
    if (def.regex.test(blob)) {
      if (def.negativeRegex && def.negativeRegex.test(blob)) continue;
      return {
        fieldKey: def.key,
        isSensitive: def.isSensitive,
        confidence: 0.88,
        matchedBy: 'semantic-text',
      };
    }
  }

  // Fallback: If it's a textarea and mentions address, or is an untyped input right after an address field
  if (tagName === 'TEXTAREA' && /address|deliver/i.test(blob)) {
    return {
      fieldKey: 'address',
      isSensitive: true,
      confidence: 0.85,
      matchedBy: 'textarea-address-fallback',
    };
  }

  return null;
}

/**
 * Scans a DOM root or container and identifies all form inputs mapped to semantic profile keys.
 * 
 * @param {Document|Element} [root] - DOM container to search
 * @returns {Array<{
 *   element: Element,
 *   fieldKey: string,
 *   isSensitive: boolean,
 *   confidence: number
 * }>}
 */
export function discoverFormFields(root) {
  const doc = root || (typeof document !== 'undefined' ? document : null);
  if (!doc || typeof doc.querySelectorAll !== 'function') return [];

  const candidates = Array.from(doc.querySelectorAll('input, textarea, select'))
    .filter(isElementVisible);

  const matched = [];
  const seenKeys = new Set();

  for (const el of candidates) {
    const classification = classifyFormField(el);
    if (classification) {
      // Avoid duplicate assignment to the same key unless it's a multi-line address
      if (!seenKeys.has(classification.fieldKey) || classification.fieldKey === 'address') {
        seenKeys.add(classification.fieldKey);
        matched.push({
          element: el,
          ...classification,
        });
      }
    }
  }

  return matched;
}

/**
 * Matches detected form fields against stored profileData and produces
 * a structured list of autofill operations.
 * 
 * @param {Document|Element} root - DOM container
 * @param {Object} profileData - Stored user profile
 * @returns {{
 *   operations: Array<{
 *     element: Element,
 *     fieldKey: string,
 *     value: string,
 *     isSensitive: boolean,
 *     confidence: number
 *   }>,
 *   fillCount: number,
 *   missingFields: string[]
 * }}
 */
export function buildAutofillPlan(root, profileData = {}) {
  const discovered = discoverFormFields(root);
  const operations = [];
  const missingFields = [];

  for (const item of discovered) {
    const val = profileData[item.fieldKey];
    if (val && String(val).trim()) {
      operations.push({
        element: item.element,
        fieldKey: item.fieldKey,
        value: String(val).trim(),
        isSensitive: item.isSensitive,
        confidence: item.confidence,
      });
    } else {
      missingFields.push(item.fieldKey);
    }
  }

  return {
    operations,
    fillCount: operations.length,
    missingFields,
  };
}
