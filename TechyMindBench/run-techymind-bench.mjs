#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// TechyMindBench/run-opencomet-bench.mjs — ONE-COMMAND AUTO-RUN for the whole
// OpenComet-Bench suite, executed against OpenComet itself (the real unpacked
// extension, loaded into a real Chromium by the E2E/ADVERSARIAL/BROWSER
// harnesses — no mocks for the pipeline, only for the decision brain where the
// tier says so).
//
//   node TechyMindBench/run-opencomet-bench.mjs               # UNIT + E2E
//   node TechyMindBench/run-opencomet-bench.mjs --unit        # Node suites only
//   node TechyMindBench/run-opencomet-bench.mjs --adversarial # + adversarial
//   node TechyMindBench/run-opencomet-bench.mjs --browser     # + browser harness
//   node TechyMindBench/run-opencomet-bench.mjs --all         # every tier
//   node TechyMindBench/run-opencomet-bench.mjs --json        # machine summary
//
// This script is a thin ORCHESTRATOR: every measurement still comes from the
// real per-tier harnesses (run-all.js, run-e2e.mjs, run-adversarial.mjs,
// browser/harness.mjs). Nothing here asserts, estimates, or fabricates a
// number — the summary it writes only republishes each child's own verdict and
// the path of the report file the child produced.
//
// Exit code 0 = every tier that RAN passed. A tier that could not run
// (e.g. playwright not installed) is reported as SKIPPED with its reason and
// does not fail the run unless --strict is passed.
// ─────────────────────────────────────────────────────────────────────────────
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BENCH_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(BENCH_DIR, '..');            // project root (the extension itself)
const RESULTS = join(BENCH_DIR, 'results');

const args = process.argv.slice(2);
const want = (flag) => args.includes(flag);
const asJson = want('--json');
const strict = want('--strict');
const ALL_TIERS = ['unit', 'e2e', 'adversarial', 'browser'];

let tiers;
if (want('--all')) tiers = ALL_TIERS;
else {
  tiers = ALL_TIERS.filter((t) => want(`--${t}`));
  if (tiers.length === 0) tiers = ['unit', 'e2e'];   // sensible default
}

const FLAG = { unit: 35, e2e: 34, adversarial: 36, browser: 33 };
const RESET = '\x1b[0m';
const bold = (s) => `\x1b[1m${s}${RESET}`;
const tag = (t) => `${bold(`[${t.toUpperCase()}]`)}`;
const pad = (s, n) => String(s).padEnd(n);

function playwrightAvailable() {
  const probe = spawnSync(
    process.execPath,
    ['-e', "import('playwright').then(()=>console.log('ok')).catch(()=>process.exit(3))"],
    { cwd: ROOT, encoding: 'utf8', timeout: 60_000 },
  );
  return probe.status === 0;
}

/** Newest report file in TechyMindBench/results/ whose name starts with `prefix`. */
function newestReport(prefix) {
  let best = null;
  let bestM = -1;
  for (const f of readdirSync(RESULTS)) {
    if (!f.startsWith(prefix) || !f.endsWith('.json')) continue;
    const m = Number(f.slice(prefix.length, -'.json'.length)) || 0;
    if (m > bestM) { bestM = m; best = f; }
  }
  return best;
}

/**
 * Snapshot every report filename currently in results/. Compared against the
 * post-run listing so a tier can only ever be credited with a report ITS OWN
 * run produced.
 *
 * Without this, a child that dies before writing (port clash, Chromium launch
 * failure) leaves `newestReport()` pointing at the PREVIOUS run's file, and the
 * summary republishes that stale tier's numbers as if they were this run's —
 * e.g. reporting "privacy 12/12 · injection 11/11" for a tier that never
 * executed. That breaks the orchestrator's core contract (see the header:
 * "every verdict comes verbatim from the child harness").
 */
function snapshotReports() {
  return new Set(readdirSync(RESULTS));
}

/** Verdict fields copied VERBATIM from a child report (no recomputation). */
function verdictFor(tier, reportFile) {
  if (!reportFile) return {};
  try {
    const j = JSON.parse(readFileSync(join(RESULTS, reportFile), 'utf8'));
    if (tier === 'adversarial') {
      return {
        privacy: j.privacy ? `${j.privacy.passed}/${j.privacy.n}` : undefined,
        injection: j.injection ? `${j.injection.passed}/${j.injection.n}` : undefined,
      };
    }
    if (tier === 'e2e') {
      return {
        tasks: j.aggregate?.steps != null ? `${j.scenarios?.length ?? '?'} tasks · ${j.aggregate.steps} steps` : undefined,
        taskSuccessRatio: j.aggregate?.taskSuccessRatio,
        verifiedActionRatio: j.aggregate?.verifiedActionRatio,
      };
    }
    if (tier === 'browser') return { metaType: j.meta?.type, environment: j.meta?.environment?.label ?? j.meta?.environment?.kind };
  } catch { /* report unreadable — summary still names the file */ }
  return {};
}

