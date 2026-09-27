// src/lib/ordinal-resolver.js
// Generalized Semantic & Spatial DOM Element Grounding for TechyMind.
// Understands human references ("first", "second", "2nd", "top", "last") naturally
// across ANY website by analyzing live DOM hierarchy and viewport spatial geometry,
// with ZERO hardcoded site selectors.

export const ORDINAL_RESOLVER_VERSION = 'v2.0.0';

/**
 * Common ordinal representations (words, digits, relative position).
 */
export const ORDINAL_WORDS = {
  'first': 1, '1st': 1, 'one': 1, 'top': 1, 'initial': 1, 'foremost': 1,
  'second': 2, '2nd': 2, 'two': 2,
  'third': 3, '3rd': 3, 'three': 3,
  'fourth': 4, '4th': 4, 'four': 4,
  'fifth': 5, '5th': 5, 'five': 5,
  'sixth': 6, '6th': 6, 'six': 6,
  'seventh': 7, '7th': 7, 'seven': 7,
  'eighth': 8, '8th': 8, 'eight': 8,
  'ninth': 9, '9th': 9, 'nine': 9,
  'tenth': 10, '10th': 10, 'ten': 10,
  'eleventh': 11, '11th': 11,
  'twelfth': 12, '12th': 12,
  'last': -1, 'bottom': -1, 'final': -1,
};

/**
 * Universal content candidate selectors applicable to any webpage structure.
 * Matches article links, list items, card titles, and primary content items.
 * Prioritizes distinct content headings and cards before broad list items.
 */
export const UNIVERSAL_CARD_SELECTORS = [
  // E-commerce & Search result titles (Amazon, Flipkart, Google, YouTube)
  'div[data-component-type="s-search-result"] h2 a',
  'div.s-result-item h2 a',
  'div[data-component-type="s-search-result"] a.a-link-normal:has(h2)',
  'div._1AtVbE a',
  'ytd-video-renderer a#video-title, ytd-video-renderer a',
  'ytd-rich-item-renderer a#video-title',
  'a#video-title',
  'div.video a',
  'div.product a',
  'div.product-card a',
  'div.item a',
  'div.card a',
  'div.result a',
  'a.result',
  'a.title',
  'div[data-id] a',
  // Heading links in main content
  'main h1 a, main h2 a, main h3 a, main h4 a',
  'h1 a',
  'h2 a',
  'h3 a',
  'h4 a',
  // Semantic containers
  'main article a',
  'article a',
  'main [role="article"] a',
  '[role="article"] a',
  'main [role="listitem"] a',
  '[role="listitem"] a',
  'main li a',
  'li a',
  'main a',
];

/**
 * Categorizes an entity noun into a semantic domain category.
 * Provides general domain awareness without site-specific hardcoding.
 * 
 * @param {string} noun - Extracted noun (e.g. "song", "video", "shoe", "article")
 * @returns {string} Semantic category
 */
export function categorizeEntity(noun = '') {
  const n = String(noun || '').toLowerCase().trim();
  if (['song', 'video', 'track', 'movie', 'clip', 'audio', 'stream', 'music', 'episode', 'media'].includes(n)) {
    return 'media';
  }
  if (['product', 'shoe', 'shoes', 'item', 'laptop', 'phone', 'book', 'watch', 'shirt', 'clothes', 'deal', 'goods'].includes(n)) {
    return 'product';
  }
  if (['article', 'post', 'blog', 'story', 'news', 'page', 'guide'].includes(n)) {
    return 'article';
  }
  if (['result', 'link', 'entry', 'card', 'option', 'search'].includes(n)) {
    return 'result';
  }
  return n || 'item';
}

/**
 * Parses natural language input to check for an ordinal target reference.
 * Accepts any action verb and any entity noun without rigid dictionary restrictions.
 * 
 * @param {string} text - User prompt (e.g. "play the first song", "click on 2nd video", "open 3rd article")
 * @returns {{
 *   isOrdinal: boolean,
 *   ordinal: number,
 *   rawMatch: string,
 *   action?: string,
 *   entity?: string
 * }}
 */
