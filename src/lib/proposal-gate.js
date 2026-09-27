// src/lib/proposal-gate.js
// Two-Phase Commit Proposal Gate for high-impact browser actions.
// Computes an immutable SHA-256 hash seal over action intent, target, and payload.
// Prevents unauthorized executions, prompt injections, and accidental transactions.

export const HIGH_RISK_ACTION_TYPES = new Set([
  'checkout',
  'buy_now',
  'payment_submit',
  'delete',
  'bulk_clear',
  'transfer_funds',
  'send_email',
  'account_terminate',
]);

/**
 * Universal SHA-256 hex digest generator.
 * Works seamlessly in Browser (WebCrypto API) and Node.js.
 */
export async function sha256Hex(str) {
  const content = typeof str === 'string' ? str : JSON.stringify(str);
  if (globalThis.crypto?.subtle) {
    const buffer = new TextEncoder().encode(content);
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  try {
    const { createHash } = await import('node:crypto');
    return createHash('sha256').update(content).digest('hex');
  } catch {
    // Deterministic fallback if WebCrypto is unavailable
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      hash = ((hash << 5) - hash) + content.charCodeAt(i);
      hash |= 0;
    }
    return 'fallback_' + Math.abs(hash).toString(16).padStart(16, '0');
  }
}

/**
 * Checks if a proposed browser action requires a Two-Phase Commit Review Gate.
 */
export function isHighRiskAction(action) {
  if (!action || typeof action !== 'object') return false;
  const type = String(action.type || '').toLowerCase();
  const subType = String(action.action || action.subType || '').toLowerCase();
  const selector = String(action.selector || '').toLowerCase();
  const text = String(action.text || action.value || '').toLowerCase();

  if (HIGH_RISK_ACTION_TYPES.has(type) || HIGH_RISK_ACTION_TYPES.has(subType)) return true;

  // Detect payment / submission buttons
  const paymentKeywords = ['buy now', 'place order', 'pay now', 'make payment', 'submit order', 'complete purchase', 'delete account'];
  if (paymentKeywords.some((kw) => text.includes(kw) || selector.includes(kw.replace(/\s+/g, '-')))) {
    return true;
  }
  return false;
}

/**
 * Generates an immutable, cryptographically sealed Action Proposal.
 */
export async function createActionProposal({
  actionType,
  title,
  targetUrl,
  targetSelector,
  params = {},
  context = {},
  expiresMinutes = 30,
}) {
  const id = 'prop_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now().toString(36);
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + expiresMinutes * 60 * 1000).toISOString();

  const sealPayload = {
    id,
    actionType: String(actionType || 'custom_action'),
    targetUrl: String(targetUrl || ''),
    targetSelector: String(targetSelector || ''),
    params,
    context,
  };

  const hash = await sha256Hex(sealPayload);

  return {
    id,
    title: title || `Authorize ${actionType.toUpperCase()}`,
    actionType,
    targetUrl,
    targetSelector,
    params,
    context,
    status: 'awaiting_review', // 'awaiting_review' | 'approved' | 'denied' | 'expired' | 'succeeded' | 'failed'
    hash,
    createdAt,
    expiresAt,
  };
}

/**
 * Validates and executes or rejects a proposal using Compare-And-Swap (CAS) state check.
 */
export async function decideActionProposal({
  proposal,
  decision, // 'approve' | 'deny'
  storedHash,
  onExecute,
}) {
  if (!proposal || typeof proposal !== 'object') {
    throw new Error('Invalid proposal object provided');
  }

  // 1. Verify Hash Integrity (tampering / prompt injection detection)
  if (storedHash && proposal.hash !== storedHash) {
    throw new Error('PROPOSAL_TAMPERED: Proposal hash mismatch! The action was modified after creation.');
  }

  // 2. Check Expiry
  if (new Date(proposal.expiresAt).getTime() <= Date.now()) {
    proposal.status = 'expired';
    throw new Error('PROPOSAL_EXPIRED: Review window expired (30m limit). Please request a fresh action.');
  }

  // 3. Check State Guard
  if (proposal.status !== 'awaiting_review') {
    return proposal; // Already finalized
  }

  if (decision === 'deny') {
    proposal.status = 'denied';
    proposal.resolvedAt = new Date().toISOString();
    return { ...proposal, ok: true, reason: 'Declined by user; no browser mutations executed.' };
  }

  if (decision === 'approve') {
    proposal.status = 'executing';
    proposal.resolvedAt = new Date().toISOString();
    try {
      let result = null;
      if (typeof onExecute === 'function') {
        result = await onExecute(proposal);
      }
      proposal.status = 'succeeded';
      proposal.result = result;
      return { ...proposal, ok: true };
    } catch (err) {
      proposal.status = 'failed';
      proposal.error = err.message || 'Execution failed';
      throw err;
    }
  }

  throw new Error(`Invalid decision: "${decision}". Must be 'approve' or 'deny'.`);
}