function runTier(tier) {
  const t0 = Date.now();
  const spec = {
    unit: { cmd: process.execPath, args: [join(BENCH_DIR, 'run-all.js'), '--json'], capture: true },
    e2e: { cmd: process.execPath, args: [join(BENCH_DIR, 'e2e', 'run-e2e.mjs')], needsPlaywright: true },
    adversarial: { cmd: process.execPath, args: [join(BENCH_DIR, 'e2e', 'run-adversarial.mjs')], needsPlaywright: true },
    browser: { cmd: process.execPath, args: [join(BENCH_DIR, 'browser', 'harness.mjs')], needsPlaywright: true },
  }[tier];

  if (spec.needsPlaywright && !playwrightAvailable()) {
    return { tier, status: 'SKIPPED', reason: 'playwright is not installed in this checkout (npm i playwright) — tier not run', durationMs: 0 };
  }

  // Remember what existed BEFORE this child ran, so its report can be told
  // apart from a leftover file of the same tier.
  const before = snapshotReports();

  const res = spawnSync(spec.cmd, spec.args, {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 30 * 60_000,
    maxBuffer: 64 * 1024 * 1024,
  });

  if (tier === 'unit') {
    // run-all.js --json prints the measured JSON on stdout — persist it verbatim.
    mkdirSync(RESULTS, { recursive: true });
    let parsed = null;
    try { parsed = JSON.parse(res.stdout); } catch { /* non-JSON output — keep raw below */ }
    const file = join(RESULTS, `unit-${Date.now()}.json`);
    writeFileSync(file, parsed ? JSON.stringify(parsed, null, 2) : String(res.stdout || ''));
    const failed = (parsed?.results || []).filter((r) => !r.pass).map((r) => r.name);
    return {
      tier,
      status: res.status === 0 ? 'PASS' : 'FAIL',
      report: file,
      suites: parsed?.results?.length,
      failedSuites: failed.length ? failed : undefined,
      durationMs: Date.now() - t0,
      ...(res.status !== 0 ? { stderr: String(res.stderr || '').slice(-800) } : {}),
    };
  }

  const prefix = { e2e: 'e2e-benchmark-', adversarial: 'adversarial-benchmark-', browser: 'browser-benchmark-' }[tier];
  // Only credit a report this child actually wrote. `newestReport()` alone
  // would hand back the previous run's file whenever the child dies first, and
  // the summary would then advertise a stale tier's numbers under this run's
  // name — reporting a phantom "12/12 pass" for a harness that never ran.
  const candidate = newestReport(prefix);
  const report = candidate && !before.has(candidate) ? candidate : null;
  const missingOwnReport = !report;

  return {
    tier,
    status: res.status === 0 ? 'PASS' : 'FAIL',
    report: report ? join('TechyMindBench', 'results', report) : undefined,
    ...verdictFor(tier, report),
    durationMs: Date.now() - t0,
    ...(missingOwnReport
      ? { noOwnReport: true, reason: res.status === 0
          ? `tier exited 0 but wrote no new ${prefix}* report — treating as FAIL, not crediting a stale file`
          : `tier exited ${res.status} and wrote no new ${prefix}* report (stale reports ignored)` }
      : {}),
    ...(res.status !== 0 ? { stderr: String(res.stderr || '').slice(-800) } : {}),
  };
}

// ── run ──
mkdirSync(RESULTS, { recursive: true });
if (!asJson) {
  console.log(bold('\n  TechyMind-Bench — validation suite'));
  console.log(`  tiers: ${tiers.join(' · ')}   (project: ${ROOT})\n`);
}

const results = [];
for (const tier of tiers) {
  if (!asJson) console.log(`${tag(tier)} running…`);
  const r = runTier(tier);
  results.push(r);
  // A tier that wrote no report of its own never produced a verdict, so it
  // cannot be reported as PASS no matter what exit code it returned.
  if (r.noOwnReport && r.status === 'PASS') r.status = 'FAIL';
  if (!asJson) {
    const verdict = [r.privacy && `privacy ${r.privacy}`, r.injection && `injection ${r.injection}`,
      r.taskSuccessRatio != null && `taskSuccess ${r.taskSuccessRatio}`, r.verifiedActionRatio != null && `verifiedActions ${r.verifiedActionRatio}`,
      r.suites != null && `${r.suites} suites`, r.environment, r.reason]
      .filter(Boolean).join(' · ');
    console.log(`${tag(tier)} ${bold(r.status)}  ${verdict}${r.report ? `\n         report: ${r.report}` : ''}${r.failedSuites ? `\n         failed: ${r.failedSuites.join(', ')}` : ''}\n`);
  }
}

const ran = results.filter((r) => r.status !== 'SKIPPED');
const allPass = ran.length > 0 && ran.every((r) => r.status === 'PASS');
const summary = {
  meta: {
    type: 'techymind-bench-summary',
    generatedAt: new Date().toISOString(),
    tiers,
    note: 'Orchestrator republish — every verdict and report path comes verbatim from the per-tier harness output; nothing is recomputed or asserted here.',
  },
  results,
  allRanTiersPassed: allPass,
};

const outFile = join(RESULTS, `techymind-bench-summary-${Date.now()}.json`);
writeFileSync(outFile, JSON.stringify(summary, null, 2));

if (asJson) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log('──────────────────────────────────────────────────────────────────');
  for (const r of results) console.log(`  ${pad(r.tier.toUpperCase(), 13)} ${r.status}${r.report ? `  → ${r.report}` : ''}`);
  console.log(`  ${allPass ? 'ALL RUN TIERS PASS' : 'FAILURES PRESENT (see above)'}${ran.length < results.length ? `  · ${results.length - ran.length} skipped` : ''}`);
  console.log(`  summary: ${outFile}`);
  console.log('  Validation reports generated in TechyMindBench/results/');
  console.log('──────────────────────────────────────────────────────────────────\n');
}

process.exit(allPass || (!strict && ran.length === 0) ? 0 : 1);
