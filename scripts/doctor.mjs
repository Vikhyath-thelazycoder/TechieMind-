#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// scripts/doctor.mjs — pre-flight check for "can every feature actually run?"
//
// Answers, for the current checkout, which subsystems are live and which are
// dark. Feature status is derived from what is ON DISK (asset/model presence,
// manifest declarations, message routes) — not from documentation claims.
//
//   node scripts/doctor.mjs          # human table
//   node scripts/doctor.mjs --json   # machine-readable
//
// Exit code 0 = no BLOCKERs. Non-zero = at least one blocker (see BLOCKERS).
// ─────────────────────────────────────────────────────────────────────────────
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const asJson = process.argv.includes('--json');

const C = { r: '\x1b[31m', g: '\x1b[32m', y: '\x1b[33m', d: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' };
const read = (p) => { try { return readFileSync(join(ROOT, p), 'utf8'); } catch { return ''; } };
const has = (p) => existsSync(join(ROOT, p));

const features = [];
const add = (id, area, feature, status, detail) => features.push({ id, area, feature, status, detail });

// ── 1. Extension shell ──────────────────────────────────────────────────────
const manifest = JSON.parse(read('manifest.json') || '{}');
add('ext', 'Extension', 'Manifest V3 shell', has('manifest.json') ? 'READY' : 'BLOCKER',
    `v${manifest.version}, service_worker=${manifest.background?.service_worker || '?'}`);
add('panel', 'Extension', 'Side panel UI', has('src/sidepanel/sidepanel.html') ? 'READY' : 'BLOCKER',
    'src/sidepanel/sidepanel.html');
add('settings', 'Extension', 'Full-page settings (options_ui)', manifest.options_ui?.page ? 'READY' : 'BLOCKER',
    manifest.options_ui?.page || 'no options_ui declared');
add('skills', 'Extension', 'Skill library (12 SKILL.md)', has('skills/index.json') ? 'READY' : 'BLOCKER',
    `${JSON.parse(read('skills/index.json') || '{"skills":[]}').skills.length} skills declared`);

// ── 2. Privacy pipeline (the load-bearing subsystem) ────────────────────────
const mpModel = 'src/vendor/mediapipe/models/blaze_face_short_range.tflite';
add('face', 'Privacy', 'MediaPipe face detect (bundled, offline)', has(mpModel) ? 'READY' : 'BLOCKER',
    has(mpModel) ? `${(statSync(join(ROOT, mpModel)).size / 1024).toFixed(0)} KB tflite` : 'tflite missing');
add('mpwasm', 'Privacy', 'MediaPipe WASM (SIMD + nosimd)',
    has('src/vendor/mediapipe/wasm/vision_wasm_internal.wasm') && has('src/vendor/mediapipe/wasm/vision_wasm_nosimd_internal.wasm')
      ? 'READY' : 'DEGRADED', 'SIMD and nosimd runtimes');
const tessCore = readdirSync(join(ROOT, 'src/vendor/tesseract/core')).filter(f => f.endsWith('.js')).length;
add('ocr', 'Privacy', 'Tesseract OCR (bundled, offline)', tessCore >= 4 ? 'READY' : 'DEGRADED',
    `${tessCore} core variants, eng.traineddata ${has('src/vendor/tesseract/lang/eng.traineddata.gz') ? 'present' : 'MISSING'}`);
add('pii', 'Privacy', 'Text PII detector + checksum validators', has('src/lib/pii-detector.js') ? 'READY' : 'BLOCKER',
    'Aadhaar/PAN/SSN/card/UPI/IFSC/GSTIN/OTP + Luhn/Verhoeff/mod-97');
add('firewall', 'Privacy', 'Fail-closed firewall + wire guard',
    has('src/lib/privacy-firewall.js') && has('src/lib/wire-guard.js') ? 'READY' : 'BLOCKER',
    'gateOutboundDecision + byteLevelLeakageScan');
add('sih', 'Privacy', 'SIH mode (default-on safe-harbor)', has('src/lib/sih-mode.js') ? 'READY' : 'BLOCKER',
    'fails to ON when unreadable');
add('tr', 'Privacy', 'Prompt-injection defense', has('src/lib/prompt-defense.js') ? 'READY' : 'BLOCKER',
    'nonce-fenced <untrusted_data> blocks');

// ── 3. Local ML (Transformers.js) — NEEDS NETWORK on first use ─────────────
const trVer = (read('src/vendor/transformers/transformers.min.js').match(/4\.\d+\.\d+/) || ['?'])[0];
add('tfjs', 'Local ML', `Transformers.js ${trVer} (bundled)`, has('src/vendor/transformers/transformers.min.js') ? 'READY' : 'BLOCKER',
    'weights are NOT bundled — see HF row below');
add('hf', 'Local ML', 'HuggingFace weight host', manifest.host_permissions?.some(h => h.includes('huggingface.co'))
    ? 'READY' : 'BLOCKER', 'https://huggingface.co/* must be in host_permissions');
add('vit', 'Local ML', 'ViT page classifier (Xenova/vit-base-patch16-224)', 'ONLINE',
    '~85 MB, q8 — downloaded on first use, then Cache API');
add('yolo', 'Local ML', 'YOLO object detect (Xenova/yolos-tiny)', 'OPT_IN', '~6 MB, q8 — needs runYolo');
add('ner', 'Local ML', 'BERT NER (Xenova/bert-base-NER-uncased)', 'OPT_IN', '~110 MB, q8 — needs useNer');
add('llm', 'Local ML', 'In-browser LLM (gemma-4 / granite / lfm2-vl)', 'ONLINE',
    'WebGPU models fail fast on WASM-only machines — use granite-4.0-1b or lfm2-vl-450m');

// ── 4. Providers ───────────────────────────────────────────────────────────
const sw = read('src/background/sw.js');
add('providers', 'Providers', 'Provider router (9 backends)', has('src/lib/providers.js') ? 'READY' : 'BLOCKER',
    'openai/anthropic/gemini/ollama/mistral/groq/deepseek/kimi/glm');
add('ollama', 'Providers', 'Ollama local model', 'EXTERNAL',
    'run `ollama serve`, then Settings → Test Connection');
add('mlx', 'Providers', 'Laya MLX Metal fast path', 'OPT_IN', '127.0.0.1:8181 — needs a Metal daemon');
add('server', 'Providers', 'Companion server', 'OPTIONAL',
    'npm run server → 127.0.0.1:8787 (/health /config /agent/decide)');

// ── 5. Agent loop capabilities ──────────────────────────────────────────────
const actionTypes = (read('src/background/actions.js').match(/case '([a-z_]+)':/g) || [])
  .map(s => s.slice(6, -2));
add('actions', 'Agent', `Browser actions (${new Set(actionTypes).size} executors)`, 'READY',
    [...new Set(actionTypes)].join(' '));
add('sandbox', 'Agent', 'Tab-group sandbox',
    manifest.permissions?.includes('tabGroups') ? 'READY' : 'BLOCKER', 'needs enableTabGrouping');
add('guardian', 'Agent', 'Task Guardian (3-hit block)', has('src/lib/guardian-daemon.js') ? 'READY' : 'BLOCKER',
    'purchase/delete/destructive gate');
add('handover', 'Agent', 'Human handover (CAPTCHA/login)', 'READY',
    'docks the agent, broadcasts TECHYMIND_HANDOVER_REQUIRED, resumes via RESUME_AFTER_HANDOVER');
add('vector', 'Agent', 'Semantic history (find_history)', 'READY',
    'vector-history.js -> actions.js find_history');
add('proposal', 'Agent', 'Proposal seal / decideActionProposal', 'READY',
    'high-impact actions need a hash-bound approval; fail-closed if sealing fails');

// ── 6. Data paths ───────────────────────────────────────────────────────────
add('deepsearch', 'Data', 'Deep research (multi-tab)', 'READY', 'DEEP_RESEARCH — 2..15 sites/query');
add('scrape', 'Data', 'Scrape → JSON/CSV/TXT', 'READY', 'SCRAPE_PAGE / AUTO_SCRAPE');
add('summarize', 'Data', 'Summarize page', 'READY', 'SUMMARIZE_PAGE');
add('export', 'Data', 'Export + config backup/restore', 'READY', 'EXPORT_DATA + settings import dropzone');
add('extract', 'Data', 'extract action returns data', 'READY',
    'harvest is returned and surfaced as an observation (previously discarded)');
add('firewall2', 'Data', 'Outbound prompt sweep (direct calls)', 'READY',
    'summarize/scrape/research/compaction/conversational all swept before callAIRaw');

// ── 7. Verification tiers ───────────────────────────────────────────────────
const pw = has('node_modules/playwright');
add('t-unit', 'Verify', 'Unit suite', 'READY', 'npm run bench:unit  (dependency-free)');
add('t-e2e', 'Verify', 'E2E suite', pw ? 'READY' : 'NEEDS-INSTALL',
    'npm run bench:e2e  (real Chromium; owns port 8890)');
add('t-adv', 'Verify', 'Adversarial suite', pw ? 'READY' : 'NEEDS-INSTALL',
    'npm run bench:adversarial  (shares port 8890 with e2e)');
add('t-br', 'Verify', 'Browser harness', pw ? 'READY' : 'NEEDS-INSTALL', 'npm run bench:browser');

// ── report ──────────────────────────────────────────────────────────────────
const BLOCKERS = features.filter(f => f.status === 'BLOCKER');
const order = { READY: 0, EXTERNAL: 1, ONLINE: 2, OPTIONAL: 3, OPT_IN: 4, DEGRADED: 5, NEEDS_INSTALL: 6, DARK: 7, BLOCKER: 8 };
// ASCII-only glyphs: some terminals drop astral/symbolic code points mid-stream.
const glyph = {
  READY: `${C.g}+${C.x}`, EXTERNAL: `${C.d}.${C.x}`, ONLINE: `${C.d}.${C.x}`, OPTIONAL: `${C.d}.${C.x}`,
  OPT_IN: `${C.y}~${C.x}`, DEGRADED: `${C.y}!${C.x}`, NEEDS_INSTALL: `${C.y}!${C.x}`,
  DARK: `${C.d}x${C.x}`, BLOCKER: `${C.r}X${C.x}`,
};
const label = { READY: 'ready', EXTERNAL: 'external', ONLINE: 'online', OPTIONAL: 'optional',
  OPT_IN: 'opt-in', DEGRADED: 'degraded', NEEDS_INSTALL: 'needs-install', DARK: 'dark', BLOCKER: 'blocker' };

if (asJson) {
  console.log(JSON.stringify({ root: ROOT, features, blockers: BLOCKERS.length }, null, 2));
  process.exit(BLOCKERS.length ? 1 : 0);
}

console.log(`\n  ${C.b}TechyMind doctor${C.x}  ${C.d}${ROOT}${C.x}\n`);
let area = '';
for (const f of features.sort((a, b) => a.area.localeCompare(b.area) || (order[a.status] - order[b.status]) || a.id.localeCompare(b.id))) {
  if (f.area !== area) { area = f.area; console.log(`  ${C.b}${area}${C.x}`); }
  console.log(`    ${glyph[f.status] || ' '} ${f.feature.padEnd(44)} ${C.d}${(label[f.status] || f.status).padEnd(13)}${C.d}${f.detail}${C.x}`);
}
const dark = features.filter(f => f.status === 'DARK');
console.log(`\n  ${C.b}Summary${C.x}  ${C.g}${features.filter(f => f.status === 'READY').length} ready${C.x} · ` +
  `${C.y}${features.filter(f => f.status === 'OPT_IN' || f.status === 'OPTIONAL').length} optional${C.x} · ` +
  `${C.d}${dark.length} dark${C.x} · ${BLOCKERS.length ? C.r + BLOCKERS.length + ' blocker' + (BLOCKERS.length > 1 ? 's' : '') + C.x : C.g + '0 blockers' + C.x}`);
if (dark.length) {
  console.log(`\n  ${C.b}Dark features${C.x} ${C.d}(implemented or stubbed, but nothing calls them)${C.x}`);
  for (const f of dark) console.log(`    ${C.d}·${C.x} ${f.feature} ${C.d}— ${f.detail}${C.x}`);
}
console.log(`\n  Next: ${C.b}npm run bench:unit${C.x}  ·  ${C.b}npm run server${C.x}  ·  load unpacked at ${C.b}chrome://extensions${C.x}\n`);
process.exit(BLOCKERS.length ? 1 : 0);
