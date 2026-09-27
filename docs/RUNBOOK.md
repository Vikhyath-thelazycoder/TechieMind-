# TechyMind — Feature Runbook

How to bring **every** feature into play, and how to verify each one actually ran.
Companion to `scripts/doctor.mjs` (which reports what is live vs. dark in your checkout).

---

## 0. Preflight

```bash
npm run doctor          # what is ready / optional / dark, from disk truth
npm run doctor -- --json
```

`doctor` exits non-zero only on a **blocker** (missing vendored model, missing manifest
entry). Dark features are reported but do not fail the run.

---

## 1. Start the pieces

```bash
# Terminal 1 — optional companion server (port 8787)
npm run server                 # node server/server.js
npm run server:dev             # --watch
curl -s localhost:8787/health
curl -s localhost:8787/config

# Terminal 2 — local LLM (only if you want a fully-local run)
ollama serve
curl -s localhost:11434/api/tags

# Terminal 3 — Laya MLX Metal fast path (optional, Apple Silicon, port 8181)
# then Settings → Privacy: point "MLX Metal Daemon URL" at it
```

The extension itself is not a dev server. Load it once:

1. `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select the repo root (the folder containing `manifest.json`)
3. Pin **TechyMind** and open the side panel
4. After every source change: hit the ⟳ reload button, then reopen the panel

---

## 2. Configure so nothing silently no-ops

`Settings ↗` (top-right of the side panel) opens the full-page options tab.

| To enable | Do this |
|---|---|
| Any AI task | **AI & Models → Ollama → Test Connection** (green dot), then pick a model |
| Vision / classification | Automatic on first capture; weights pull from `huggingface.co` (~85 MB ViT) |
| YOLO object detection | `doctor` marks it opt-in: it needs `runYolo` in the privacy config |
| BERT NER | opt-in: needs `useNer` |
| OCR visual-PII | opt-in: needs `ocrPii` |
| Tab-group sandbox | **Privacy & Vision → Chrome Tab Groups Sandbox** |
| Vision speed | **Privacy & Vision → Speed Profile**: `fast` / `balanced` / `quality` |
| Voice input | **AI & Models → Voice**; mic permission may need a click on the gear |
| Voice output | **AI & Models → Voice → Enable Voice Responses** |
| Deep research keys | **Research → Brave / LangSearch / Serper** (optional; browser mode works without) |

> WebGPU-only local LLMs (gemma-4-*) **fail fast with a clear message** on WASM-only
> machines rather than downloading 2.3 GB first. Use `granite-4.0-1b` or
> `lfm2-vl-450m` there.

---

## 3. Exercise the side panel

### Task modes (composer dropdown)

| Mode | What it runs | Message |
|---|---|---|
| **Search** | Full agent loop with the privacy firewall | `PRIVACY_START` |
| **Deep Search** | Multi-tab research, synthesized report | `DEEP_RESEARCH` |
| **Scrape** | Structured extraction | `SCRAPE_PAGE` / `AUTO_SCRAPE` |

### Permission mode (⚡ / 🤔 toggle)

- **Ask before acting** — every plan and protected action needs a card click
- **Act without asking** — runs straight through (default)

### Quick-action cards (empty state)

| Card | Effect |
|---|---|
| **Summaries** | `SUMMARIZE_PAGE` on the current tab |
| **Extract Data** | Scrape mode + structured extraction |
| **Deep Research** | Deep Search mode |
| **Private Run** | Forces privacy on for one run |
| **Settings & AI Models** | Opens the options page |

### Voice & attachments

- 🎤 — Web Speech STT. Language cycles `EN → HI → KN`.
- 🔊 — TTS of the final answer (needs the settings toggle).
- 📎 — attach `image/*`, `.pdf`, `.txt`, `.csv`, `.json`; also drag-and-drop onto the composer.

### Human handover (CAPTCHA / OTP)

When the sanitized page text matches `captcha | recaptcha | turnstile | enter the
6-digit code | otp`, the privacy loop **docks**: it broadcasts
`TECHYMIND_HANDOVER_REQUIRED`, the panel renders an amber
`✋ Human Handover Required` card, and the agent stops acting until you resolve
it in the tab. The card's buttons are now actually routed:

- **Resume Agent** → `RESUME_AFTER_HANDOVER`
- **Stop Task** → `STOP_TASK`

The dock also releases on the global Stop button, and times out honestly after
5 minutes.

### High-impact actions (proposal seal)

Purchase / delete / transfer-shaped actions are sealed with a SHA-256 hash
before they run. With Ask mode on, the seal is bound to your approval: approve
it and the hash must still match at execution time, so an action mutated in
between is refused. If the seal cannot be produced the action does not run at
all — this gate fails closed.

To see it, ask the agent to buy or delete something on a fixture page and watch
for `🔒 Action Proposal Gate: … sealed [SHA-256: …]`.

### In-panel Privacy view (top nav → **Privacy**)

This is where the diagnostics live:

- **Privacy & Vision →** the privacy-test button, the **SIH scorecard**, and the
  **live inspector** table (populated after a capture).
- **Live Inspector** shows total/backend/faces/DOM-sensitive/text-PII/redactions for
  the last capture.
- **SIH Scorecard** → *Import benchmark JSON…* to load any report from
  `TechyMindBench/results/` (tier is auto-detected from `meta.type`).

---

## 4. Skills

Skills live in `skills/<id>/SKILL.md` and are surfaced two ways:

- **Slash menu** — type `/` in the composer and pick one.
- **Active skills bar** — the chips above the composer; `Clear all` resets.

Auto-detection is separate: the service worker scores the task against skill keywords
and host preferences, and activates at most 2 automatically. Activation is
**in-memory only** — it resets when the side panel is reloaded. This is by design,
not a bug.

All 12: `summarize-page`, `deep-research`, `extract-data`, `compare-prices`,
`fill-form`, `find-alternatives`, `manage-bookmarks`, `monitor-page`,
`organize-tabs`, `read-later`, `save-page`, `screenshot-walkthrough`.

Create/edit/delete custom skills in **Settings ↗ → Skills** (or the in-panel
Privacy → Skills page).

---

## 5. Verification suites

```bash
npm run bench:unit          # dependency-free, ~seconds  ← start here
npm run bench:e2e           # real Chromium, owns port 8890
npm run bench:adversarial   # injection + privacy, ALSO port 8890
npm run bench:browser       # pixel/geometry harness
npm run bench:all           # all four, serially
```

> **Do not run `bench:e2e` and `bench:adversarial` concurrently** — both bind
> `127.0.0.1:8890` and the second one dies with `EADDRINUSE`.
> `bench:all` runs them serially and is safe.
>
> **Never run two bench invocations at the same time, at all** (not even
> `bench:unit` alongside `bench:all`). They race on the report filenames in
> `TechyMindBench/results/` and corrupt each other's JSON. One bench at a time.

### Hermeticity: two things that silently hijack the browser tiers

Both browser tiers previously `delete settings.provider` to force the
companion-server path. **That never worked**, and there were two independent
reasons. Both are now fixed in the harnesses; understand them before trusting a
green run.

**1. `isProviderConfigured()` was always true.**
`getSettings()` returns `{ ...DEFAULT_SETTINGS, ...stored }`. Deleting the
`provider` key leaves `DEFAULT_SETTINGS.provider === 'ollama'` in force, and
`resolveOllamaBaseUrl()` falls back to a hardcoded `http://127.0.0.1:11434`. So
the loop took the *direct provider* branch and called a non-running Ollama:

```
✗ ollama/gemma3:12b · 2ms · NETWORK error — offline, blocked, or DNS failure
[TechyMind] Privacy agent error: Failed to fetch
```

Every scenario died at step 0. The harnesses now set `provider: 'none'` — an
explicit non-special value — which is the only way to make the check return
`false`.

**2. The Laya MLX Metal reflex.**
A local daemon on `127.0.0.1:8181` answers each turn in ~4 ms with a
high-confidence guess and short-circuits the server before it is ever called:

```
[TechyMind] ⚡ MLX Metal Reflex HIT (13.17ms, conf=1.00) -> target: #continue-btn
```

Both harnesses now `delete settings.mlxFastPath; delete settings.mlxFastPathEnabled`.

**Symptoms that a run was hijacked:** `vlmMs_mock.p50` in single digits, floods
of `MLX Metal Reflex HIT`, or `Failed to fetch` against `ollama/…`. A real run
through the mock server shows `vlmMs_mock` in the hundreds and a
`backend: recorder (scripted)`.

Both harnesses also now exit non-zero when `taskSuccessRatio < 0.5`,
`executionSuccessRatio < 0.5`, or zero steps were observed — so a vacuous run
can no longer report success.

Reports land in `TechyMindBench/results/` and are importable straight into the
in-panel SIH scorecard.

> Older `unit-*.json` reports in `results/` (the 8192-byte and 8282-byte ones)
> were **truncated invalid JSON** and would not import. They predate a fix in
> `TechyMindBench/run-all.js`, where `process.exit()` ran immediately after a
> ~20 KB stdout write and killed the process before a pipe flushed. Those files
> have been deleted; current reports are ~26 KB and parse cleanly.
> `TechyMindBench/results/` is now gitignored — reports are run artifacts.

> The orchestrator also refuses to credit a tier with somebody else's report:
> it snapshots the results directory before each tier and only reads a report
> the child actually wrote. A crashed child is reported as `FAIL`, never as a
> stale `12/12` pass.

Per-tier entry points, if you want to run a harness directly:

```bash
node TechyMindBench/run-all.js --json
node TechyMindBench/e2e/run-e2e.mjs
node TechyMindBench/e2e/run-adversarial.mjs
node TechyMindBench/e2e/run-e2e-real.mjs
node TechyMindBench/browser/harness.mjs
node TechyMindBench/probe-pii.mjs
node TechyMindBench/debug-pii.mjs
```

---

## 6. Demo pages (diagnostics launchers)

**Settings ↗ → Diagnostics** has buttons that open bundled pages. Open them
directly if you prefer:

| Page | Path | What it proves |
|---|---|---|
| PII lab | `TechyMindBench/pages/redaction-lab.html` | redaction geometry |
| Government form | `TechyMindBench/pages/gov-form.html` | form-field redaction + autofill |
| Checkout | `TechyMindBench/pages/checkout.html` | card/CVV blackout |
| Dashboard | `TechyMindBench/dashboard.html` | aggregate bench results |
| Canvas app | `TechyMindBench/pages/canvas-app.html` | canvas pixel redaction |
| SVG controls | `TechyMindBench/pages/svg-controls.html` | SVG element handling |
| Banking | `TechyMindBench/pages/banking.html` | mixed PII |
| Login | `TechyMindBench/pages/login.html` | credential masking |
| Mixed UI | `TechyMindBench/pages/mixed-ui.html` | broad element tagging |

The privacy suite has dedicated adversarial pages under
`TechyMindBench/e2e/adversarial/` (`priv-aadhaar.html`, `priv-card.html`,
`priv-otp.html`, `priv-face.html`, `inj-dom-direct.html`, …).

---

## 7. Debugging

| Symptom | Where to look |
|---|---|
| Service worker died mid-run | `chrome://extensions` → **service worker** link → Console. Crash recovery clears the stale run snapshot and logs the error. |
| Side panel errors | DevTools for the panel itself |
| Content-script errors | DevTools on the *page* being automated (not the panel) |
| Model/ML logs | Panel console — `LOCAL_MODEL_LOG` / `DIAG_LOG` are relayed there |
| Privacy blocked a turn | The step says *"Privacy firewall BLOCKED the network request: …"*. This is the fail-closed path working. The reason names the failed check. |
| Nothing happens on Send | Check `doctor` for a missing provider, then `isProviderConfigured` |

Model weights are cached in the Cache API bucket `transformers-cache`. To force a
re-download, clear that bucket from the panel's DevTools → Application → Cache Storage.

---

## 8. Firefox

```bash
npm run build:firefox      # -> dist/firefox (62.8 MB)
```

Then `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** →
`dist/firefox/manifest.json`. The build runs 10 drift guards that verify every
Chrome-only code path has a feature-detect, and fails the build if one is missing.
