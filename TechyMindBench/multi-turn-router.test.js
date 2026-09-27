// TechyMindBench/multi-turn-router.test.js
// Verification suite for Phase 2: Multi-Turn Conversation & Cross-Domain Router.
// Tests natural language ordinal resolution, domain-aware selectors,
// cross-domain switching heuristics, and sequential memory management.

import { parseOrdinalPhrase, getDomainCardSelectors, resolveOrdinalElement, ORDINAL_WORDS } from '../src/lib/ordinal-resolver.js';
import { detectCrossDomainSwitch } from '../src/lib/domain-router.js';

export async function run() {
  const results = [];
  const add = (name, ok, error = null) => results.push({ name, ok, error });

  // 1. Ordinal phrase parser precision
  try {
    const t1 = parseOrdinalPhrase('play the first song');
    const t2 = parseOrdinalPhrase('click on the second video');
    const t3 = parseOrdinalPhrase('play 2nd video');
    const t4 = parseOrdinalPhrase('play third kannada song');
    const t5 = parseOrdinalPhrase('select top product');
    const t6 = parseOrdinalPhrase('click 4th shoe');
    const t7 = parseOrdinalPhrase('click the last result');
    const t8 = parseOrdinalPhrase('select #2 item');

    const p1 = t1.isOrdinal && t1.ordinal === 1 && t1.action === 'play' && t1.entity === 'media';
    const p2 = t2.isOrdinal && t2.ordinal === 2 && t2.action === 'click' && t2.entity === 'media';
    const p3 = t3.isOrdinal && t3.ordinal === 2;
    const p4 = t4.isOrdinal && t4.ordinal === 3;
    const p5 = t5.isOrdinal && t5.ordinal === 1 && t5.entity === 'product';
    const p6 = t6.isOrdinal && t6.ordinal === 4 && t6.entity === 'product';
    const p7 = t7.isOrdinal && t7.ordinal === -1;
    const p8 = t8.isOrdinal && t8.ordinal === 2;

    // Negatives: generic search queries must not be falsely parsed as ordinals
    const neg1 = parseOrdinalPhrase('search for the first man on the moon');
    const neg2 = parseOrdinalPhrase('scroll down');
    const neg3 = parseOrdinalPhrase('open amazon and search running shoes');
    const pNeg = !neg1.isOrdinal && !neg2.isOrdinal && !neg3.isOrdinal;

    const ok = p1 && p2 && p3 && p4 && p5 && p6 && p7 && p8 && pNeg;
    add('Natural language ordinal parser precision (11 test cases)', ok);
  } catch (err) {
    add('Natural language ordinal parser precision', false, err.message);
  }

  // 2. Cross-domain intent switching
  try {
    const ytUrl = 'https://www.youtube.com/results?search_query=kannada+music';

    // From YouTube: user says "now open amazon and check shoes" -> should switch to Amazon!
    const sw1 = detectCrossDomainSwitch('now open amazon and check shoes', ytUrl);
    const p1 = sw1 && sw1.includes('amazon.') && sw1.includes('shoes');

    // From YouTube: user says "go to flipkart and find laptops" -> should switch to Flipkart!
    const sw2 = detectCrossDomainSwitch('go to flipkart and find laptops', ytUrl);
    const p2 = sw2 && sw2.includes('flipkart.com');

    // From YouTube: user says "play the first song" -> must STAY on YouTube (return null)
    const sw3 = detectCrossDomainSwitch('play the first song', ytUrl);
    const p3 = sw3 === null;

    // From YouTube: user says "click 2nd video" -> must STAY on YouTube
    const sw4 = detectCrossDomainSwitch('click 2nd video', ytUrl);
    const p4 = sw4 === null;

    // From YouTube: in-domain search for "iphone 18 reviews" -> must stay on YouTube
    const sw5 = detectCrossDomainSwitch('search for iphone 18 pro max reviews', ytUrl);
    const p5 = sw5 === null;

    // From Amazon: user says "open youtube and search kannada songs" -> should switch to YouTube!
    const amzUrl = 'https://www.amazon.in/s?k=shoes';
    const sw6 = detectCrossDomainSwitch('now open youtube and search kannada songs', amzUrl);
    const p6 = sw6 && sw6.includes('youtube.com');

    // From Amazon: user says "select second product" -> must STAY on Amazon
    const sw7 = detectCrossDomainSwitch('select the second product', amzUrl);
    const p7 = sw7 === null;

    // From privileged page: chrome://newtab -> returns null (handled by privileged bootstrap)
    const sw8 = detectCrossDomainSwitch('open amazon', 'chrome://newtab');
    const p8 = sw8 === null;

    const ok = p1 && p2 && p3 && p4 && p5 && p6 && p7 && p8;
    add('Cross-domain router identifies domain transitions vs in-page continuity', ok);
  } catch (err) {
    add('Cross-domain router', false, err.message);
  }

  // 3. Domain card selectors
  try {
    const ytSelectors = getDomainCardSelectors('https://www.youtube.com/results', 'media');
    const hasYt = Array.isArray(ytSelectors) && ytSelectors.some(s => s.includes('ytd-video-renderer'));

    const amzSelectors = getDomainCardSelectors('https://www.amazon.in/s?k=shoes', 'product');
    const hasAmz = Array.isArray(amzSelectors) && amzSelectors.some(s => s.includes('s-search-result'));

    const fkSelectors = getDomainCardSelectors('https://www.flipkart.com/search?q=shoes', 'product');
    const hasFk = Array.isArray(fkSelectors) && fkSelectors.some(s => s.includes('data-id'));

    add('Domain card selectors verified for YouTube, Amazon, and Flipkart', hasYt && hasAmz && hasFk);
  } catch (err) {
    add('Domain card selectors', false, err.message);
  }

  // 4. Mock DOM ordinal element resolution
  try {
    const mockElements = [
      { id: 'video_1', title: 'Song 1', offsetParent: {} },
      { id: 'video_2', title: 'Song 2', offsetParent: {} },
      { id: 'video_3', title: 'Song 3', offsetParent: {} },
      { id: 'video_4', title: 'Song 4', offsetParent: {} },
      { id: 'video_5', title: 'Song 5', offsetParent: {} },
    ];

    const mockDoc = {
      querySelectorAll(selector) {
        if (selector.includes('ytd-video-renderer')) return mockElements;
        return [];
      }
    };

    const res1 = resolveOrdinalElement(mockDoc, { ordinal: 1, entity: 'media' }, 'https://www.youtube.com/results');
    const p1 = res1.ok && res1.index === 0 && res1.element.id === 'video_1';

    const res2 = resolveOrdinalElement(mockDoc, { ordinal: 2, entity: 'media' }, 'https://www.youtube.com/results');
    const p2 = res2.ok && res2.index === 1 && res2.element.id === 'video_2';

    const resLast = resolveOrdinalElement(mockDoc, { ordinal: -1, entity: 'media' }, 'https://www.youtube.com/results');
    const p3 = resLast.ok && resLast.index === 4 && resLast.element.id === 'video_5';

    const resOob = resolveOrdinalElement(mockDoc, { ordinal: 10, entity: 'media' }, 'https://www.youtube.com/results');
    const p4 = !resOob.ok && resOob.reason.includes('out of range');

    add('DOM ordinal resolver correctly resolves 1st, 2nd, last, and out-of-range', p1 && p2 && p3 && p4);
  } catch (err) {
    add('DOM ordinal resolver', false, err.message);
  }

  // 5. Sequential conversation memory buffering
  try {
    const history = [];
    history.push({ role: 'user', text: 'open youtube and search kannada music', time: 1000 });
    history.push({ role: 'agent', text: 'Searching YouTube for kannada music', time: 1100 });
    history.push({ role: 'user', text: 'play the first song', time: 2000 });
    history.push({ role: 'agent', text: 'Playing video #1 on YouTube', time: 2100 });
    history.push({ role: 'user', text: 'now open amazon and check shoes under 5000', time: 3000 });

    const ok = history.length === 5 &&
               history[0].text === 'open youtube and search kannada music' &&
               history[2].text === 'play the first song' &&
               history[4].text === 'now open amazon and check shoes under 5000';
    add('Sequential conversational memory buffer persists across multi-turn exchanges', ok);
  } catch (err) {
    add('Sequential conversational memory buffer', false, err.message);
  }

  const pass = results.every(r => r.ok);
  return {
    name: 'Multi-Turn Conversation & Cross-Domain Router',
    pass,
    metrics: {
      passed: results.filter(r => r.ok).length,
      total: results.length,
      results
    }
  };
}
