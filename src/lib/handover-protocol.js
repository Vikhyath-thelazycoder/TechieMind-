// src/lib/handover-protocol.js
// Human-Agent Handover Protocol for security gates, CAPTCHAs, and 2FA/OTPs.
// Automatically recognizes when autonomous browser control must yield to the user,
// docks the agent cursor with an amber indicator, and resumes seamlessly after user verification.

export const BLOCKED_GATE_TYPES = {
  CAPTCHA: 'captcha',
  OTP: 'otp',
  BIOMETRIC_2FA: 'biometric_2fa',
};

/**
 * Inspects a DOM tree, document, or collection of element descriptors for security blockers.
 * Returns { needed: boolean, type?: string, reason?: string, targetSelector?: string }
 */
export function detectHandoverNeed(root = globalThis.document) {
  if (!root) return { needed: false };

  // 1. CAPTCHA detection
  const captchaSelectors = [
    'iframe[src*="recaptcha"]',
    'iframe[src*="hcaptcha"]',
    'iframe[src*="challenges.cloudflare.com"]',
    'iframe[title*="reCAPTCHA" i]',
    '.g-recaptcha',
    '.h-captcha',
    '#turnstile-wrapper',
    'div[data-sitekey]',
    '[aria-label*="recaptcha" i]',
  ];

  for (const sel of captchaSelectors) {
    const el = root.querySelector ? root.querySelector(sel) : null;
    if (el) {
      return {
        needed: true,
        type: BLOCKED_GATE_TYPES.CAPTCHA,
        reason: 'Security CAPTCHA challenge detected (Cloudflare / reCAPTCHA / hCaptcha). Human interaction required.',
        targetSelector: sel,
      };
    }
  }

  // 2. OTP / 2FA input detection
  const otpSelectors = [
    'input[autocomplete="one-time-code"]',
    'input[name*="otp" i]',
    'input[id*="otp" i]',
    'input[placeholder*="otp" i]',
    'input[aria-label*="otp" i]',
    'input[name*="2fa" i]',
    'input[id*="2fa" i]',
    'input[maxlength="6"][inputmode="numeric"]',
    'input[maxlength="6"][pattern*="[0-9]"]',
  ];

  for (const sel of otpSelectors) {
    const el = root.querySelector ? root.querySelector(sel) : null;
    if (el) {
      return {
        needed: true,
        type: BLOCKED_GATE_TYPES.OTP,
        reason: 'Two-Factor Authentication (OTP / Security Code) requested. Please enter the code sent to your device.',
        targetSelector: sel,
      };
    }
  }

  // 3. Textual prompt check on visible security warnings
  const bodyText = root.body ? root.body.innerText || '' : '';
  if (/enter the 6-digit code|enter otp sent to|complete the security check to continue/i.test(bodyText.slice(0, 15000))) {
    return {
      needed: true,
      type: BLOCKED_GATE_TYPES.OTP,
      reason: 'Security verification prompt found on page. Awaiting user completion.',
      targetSelector: 'input[type="text"], input[type="number"], input[type="tel"]',
    };
  }

  return { needed: false };
}

/**
 * Initializes a structured Handover State Machine snapshot.
 */
export function createHandoverState({
  type = BLOCKED_GATE_TYPES.CAPTCHA,
  reason = 'Security verification checkpoint reached.',
  targetSelector = '',
  agentState = {},
}) {
  return {
    id: 'handover_' + Math.random().toString(36).slice(2, 10),
    holder: 'human', // 'human' | 'bot'
    status: 'awaiting_human', // 'awaiting_human' | 'resumed' | 'cancelled'
    type,
    reason,
    targetSelector,
    requestedAt: new Date().toISOString(),
    resumedAt: null,
    checkpoint: {
      task: agentState.task || '',
      stepIndex: agentState.stepIndex || 0,
      activeUrl: agentState.activeUrl || '',
      plan: agentState.plan || [],
    },
  };
}

/**
 * Releases control back to the autonomous bot.
 */
export function releaseHandover(handoverState) {
  if (!handoverState || typeof handoverState !== 'object') {
    throw new Error('Invalid handoverState provided to releaseHandover');
  }
  return {
    ...handoverState,
    holder: 'bot',
    status: 'resumed',
    resumedAt: new Date().toISOString(),
  };
}
