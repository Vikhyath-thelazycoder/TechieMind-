// src/lib/web-sentinel.js
// Autonomous Web Sentinel with DOM State Hashing.
// Enables background tracking of government portals, tender deadlines, scholarship updates,
// and e-commerce price drops using cryptographic state diffing.

import { sha256Hex } from './proposal-gate.js';

export const WATCH_CONDITIONS = {
  CHANGE: 'change',
  CONTAINS: 'contains',
  PRICE_DROP: 'price_drop',
};

/**
 * Extracts a numeric price from currency strings (supports ₹, $, €, £, Rs).
 */
export function parsePrice(text) {
  if (!text || typeof text !== 'string') return null;
  // Match currency symbols or abbreviations followed by numeric with commas/periods
  const match = text.match(/(?:[₹$€£]|rs\.?|inr)\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)/i);
  if (match && match[1]) {
    const cleaned = match[1].replace(/,/g, '');
    const num = parseFloat(cleaned);
    return Number.isFinite(num) ? num : null;
  }
  // Fallback: look for naked numbers if currency sign might be nearby
  const numMatch = text.match(/([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]{2})?|[0-9]{3,7}(?:\.[0-9]{2})?)/);
  if (numMatch && numMatch[1]) {
    const num = parseFloat(numMatch[1].replace(/,/g, ''));
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

/**
 * Normalizes text and generates a SHA-256 fingerprint of the visible content.
 */
export async function hashDomContent(text) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  return {
    normalized,
    hash: await sha256Hex(normalized),
  };
}

/**
 * Creates a persistent Sentinel Watch configuration.
 */
export function createWatchTarget({
  id,
  url,
  name,
  selector = 'body',
  condition = WATCH_CONDITIONS.CHANGE,
  value = '',
  intervalMinutes = 15,
}) {
  return {
    id: id || 'watch_' + Math.random().toString(36).slice(2, 10),
    url: String(url || ''),
    name: name || 'Page Watcher',
    selector,
    condition,
    value: String(value || ''),
    intervalMinutes: Math.max(1, Number(intervalMinutes) || 15),
    lastHash: null,
    lastCheckedAt: null,
    status: 'active', // 'active' | 'paused' | 'triggered'
    checksCount: 0,
  };
}

/**
 * Evaluates an observation against the watch target condition.
 */
export async function evaluateObservation({ watch, currentContent }) {
  if (!watch || typeof watch !== 'object') throw new Error('Invalid watch configuration');

  const { normalized, hash: currentHash } = await hashDomContent(currentContent);
  const previousHash = watch.lastHash;
  let triggered = false;
  let reason = '';
  let currentPrice = null;

  switch (watch.condition) {
    case WATCH_CONDITIONS.CHANGE: {
      if (previousHash && previousHash !== currentHash) {
        triggered = true;
        reason = `Content changed detected (Hash changed from ${previousHash.slice(0, 8)}... to ${currentHash.slice(0, 8)}...)`;
      }
      break;
    }

    case WATCH_CONDITIONS.CONTAINS: {
      const term = String(watch.value || '').toLowerCase();
      if (term && normalized.toLowerCase().includes(term)) {
        // Trigger if it wasn't already triggered or if content changed
        triggered = !previousHash || previousHash !== currentHash;
        reason = `Target phrase "${watch.value}" found in live page content.`;
      }
      break;
    }

    case WATCH_CONDITIONS.PRICE_DROP: {
      currentPrice = parsePrice(normalized);
      const targetThreshold = parseFloat(String(watch.value || '0').replace(/[^0-9.]/g, ''));
      if (currentPrice !== null && Number.isFinite(targetThreshold) && targetThreshold > 0) {
        if (currentPrice <= targetThreshold) {
          triggered = true;
          reason = `Price dropped to ₹${currentPrice} (Target threshold: ₹${targetThreshold})`;
        }
      }
      break;
    }

    default:
      throw new Error(`Unsupported watch condition: ${watch.condition}`);
  }

  const updatedWatch = {
    ...watch,
    lastHash: currentHash,
    lastCheckedAt: new Date().toISOString(),
    checksCount: (watch.checksCount || 0) + 1,
    lastPrice: currentPrice,
  };

  return {
    triggered,
    reason,
    currentHash,
    previousHash,
    currentPrice,
    updatedWatch,
    summary: normalized.slice(0, 300),
  };
}