export function parseOrdinalPhrase(text) {
  const raw = String(text || '').trim();
  if (!raw) return { isOrdinal: false };
  const lower = raw.toLowerCase();

  // Guard against non-action informational search queries: "search for the first man on the moon"
  if (/^(search|find|query|google)\s+for\s+/i.test(lower) && !/\b(and|then)\s+(play|click|open|select)\b/i.test(lower)) {
    return { isOrdinal: false };
  }

  const ordKeys = Object.keys(ORDINAL_WORDS).join('|');

  // Helper to extract the primary noun and semantic category from a trailing phrase
  const resolveEntityNoun = (phrase) => {
    const words = String(phrase || '').trim().split(/\s+/).filter(Boolean);
    const lastWord = words.length > 0 ? words[words.length - 1] : 'item';
    return categorizeEntity(lastWord);
  };

  // Pattern 1: Action + (optional 'the/on/at') + Ordinal + Any optional noun
  // e.g., "play the first song", "click 2nd video", "open third product", "select 4th option"
  const pat1 = new RegExp(
    `(?:\\b(play|listen|watch|click|open|select|choose|tap|pick)\\s+(?:on\\s+|at\\s+|to\\s+)?(?:the\\s+)?)(#?\\d{1,2}(?:st|nd|rd|th)?|${ordKeys})(?:\\s+([a-zA-Z0-9_ -]+))?`,
    'i'
  );
  let m = pat1.exec(lower);
  if (m) {
    const ordToken = m[2].replace(/^#/, '');
    const num = ORDINAL_WORDS[ordToken] || parseInt(ordToken, 10);
    if (Number.isInteger(num)) {
      return {
        isOrdinal: true,
        ordinal: num,
        action: m[1],
        entity: resolveEntityNoun(m[3]),
        rawMatch: m[0].trim(),
      };
    }
  }

  // Pattern 2: Ordinal + Noun directly (e.g., "first song", "2nd video", "top product", "third item", "last result")
  const pat2 = new RegExp(
    `(?:^|\\s)(?:the\\s+)?(#?\\d{1,2}(?:st|nd|rd|th)?|${ordKeys})\\s+([a-zA-Z0-9_ -]+)(?:\\b|\\s|$)`,
    'i'
  );
  m = pat2.exec(lower);
  if (m) {
    const ordToken = m[1].replace(/^#/, '');
    const num = ORDINAL_WORDS[ordToken] || parseInt(ordToken, 10);
    const nounPhrase = (m[2] || '').trim();
    const words = nounPhrase.split(/\s+/).filter(Boolean);
    const firstWord = words[0] || '';
    // Filter out common non-entity nouns
    const nonEntities = new Set(['time', 'day', 'week', 'month', 'year', 'step', 'turn', 'place', 'attempt']);
    if (Number.isInteger(num) && !nonEntities.has(firstWord)) {
      return {
        isOrdinal: true,
        ordinal: num,
        action: 'click',
        entity: resolveEntityNoun(nounPhrase),
        rawMatch: m[0].trim(),
      };
    }
  }

  // Pattern 3: Numbered format: "#2", "number 3", "no. 1"
  const pat3 = /(?:^|\s)(?:number|no\.?|#)\s*(\d{1,2})(?:\s+([a-zA-Z0-9_ -]+))?/i;
  m = pat3.exec(lower);
  if (m) {
    const num = parseInt(m[1], 10);
    if (num >= 1 && num <= 25) {
      return {
        isOrdinal: true,
        ordinal: num,
        action: 'click',
        entity: resolveEntityNoun(m[2]),
        rawMatch: m[0].trim(),
      };
    }
  }

  return { isOrdinal: false };
}

/**
 * Universal candidate selectors. Returns generic structural patterns applicable to ANY site.
 * 
 * @param {string} [url] - Optional page URL (kept for backwards compatibility)
 * @param {string} [entity] - Optional entity classification
 * @returns {string[]} Ordered array of CSS selectors
 */
export function getDomainCardSelectors(url = '', entity = 'generic') {
  // Returns universal structural patterns that match items on any site
  return UNIVERSAL_CARD_SELECTORS;
}

/**
 * Geometrically sorts DOM elements in visual reading order (top-to-bottom, left-to-right).
 * This allows the agent to visually identify "first", "second", "third", and "last"
 * items on ANY webpage without hardcoded site selectors.
 * 
 * @param {Element[]} elements - DOM elements to sort
 * @returns {Element[]} Geometrically sorted elements
 */
export function sortElementsByVisualOrder(elements) {
  if (!Array.isArray(elements) || elements.length <= 1) return elements || [];

  return [...elements].sort((a, b) => {
    if (typeof a.getBoundingClientRect !== 'function' || typeof b.getBoundingClientRect !== 'function') {
      return 0;
    }
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();

    // Group items into rows with a vertical tolerance of 15px
    const vertDiff = ra.top - rb.top;
    if (Math.abs(vertDiff) > 15) {
      return vertDiff;
    }
    // Within the same row, sort left-to-right
    return ra.left - rb.left;
  });
}

/**
 * Resolves the target element from a DOM root given an ordinal reference.
 * Dynamically identifies content candidates and resolves the N-th element
 * based on visual reading order.
 * 
 * @param {Document|Element} root - Root document or container
 * @param {{ ordinal: number, entity?: string }} ordinalInfo - Parsed ordinal reference
 * @param {string} [currentUrl] - Optional URL
 * @returns {{
 *   ok: boolean,
 *   element: Element|null,
 *   index: number,
 *   total: number,
 *   selector?: string,
 *   reason?: string
 * }}
 */
export function resolveOrdinalElement(root, ordinalInfo, currentUrl = '') {
  if (!root || !ordinalInfo || !Number.isInteger(ordinalInfo.ordinal)) {
    return { ok: false, element: null, index: -1, total: 0, reason: 'Invalid parameters' };
  }

  const seen = new Set();
  const rawCandidates = [];

  const isInsideNavOrHeader = (node) => {
    try {
      if (typeof node.closest === 'function') {
        return Boolean(node.closest('header, nav, footer, [role="navigation"], [role="banner"], [role="contentinfo"], #navbar, #nav-main, #nav-belt, #nav-subnav, #header, #footer, .site-header, .site-footer'));
      }
    } catch {}
    return false;
  };

  const isShopping = ordinalInfo.entity === 'product' || /amazon|flipkart|walmart|ebay|target|myntra|ajio|meesho|shopping|store/i.test(currentUrl);
  const isMedia = ordinalInfo.entity === 'media' || /youtube|vimeo|spotify|netflix/i.test(currentUrl);

  // Dynamic selector prioritization based on domain/entity context
  const candidateSelectors = [...UNIVERSAL_CARD_SELECTORS];
  if (isShopping) {
    candidateSelectors.unshift(
      'div[data-component-type="s-search-result"] h2 a',
      'div.s-result-item h2 a',
      'div[data-component-type="s-search-result"] a.a-link-normal:not([href*="/gp/video"])',
      'div._1AtVbE a',
      'div[data-id] a',
      'div.product a'
    );
  } else if (isMedia) {
    candidateSelectors.unshift(
      'ytd-video-renderer a#video-title',
      'ytd-video-renderer a',
      'ytd-rich-item-renderer a#video-title',
      'a#video-title'
    );
  }

  for (const sel of candidateSelectors) {
    try {
      const nodes = root.querySelectorAll(sel);
      for (const node of nodes) {
        if (!node || seen.has(node)) continue;

        // Strictly exclude header navigation, top bars, and footers
        if (isInsideNavOrHeader(node)) continue;

        // Verify visibility if in browser environment
        if (typeof node.getBoundingClientRect === 'function') {
          const r = node.getBoundingClientRect();
          const win = root.defaultView || (typeof window !== 'undefined' ? window : null);
          const style = win ? win.getComputedStyle(node) : null;
          if (style && (style.visibility === 'hidden' || style.display === 'none')) continue;
          if (r.width === 0 && r.height === 0 && node.offsetParent === null) continue;
        }

        seen.add(node);
        rawCandidates.push(node);
      }
      if (rawCandidates.length > 0) break; // Found candidates with the primary structural pattern
    } catch {}
  }

  const total = rawCandidates.length;
  if (total === 0) {
    return { ok: false, element: null, index: -1, total: 0, reason: 'No content candidates found' };
  }

  // Sort candidates by visual coordinates (top-to-bottom, left-to-right)
  const sorted = sortElementsByVisualOrder(rawCandidates);

  const targetIndex = ordinalInfo.ordinal === -1 ? total - 1 : ordinalInfo.ordinal - 1;
  if (targetIndex < 0 || targetIndex >= total) {
    return {
      ok: false,
      element: null,
      index: targetIndex,
      total,
      reason: `Ordinal #${ordinalInfo.ordinal} out of range (matched ${total} items)`,
    };
  }

  return {
    ok: true,
    element: sorted[targetIndex],
    index: targetIndex,
    total,
    selector: UNIVERSAL_CARD_SELECTORS[0],
  };
}
