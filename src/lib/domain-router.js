// src/lib/domain-router.js
// Universal Omnibox & Search Engine Router for TechyMind.
// Operates like a human using a browser address bar and keyboard:
// navigates directly to explicit URLs/domains or dispatches natural queries
// via universal web search without hardcoded site dictionaries.

export const PRIVILEGED_URL_RE = /^(chrome|edge|about|devtools|view-source|chrome-extension|moz-extension):|^https?:\/\/chromewebstore\.google\.com/i;

const DOMAIN_REGEX = /\b(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9][-a-zA-Z0-9]*\.(?:com|org|net|in|io|co|ai|dev|gov|edu|me|app|xyz|tech|info|tv|so|to|cc|site|online|store)(?:\/[^\s]*)?)/i;

/**
 * Extracts a clean search query or navigation destination from natural language user input.
 * Strips conversational filler and command prefixes so the search engine receives
 * the precise intent.
 * 
 * @param {string} text - User prompt
 * @returns {string} Clean search query
 */
export function extractCleanQuery(text) {
  let q = String(text || '').trim();
  // Strip common conversational preamble: "can you", "please", "i want to", "now", "hey"
  q = q.replace(/^(hey\s+|please\s+|can\s+you\s+|could\s+you\s+|i\s+want\s+to\s+|let\'?s\s+|now\s+)+/i, '').trim();
  // Strip action verbs: "open", "go to", "navigate to", "search for", "search", "find", "look up", "check"
  q = q.replace(/^(open|go\s*to|navigate\s*to|visit|browse\s*to|launch|search\s*for|search|find|look\s*up|check)\s+/i, '').trim();
  return q;
}

/**
 * Infers a target landing URL from the user's task text.
 * 1. If an explicit URL or domain is present -> navigates to that domain.
 * 2. If a natural language query is provided -> uses universal search engine (Google).
 * 
 * @param {string} task - User task prompt
 * @returns {string} Landing URL
 */
export function inferStartUrlFromTask(task) {
  const raw = String(task || '').trim();
  if (!raw) return 'https://www.google.com';

  // 1. Explicit URL or domain mention (e.g. "reddit.com", "github.com/foo", "https://...")
  const domMatch = DOMAIN_REGEX.exec(raw);
  if (domMatch) {
    const matched = domMatch[1];
    return matched.startsWith('http') ? matched : `https://${matched}`;
  }

  // 2. Clean natural language query
  const query = extractCleanQuery(raw);
  if (!query) return 'https://www.google.com';

  // Universal omnibox search: like typing in the browser address bar and hitting Enter
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

/**
 * Detects if a user instruction intends to switch to a different domain from the current tab.
 * Returns the target URL if a cross-domain switch is detected, or null if the action should
 * stay on the current page.
 *
 * @param {string} task - User task (e.g. "now open amazon and check shoes", "play the first song")
 * @param {string} currentUrl - Active tab URL
 * @returns {string|null} Target URL to navigate to, or null
 */
export function detectCrossDomainSwitch(task, currentUrl) {
  if (!task || !currentUrl) return null;
  if (PRIVILEGED_URL_RE.test(currentUrl)) return null; // handled by bootstrap logic

  let currentHost = '';
  try {
    currentHost = new URL(currentUrl).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }

  const raw = String(task).trim();
  const lower = raw.toLowerCase();

  // 1. Explicit domain mentioned that differs from current host
  const domMatch = DOMAIN_REGEX.exec(raw);
  if (domMatch) {
    const targetUrl = domMatch[1].startsWith('http') ? domMatch[1] : `https://${domMatch[1]}`;
    try {
      const targetHost = new URL(targetUrl).hostname.replace(/^www\./, '').toLowerCase();
      if (targetHost && targetHost !== currentHost && !currentHost.includes(targetHost)) {
        return targetUrl;
      }
    } catch {}
  }

  // 2. Explicit navigation intent to a different site/destination:
  // e.g. "now open amazon", "go to flipkart", "switch to youtube", "check on reddit"
  const navMatch = /\b(?:open|go\s*to|switch\s*to|visit|browse\s*to|navigate\s*to|(?:check|search)\s+(?:on|in|at))\s+([a-zA-Z0-9_-]+)(?:\s+(?:and\s+)?(?:check|search\s*for|search|find|look\s*up)\s+(.+))?/i.exec(lower);
  if (navMatch) {
    const targetKeyword = navMatch[1].toLowerCase();
    // Ignore generic actions: "open the first one", "click next", "go to cart"
    const genericWords = new Set([
      'the', 'a', 'an', 'this', 'first', 'second', 'third', 'next', 'previous',
      'top', 'bottom', 'last', 'link', 'item', 'result', 'page', 'tab', 'window',
      'cart', 'checkout', 'settings', 'profile', 'video', 'song', 'one', 'button'
    ]);
    if (!genericWords.has(targetKeyword) && !currentHost.includes(targetKeyword)) {
      const subQuery = (navMatch[2] || '').trim();
      if (subQuery) {
        return `https://www.${targetKeyword}.com/search?q=${encodeURIComponent(subQuery)}`;
      }
      return `https://www.${targetKeyword}.com`;
    }
  }

  return null;
}
