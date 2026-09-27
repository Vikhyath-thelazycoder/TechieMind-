// ══════════════════════════════════════════════════════════════════════════
// TechyMind — Visual Agency Content Overlay Controller
// Provides:
//   1. Physics-smoothed AI Gliding Cursor (`#techymind-ai-cursor`)
//   2. Element Target Bracket Highlighter (`#techymind-target-highlight`)
//   3. High-contrast multi-ring click ripples
//   4. Floating micro-status badges
// ══════════════════════════════════════════════════════════════════════════

(function (global) {
  'use strict';

  // Guard against double initialization
  if (typeof window !== 'undefined' && (window.__techymindVisualOverlayInjected || window.__opencometVisualOverlayInjected)) {
    return;
  }
  if (typeof window !== 'undefined') {
    window.__techymindVisualOverlayInjected = true;
    window.__opencometVisualOverlayInjected = true;
  }

  // High-tech Arrow Pointer SVG with aerospace styling
  const CURSOR_SVG = `
    <svg class="techymind-cursor-svg" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="tmCursorGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#38bdf8" />
          <stop offset="100%" stop-color="#0284c7" />
        </linearGradient>
        <filter id="tmGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>
      <!-- Sleek Cybernetic Arrow -->
      <path d="M4 3L11.5 24L15.5 15.5L24 11.5L4 3Z" 
            fill="url(#tmCursorGrad)" 
            stroke="#ffffff" 
            stroke-width="1.5" 
            stroke-linejoin="round"
            filter="url(#tmGlow)" />
      <polygon points="11,14.5 15.5,15.5 14.5,11" fill="#ffffff" opacity="0.8" />
      <circle cx="4" cy="3" r="2.5" fill="#f59e0b" stroke="#ffffff" stroke-width="1" />
    </svg>
  `;

  let cursorEl = null;
  let cursorPulseEl = null;
  let cursorBadgeEl = null;
  let cursorBadgeDot = null;
  let cursorBadgeText = null;

  let targetHighlightEl = null;
  let targetFillEl = null;
  let targetHeaderEl = null;
  let targetHeaderDot = null;
  let targetHeaderText = null;

  let currentCursorX = -100;
  let currentCursorY = -100;
  let cursorIdleTimer = null;
  let highlightTimer = null;

  // ── 1. Create or retrieve Gliding AI Cursor DOM ──
  function ensureCursor() {
    if (typeof document === 'undefined' || !document.documentElement) return null;
    if (cursorEl && cursorEl.isConnected) return cursorEl;

    cursorEl = document.getElementById('techymind-ai-cursor');
    if (!cursorEl) {
      cursorEl = document.createElement('div');
      cursorEl.id = 'techymind-ai-cursor';
      // Alias id attribute for backward compatibility
      cursorEl.setAttribute('data-alias', '__techymind_cursor__');
      cursorEl.innerHTML = `
        ${CURSOR_SVG}
        <div class="techymind-cursor-pulse"></div>
        <div id="techymind-cursor-badge">
          <span class="techymind-badge-dot"></span>
          <span class="techymind-badge-text">Agent</span>
        </div>
      `;

      const parent = document.body || document.documentElement;
      parent.appendChild(cursorEl);
    }

    cursorPulseEl = cursorEl.querySelector('.techymind-cursor-pulse');
    cursorBadgeEl = cursorEl.querySelector('#techymind-cursor-badge');
    cursorBadgeDot = cursorEl.querySelector('.techymind-badge-dot');
    cursorBadgeText = cursorEl.querySelector('.techymind-badge-text');

    return cursorEl;
  }

  // ── 2. Create or retrieve Target Bracket Highlighter DOM ──
  function ensureTargetHighlight() {
    if (typeof document === 'undefined' || !document.documentElement) return null;
    if (targetHighlightEl && targetHighlightEl.isConnected) return targetHighlightEl;

    targetHighlightEl = document.getElementById('techymind-target-highlight');
    if (!targetHighlightEl) {
      targetHighlightEl = document.createElement('div');
      targetHighlightEl.id = 'techymind-target-highlight';
      targetHighlightEl.setAttribute('data-alias', '__techymind_target_highlight__');
      targetHighlightEl.className = 'techymind-theme-action';
      targetHighlightEl.innerHTML = `
        <div class="techymind-corner-bracket techymind-corner-tl"></div>
        <div class="techymind-corner-bracket techymind-corner-tr"></div>
        <div class="techymind-corner-bracket techymind-corner-bl"></div>
        <div class="techymind-corner-bracket techymind-corner-br"></div>
        <div class="techymind-target-fill"></div>
        <div class="techymind-target-header">
          <span class="techymind-header-dot"></span>
          <span class="techymind-header-text">Target</span>
        </div>
      `;

      const parent = document.body || document.documentElement;
      parent.appendChild(targetHighlightEl);
    }

    targetFillEl = targetHighlightEl.querySelector('.techymind-target-fill');
    targetHeaderEl = targetHighlightEl.querySelector('.techymind-target-header');
    targetHeaderDot = targetHighlightEl.querySelector('.techymind-header-dot');
    targetHeaderText = targetHighlightEl.querySelector('.techymind-header-text');

    return targetHighlightEl;
  }

  // ── 3. Gliding Cursor Movement ──
  function moveCursor(x, y, options = {}) {
    const el = ensureCursor();
    if (!el) return;

    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    // Viewport bounds clamp
    const vw = (typeof window !== 'undefined' && window.innerWidth) || 1280;
    const vh = (typeof window !== 'undefined' && window.innerHeight) || 800;
    const cx = Math.max(2, Math.min(vw - 10, x));
    const cy = Math.max(2, Math.min(vh - 10, y));

    currentCursorX = cx;
    currentCursorY = cy;

    // Set transition duration if specified
    const durationMs = options.durationMs || 260;
    el.style.transition = `transform ${durationMs}ms cubic-bezier(0.22, 1, 0.36, 1), opacity 0.2s ease`;

    // Apply transform translation
    el.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
    el.classList.add('techymind-cursor-visible');
    el.classList.add('techymind-cursor-pulsing');

    // Badge label
    if (options.label && cursorBadgeEl && cursorBadgeText) {
      cursorBadgeText.textContent = options.label.slice(0, 36);
      cursorBadgeEl.classList.add('techymind-badge-visible');
    } else if (cursorBadgeEl) {
      cursorBadgeEl.classList.remove('techymind-badge-visible');
    }

    // Schedule click animation if requested
    if (options.clickAfter) {
      setTimeout(() => {
        animateClick(cx, cy, options.theme || 'action');
      }, durationMs);
    }

    // Auto-hide cursor after idle delay (3.5s)
    if (cursorIdleTimer) clearTimeout(cursorIdleTimer);
    cursorIdleTimer = setTimeout(() => {
      if (cursorEl) {
        cursorEl.classList.remove('techymind-cursor-visible');
        cursorEl.classList.remove('techymind-cursor-pulsing');
        cursorBadgeEl?.classList.remove('techymind-badge-visible');
      }
    }, 3500);
  }

  // ── 4. Click Animation & Ripple ──
  function animateClick(x, y, theme = 'action') {
    const el = ensureCursor();
    if (el) {
      el.classList.add('techymind-cursor-clicking');
      el.style.transform = `translate3d(${currentCursorX}px, ${currentCursorY}px, 0) scale(0.82)`;
      setTimeout(() => {
        if (el) {
          el.classList.remove('techymind-cursor-clicking');
          el.style.transform = `translate3d(${currentCursorX}px, ${currentCursorY}px, 0) scale(1)`;
        }
      }, 160);
    }

    showClickRipple(x ?? currentCursorX, y ?? currentCursorY, theme);
  }

  function showClickRipple(x, y, theme = 'action') {
    if (typeof document === 'undefined') return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    try {
      const ripple = document.createElement('div');
      ripple.className = `techymind-click-ripple ${theme === 'success' ? 'ripple-success' : ''}`;
      ripple.style.left = `${x}px`;
      ripple.style.top = `${y}px`;

      const parent = document.body || document.documentElement;
      parent.appendChild(ripple);

      setTimeout(() => {
        ripple.remove();
      }, 700);
    } catch {}
  }

  // ── 5. Target Element Bracket Highlighter ──
  function highlightElement(rect, options = {}) {
    const el = ensureTargetHighlight();
    if (!el || !rect) return;

    const pad = options.padding !== undefined ? options.padding : 4;
    const l = Math.max(0, (rect.left ?? rect.x ?? 0) - pad);
    const t = Math.max(0, (rect.top ?? rect.y ?? 0) - pad);
    const w = Math.max(16, (rect.width ?? rect.w ?? 24) + pad * 2);
    const h = Math.max(16, (rect.height ?? rect.h ?? 24) + pad * 2);

    // Apply color state
    const colorState = options.colorState || (options.sensitive ? 'pii' : 'action');
    el.className = `techymind-theme-${colorState}`;

    // Position bracket
    el.style.left = `${l}px`;
    el.style.top = `${t}px`;
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    el.classList.add('techymind-target-visible');

    // Header label
    if (targetHeaderEl && targetHeaderText) {
      if (options.label) {
        targetHeaderText.textContent = options.label.slice(0, 48);
        targetHeaderEl.style.display = 'inline-flex';
      } else {
        targetHeaderEl.style.display = 'none';
      }
    }

    // Auto-clear duration
    if (highlightTimer) clearTimeout(highlightTimer);
    const duration = options.durationMs || 3000;
    if (duration > 0) {
      highlightTimer = setTimeout(() => {
        clearHighlight();
      }, duration);
    }
  }

  function clearHighlight() {
    if (targetHighlightEl) {
      targetHighlightEl.classList.remove('techymind-target-visible');
    }
  }

  // ── 6. Full Action Feedback Dispatch ──
  function handleTargetAction(payload) {
    if (!payload) return;

    const { rect, label, sensitive, actionType, clickX, clickY } = payload;

    // 1. Highlight the target element bounding box
    if (rect) {
      highlightElement(rect, {
        colorState: sensitive ? 'pii' : (actionType === 'click' ? 'action' : 'safe'),
        label: label || (actionType === 'click' ? 'Click target' : 'Input target'),
        durationMs: 3200,
      });
    }

    // 2. Determine target coordinate for AI Cursor
    let tx = clickX;
    let ty = clickY;
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) {
      if (rect) {
        tx = (rect.left ?? rect.x ?? 0) + (rect.width ?? rect.w ?? 0) / 2;
        ty = (rect.top ?? rect.y ?? 0) + (rect.height ?? rect.h ?? 0) / 2;
      }
    }

    // 3. Glide cursor smoothly to target
    if (Number.isFinite(tx) && Number.isFinite(ty)) {
      moveCursor(tx, ty, {
        durationMs: 250,
        clickAfter: actionType === 'click',
        theme: sensitive ? 'pii' : 'action',
        label: label || (actionType === 'click' ? 'Clicking' : 'Typing'),
      });
    }
  }

  // ── 7. Chrome Runtime Message Listener ──
  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!msg || typeof msg.type !== 'string') return;

      switch (msg.type) {
        case 'TECHYMIND_MOVE_CURSOR': {
          moveCursor(msg.x, msg.y, {
            durationMs: msg.durationMs || 260,
            clickAfter: !!msg.clickAfter,
            theme: msg.theme || 'action',
            label: msg.label || '',
          });
          sendResponse?.({ ok: true });
          break;
        }

        case 'TECHYMIND_HIGHLIGHT_ELEMENT': {
          highlightElement(msg.rect || msg.bounds, {
            colorState: msg.colorState,
            sensitive: !!msg.sensitive,
            label: msg.label || '',
            durationMs: msg.durationMs || 3000,
          });
          sendResponse?.({ ok: true });
          break;
        }

        case 'TECHYMIND_CLEAR_HIGHLIGHT': {
          clearHighlight();
          sendResponse?.({ ok: true });
          break;
        }

        case 'TECHYMIND_TARGET_ACTION':
        case 'TECHYMIND_ACTION_FEEDBACK': {
          handleTargetAction(msg);
          sendResponse?.({ ok: true });
          break;
        }

        case 'SHOW_CLICK_RIPPLE':
        case 'ACTION_CLICK_FEEDBACK': {
          const rx = msg.x ?? currentCursorX;
          const ry = msg.y ?? currentCursorY;
          showClickRipple(rx, ry, msg.theme || 'action');
          sendResponse?.({ ok: true });
          break;
        }

        case 'AGENT_DONE':
        case 'AGENT_STOPPED':
        case 'AGENT_ERROR':
        case 'CHAT_RESET': {
          clearHighlight();
          if (cursorEl) {
            cursorEl.classList.remove('techymind-cursor-visible');
            cursorBadgeEl?.classList.remove('techymind-badge-visible');
          }
          sendResponse?.({ ok: true });
          break;
        }

        default:
          break;
      }
    });
  }

  // Export public controller on window
  const controller = {
    ensureCursor,
    ensureTargetHighlight,
    moveCursor,
    animateClick,
    showClickRipple,
    highlightElement,
    clearHighlight,
    handleTargetAction,
  };

  if (typeof window !== 'undefined') {
    window.__techymindVisualOverlay = controller;
    window.__opencometVisualOverlay = controller;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.__techymindVisualOverlay = controller;
  }

  // Export for testing in Node / benchmark suites
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = controller;
  }
  if (typeof exports !== 'undefined') {
    exports.default = controller;
  }

})(typeof globalThis !== 'undefined' ? globalThis : this);
