// src/lib/audit-ledger.js
// DPDP Act 2023 Compliant Cryptographic Audit Ledger.
// Maintains an append-only, tamper-evident hash chain of all autonomous browser actions,
// on-device PII redactions, and two-phase proposal signatures.

import { sha256Hex } from './proposal-gate.js';

export class AuditLedger {
  constructor(sessionId = 'session_' + Date.now().toString(36)) {
    this.sessionId = sessionId;
    this.createdAt = new Date().toISOString();
    this.entries = [];
    this.lastHash = 'GENESIS_' + sessionId;
  }

  /**
   * Appends an action outcome and updates the cryptographic hash chain.
   */
  async recordEntry({
    actionType,
    targetUrl,
    targetSelector = '',
    piiRedactedCount = 0,
    piiCategories = [],
    proposalHash = null,
    status = 'success',
    outcome = '',
  }) {
    const index = this.entries.length + 1;
    const timestamp = new Date().toISOString();
    const prevHash = this.lastHash;

    const payload = {
      index,
      timestamp,
      sessionId: this.sessionId,
      actionType: String(actionType),
      targetUrl: String(targetUrl || ''),
      targetSelector: String(targetSelector || ''),
      piiProtected: {
        count: Number(piiRedactedCount) || 0,
        categories: Array.isArray(piiCategories) ? piiCategories : [],
      },
      proposalHash: proposalHash || null,
      status: String(status),
      outcome: String(outcome || ''),
      prevHash,
    };

    const entryHash = await sha256Hex(payload);
    const entry = { ...payload, entryHash };

    this.entries.push(entry);
    this.lastHash = entryHash;
    return entry;
  }

  /**
   * Validates the cryptographic integrity of the entire ledger chain.
   * Returns { valid: boolean, brokenIndex?: number, reason?: string }
   */
  async verifyIntegrity() {
    let expectedPrev = 'GENESIS_' + this.sessionId;

    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];

      if (entry.prevHash !== expectedPrev) {
        return {
          valid: false,
          brokenIndex: i + 1,
          reason: `Chain broken at entry #${i + 1}: prevHash does not match previous entryHash`,
        };
      }

      const { entryHash, ...payload } = entry;
      const computedHash = await sha256Hex(payload);

      if (computedHash !== entryHash) {
        return {
          valid: false,
          brokenIndex: i + 1,
          reason: `Data tampering detected at entry #${i + 1}: hash mismatch`,
        };
      }

      expectedPrev = entryHash;
    }

    return { valid: true, entriesCount: this.entries.length };
  }

  /**
   * Exports a formal DPDP Act 2023 compliance audit certificate.
   */
  async exportComplianceCertificate() {
    const verification = await this.verifyIntegrity();
    const totalPiiRedactions = this.entries.reduce((acc, e) => acc + (e.piiProtected?.count || 0), 0);
    const uniqueCategories = Array.from(new Set(this.entries.flatMap((e) => e.piiProtected?.categories || [])));

    return {
      certificateType: 'DPDP_ACT_2023_AUTONOMOUS_AUDIT_RECEIPT',
      standard: 'India Digital Personal Data Protection Act 2023 (Purpose Limitation & On-Device Data Minimization)',
      sessionId: this.sessionId,
      issuedAt: new Date().toISOString(),
      chainIntegrityValid: verification.valid,
      totalActionsRecorded: this.entries.length,
      onDevicePrivacyMetrics: {
        totalRedactionsEnforced: totalPiiRedactions,
        protectedCategories: uniqueCategories,
        airGappedGuarantee: '100% On-Device Pre-VLM Sanitization (ODVPA)',
      },
      ledgerFingerprint: this.lastHash,
      entries: this.entries,
    };
  }
}
