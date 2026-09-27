// TechyMindBench/trust-safety.test.js
// Enterprise Trust, Safety & Handover Benchmark Suite
// Validates:
// 1. Two-Phase Commit Proposal Gate (SHA-256 sealing, CAS approval, anti-tampering)
// 2. Human Handover Protocol (CAPTCHA / OTP detection & pause/resume handshake)
// 3. Web Sentinel (DOM State Hashing, price tracking, change triggers)
// 4. DPDP-Compliant Cryptographic Audit Ledger (tamper-evident hash chain & certificate)

import {
  createActionProposal,
  decideActionProposal,
  isHighRiskAction,
} from '../src/lib/proposal-gate.js';

import {
  detectHandoverNeed,
  createHandoverState,
  releaseHandover,
  BLOCKED_GATE_TYPES,
} from '../src/lib/handover-protocol.js';

import {
  parsePrice,
  hashDomContent,
  createWatchTarget,
  evaluateObservation,
  WATCH_CONDITIONS,
} from '../src/lib/web-sentinel.js';

import { AuditLedger } from '../src/lib/audit-ledger.js';

export async function run() {
  const results = [];

  function assert(name, condition, error = '') {
    results.push({ name, ok: Boolean(condition), error: condition ? undefined : (error || 'Condition failed') });
  }

  console.log('\n--- Running Enterprise Trust, Safety & Handover Suite ---');

  // ==========================================
  // Test 1: Proposal Gate Identification & Creation
  // ==========================================
  const highRisk1 = isHighRiskAction({ type: 'click', text: 'Buy Now' });
  const highRisk2 = isHighRiskAction({ type: 'payment_submit', value: '45000' });
  const safeAction = isHighRiskAction({ type: 'click', text: 'Read more reviews' });

  assert('Identifies high-risk payment actions', highRisk1 && highRisk2 && !safeAction);

  const proposal = await createActionProposal({
    actionType: 'buy_now',
    title: 'Confirm Purchase of Laptop (₹54,999)',
    targetUrl: 'https://store.example.com/checkout',
    targetSelector: 'button#btn-place-order',
    params: { amount: 54999, currency: 'INR', item: 'Dell XPS 15' },
  });

  assert('Creates proposal with SHA-256 seal', proposal.hash && proposal.hash.length === 64, `Hash: ${proposal.hash}`);
  assert('Proposal initial status is awaiting_review', proposal.status === 'awaiting_review');

  // ==========================================
  // Test 2: Proposal Approval & CAS State Transition
  // ==========================================
  let executedAction = false;
  const approvedProposal = await decideActionProposal({
    proposal: { ...proposal },
    decision: 'approve',
    storedHash: proposal.hash,
    onExecute: async (p) => {
      executedAction = true;
      return { orderId: 'ORD_99182' };
    },
  });

  assert('Approved proposal executes callback & sets succeeded', approvedProposal.status === 'succeeded' && executedAction);

  // ==========================================
  // Test 3: Proposal Tampering Detection
  // ==========================================
  let tamperingCaught = false;
  try {
    const tamperedProposal = {
      ...proposal,
      params: { amount: 999999, currency: 'INR' }, // Attacker modified price!
      hash: 'tampered_hash_that_does_not_match',
    };
    await decideActionProposal({
      proposal: tamperedProposal,
      decision: 'approve',
      storedHash: proposal.hash,
    });
  } catch (err) {
    if (err.message.includes('PROPOSAL_TAMPERED')) tamperingCaught = true;
  }
  assert('Rejects tampered proposal with PROPOSAL_TAMPERED error', tamperingCaught);

  // ==========================================
  // Test 4: Handover Protocol — Security Gate Detection
  // ==========================================
  const mockCaptchaDoc = {
    querySelector: (sel) => (sel.includes('recaptcha') ? { id: 'mock-recaptcha-frame' } : null),
  };
  const captchaCheck = detectHandoverNeed(mockCaptchaDoc);
  assert('Detects CAPTCHA security challenge', captchaCheck.needed && captchaCheck.type === BLOCKED_GATE_TYPES.CAPTCHA);

  const mockOtpDoc = {
    querySelector: (sel) => (sel.includes('one-time-code') || sel.includes('otp') ? { id: 'otp-input' } : null),
  };
  const otpCheck = detectHandoverNeed(mockOtpDoc);
  assert('Detects 2FA / OTP verification input', otpCheck.needed && otpCheck.type === BLOCKED_GATE_TYPES.OTP);

  // ==========================================
  // Test 5: Handover Protocol — Lifecycle (Pause & Resume)
  // ==========================================
  const handover = createHandoverState({
    type: BLOCKED_GATE_TYPES.OTP,
    reason: 'Please enter 6-digit Aadhaar OTP',
    targetSelector: 'input#otp',
    agentState: { task: 'Verify Digilocker Document', stepIndex: 3 },
  });

  assert('Handover state sets holder to human and awaiting_human', handover.holder === 'human' && handover.status === 'awaiting_human');

  const resumed = releaseHandover(handover);
  assert('Resumes agent control and resets holder to bot', resumed.holder === 'bot' && resumed.status === 'resumed' && Boolean(resumed.resumedAt));

  // ==========================================
  // Test 6: Web Sentinel — Currency Parsing
  // ==========================================
  assert('Parses Indian Rupee ₹ symbol correctly', parsePrice('Special Price: ₹45,999.00') === 45999);
  assert('Parses Rs. prefix correctly', parsePrice('M.R.P.: Rs. 1,299') === 1299);
  assert('Parses USD currency correctly', parsePrice('Deal price: $349.50') === 349.5);

  // ==========================================
  // Test 7: Web Sentinel — State Hashing & Diff Triggering
  // ==========================================
  const text1 = 'Seat availability: 0 seats remaining (Waiting List 42)';
  const text2 = 'Seat availability: 5 seats remaining (AVAILABLE)';

  const { hash: hash1 } = await hashDomContent(text1);
  const { hash: hash2 } = await hashDomContent(text2);
  assert('Generates distinct SHA-256 hashes for different page states', hash1 !== hash2);

  const watchTarget = createWatchTarget({
    id: 'irctc_tatkal_watch',
    url: 'https://irctc.co.in/availability',
    name: 'Tatkal Ticket Watcher',
    condition: WATCH_CONDITIONS.CHANGE,
  });
  watchTarget.lastHash = hash1;

  const obsResult = await evaluateObservation({
    watch: watchTarget,
    currentContent: text2,
  });

  assert('Fires change trigger when DOM state hash changes', obsResult.triggered && obsResult.currentHash === hash2);

  const priceWatch = createWatchTarget({
    id: 'laptop_deal',
    url: 'https://store.in/laptop',
    condition: WATCH_CONDITIONS.PRICE_DROP,
    value: '50000',
  });

  const priceObs = await evaluateObservation({
    watch: priceWatch,
    currentContent: 'Now available at special festive discount: ₹47,990',
  });
  assert('Triggers price drop notification when price <= threshold', priceObs.triggered && priceObs.currentPrice === 47990);

  // ==========================================
  // Test 8: DPDP Cryptographic Audit Ledger
  // ==========================================
  const ledger = new AuditLedger('test_session_101');

  await ledger.recordEntry({
    actionType: 'navigate',
    targetUrl: 'https://gov.in/scholarship',
    piiRedactedCount: 0,
    status: 'success',
    outcome: 'Navigated to scholarship portal',
  });

  await ledger.recordEntry({
    actionType: 'form_autofill',
    targetUrl: 'https://gov.in/scholarship/apply',
    targetSelector: 'form#application',
    piiRedactedCount: 3,
    piiCategories: ['Aadhaar', 'IncomeCertificate', 'Phone'],
    proposalHash: proposal.hash,
    status: 'success',
    outcome: 'Filled application with on-device ODVPA PII redaction',
  });

  const integrityCheck = await ledger.verifyIntegrity();
  assert('Audit ledger passes cryptographic hash chain integrity', integrityCheck.valid && integrityCheck.entriesCount === 2);

  // Tamper detection test
  ledger.entries[0].outcome = 'MODIFIED BY ATTACKER';
  const tamperedIntegrity = await ledger.verifyIntegrity();
  assert('Detects ledger tampering in hash chain', !tamperedIntegrity.valid && tamperedIntegrity.brokenIndex === 1);

  // Restore and generate certificate
  ledger.entries[0].outcome = 'Navigated to scholarship portal';
  const cert = await ledger.exportComplianceCertificate();
  assert('Exports valid DPDP Act 2023 compliance certificate', cert.certificateType === 'DPDP_ACT_2023_AUTONOMOUS_AUDIT_RECEIPT' && cert.chainIntegrityValid);

  const pass = results.every((r) => r.ok);
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  return {
    name: 'Enterprise Trust, Safety & Handover Protocol',
    pass,
    metrics: {
      passed,
      total: results.length,
      results,
    },
  };
}

// Direct execution in Node.js test runner
if (process.argv[1]?.endsWith('trust-safety.test.js')) {
  run().then((res) => {
    process.exit(res.pass ? 0 : 1);
  });
}
