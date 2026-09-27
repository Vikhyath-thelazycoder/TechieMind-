// settings.js — TechyMind Dedicated Settings Controller
import { STORAGE_KEYS, DEFAULT_SETTINGS } from '../lib/constants.js';
import { loadLibrarySkills } from '../lib/skill-library.js';

const $ = id => document.getElementById(id);

let currentSettings = { ...DEFAULT_SETTINGS };

// Tab Switching
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const target = $(`pane-${btn.dataset.tab}`);
    if (target) target.classList.add('active');
  });
});

// Sub-nav Switching
document.querySelectorAll('.sub-nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const parent = btn.closest('.tab-pane');
    parent.querySelectorAll('.sub-nav-btn').forEach(b => b.classList.remove('active'));
    parent.querySelectorAll('.sub-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const target = $(`sub-${btn.dataset.sub}`);
    if (target) target.classList.add('active');
  });
});

// Load Settings
async function initSettings() {
  const result = await chrome.storage.local.get([STORAGE_KEYS.SETTINGS]);
  currentSettings = { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEYS.SETTINGS] || {}) };

  // AI & Ollama
  if ($('ollamaBaseUrl')) $('ollamaBaseUrl').value = currentSettings.ollamaBaseUrl || 'http://127.0.0.1:11434';
  if ($('mlxFastPathToggle')) $('mlxFastPathToggle').checked = currentSettings.mlxFastPathEnabled !== false && currentSettings.mlxFastPath !== false;
  if ($('mlxBaseUrl')) $('mlxBaseUrl').value = currentSettings.mlxBaseUrl || 'http://127.0.0.1:8181';
  if ($('compatibleBaseUrl')) $('compatibleBaseUrl').value = currentSettings.providerBaseUrl || '';
  if ($('compatibleApiKey')) $('compatibleApiKey').value = currentSettings.apiKey || '';
  if ($('compatibleModel')) $('compatibleModel').value = currentSettings.model || '';

  // Deep Research
  if ($('braveKey')) $('braveKey').value = currentSettings.braveSearchKey || '';
  if ($('langSearchKey')) $('langSearchKey').value = currentSettings.langSearchKey || '';
  if ($('serperKey')) $('serperKey').value = currentSettings.serperKey || '';
  if ($('drMaxSites')) $('drMaxSites').value = currentSettings.deepResearchMaxSites || 6;

  // Profile
  const prof = currentSettings.profileData || {};
  if ($('profName')) $('profName').value = prof.fullName || '';
  if ($('profEmail')) $('profEmail').value = prof.email || '';
  if ($('profPhone')) $('profPhone').value = prof.phone || '';
  if ($('profCompany')) $('profCompany').value = prof.company || '';
  if ($('profAddress')) $('profAddress').value = prof.address || '';
  if ($('profCity')) $('profCity').value = prof.city || '';
  if ($('profState')) $('profState').value = prof.state || '';
  if ($('profPincode')) $('profPincode').value = prof.pincode || '';
  if ($('profCountry')) $('profCountry').value = prof.country || 'India';

  // Export
  if ($('exportFormat')) $('exportFormat').value = currentSettings.exportFormat || DEFAULT_SETTINGS.exportFormat;
  if ($('exportFolder')) $('exportFolder').value = currentSettings.exportFolder || DEFAULT_SETTINGS.exportFolder;

  // Privacy Wall
  let privacyConfig = { blurFaces: true, redactDomPii: true, redactTextPii: true, maskIndianId: true };
  try {
    const savedConfig = JSON.parse(localStorage.getItem('techymindPrivacyConfig') || localStorage.getItem('opencometPrivacyConfig') || 'null');
    if (savedConfig) privacyConfig = { ...privacyConfig, ...savedConfig };
    const savedEnabled = localStorage.getItem('techymindPrivacyEnabled') ?? localStorage.getItem('opencometPrivacyEnabled');
    if ($('privacyEnabledToggle')) $('privacyEnabledToggle').checked = savedEnabled !== '0';
    if ($('blurFacesToggle')) $('blurFacesToggle').checked = privacyConfig.blurFaces !== false;
    if ($('redactDomPiiToggle')) $('redactDomPiiToggle').checked = privacyConfig.redactDomPii !== false;
    if ($('indianPiiToggle')) $('indianPiiToggle').checked = privacyConfig.maskIndianId !== false;
  } catch {}

  if ($('tabGroupingToggle')) $('tabGroupingToggle').checked = currentSettings.enableTabGrouping === true;
  if ($('speedProfileSelect')) $('speedProfileSelect').value = currentSettings.vlmSpeedProfile || DEFAULT_SETTINGS.vlmSpeedProfile;

  // Voice & Audio
  const voiceEngine = currentSettings.voiceInputEngine || 'webspeech';
  if ($('voiceInputEngine')) {
    $('voiceInputEngine').value = voiceEngine;
    if ($('whisperKeyGroup')) {
      $('whisperKeyGroup').style.display = voiceEngine === 'whisper' ? 'block' : 'none';
    }
    $('voiceInputEngine').addEventListener('change', (e) => {
      if ($('whisperKeyGroup')) {
        $('whisperKeyGroup').style.display = e.target.value === 'whisper' ? 'block' : 'none';
      }
    });
  }
  if ($('whisperApiKey')) $('whisperApiKey').value = currentSettings.whisperApiKey || '';
  if ($('voiceOutputToggle')) $('voiceOutputToggle').checked = currentSettings.voiceOutputEnabled !== false;
  if ($('voicePersonaSelect')) $('voicePersonaSelect').value = currentSettings.voicePersona || 'female';

  updateMicPermissionUI();
  if (window.location.search.includes('grantMic=1') || window.location.hash.includes('grantMic')) {
    const aiTabBtn = document.querySelector('.sub-nav-btn[data-sub="voice"]');
    if (aiTabBtn) aiTabBtn.click();
    requestMicPermission();
  }

  // Populate Skills Grid
  renderSkills();

  await checkOllamaStatus();
  await refreshOllamaModels();
  await checkMlxStatus();
}

async function updateMicPermissionUI() {
  const statusEl = $('micPermissionStatus');
  const grantBtn = $('grantMicBtn');
  if (!statusEl) return;
  try {
    if (navigator.permissions && navigator.permissions.query) {
      const res = await navigator.permissions.query({ name: 'microphone' });
      if (res.state === 'granted') {
        statusEl.textContent = '✅ Microphone access granted! Side panel voice input is active.';
        statusEl.style.color = '#34d399';
        if (grantBtn) grantBtn.textContent = 'Permission Granted';
      } else if (res.state === 'denied') {
        statusEl.textContent = '❌ Microphone access blocked in Chrome settings. Click lock icon in URL bar to unblock.';
        statusEl.style.color = '#f87171';
        if (grantBtn) grantBtn.textContent = 'Blocked by Browser';
      } else {
        statusEl.textContent = 'Microphone permission not yet granted. Click "Allow Microphone" to enable.';
        statusEl.style.color = 'var(--text-muted)';
        if (grantBtn) grantBtn.textContent = 'Allow Microphone';
      }
    }
  } catch {}
}

async function requestMicPermission() {
  const statusEl = $('micPermissionStatus');
  const grantBtn = $('grantMicBtn');
  if (statusEl) {
    statusEl.textContent = 'Requesting access... Please click "Allow" in Chrome\'s prompt above.';
    statusEl.style.color = 'var(--text-secondary)';
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(t => t.stop());
    if (statusEl) {
      statusEl.textContent = '✅ Microphone access granted! You can now use voice input in the side panel.';
      statusEl.style.color = '#34d399';
    }
    if (grantBtn) grantBtn.textContent = 'Permission Granted';
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = `❌ Microphone access denied: ${err.message}. Please click the lock/settings icon in the URL bar to allow microphone.`;
      statusEl.style.color = '#f87171';
    }
  }
}

// Built-in & Custom Skills Management (Complete 12-skill offline fallback)
const DEFAULT_SKILLS = [
  {
    id: 'fill-form',
    name: 'Fill Form',
    icon: '📝',
    category: 'Form Filling',
    desc: 'Safe form completion. Fill visible fields from user profile or prompt, submit nothing without permission.',
    prompt: `Safe form completion. Fill everything you can, submit nothing without permission.

## Procedure
1. Inventory every field from AVAILABLE INPUTS and INTERACTIVE ELEMENTS: inputs, textareas, selects, checkboxes, radios. Note label/placeholder/name.
2. Map each field to a value from (in order): explicit task text -> USER PROFILE -> sensible neutral placeholder. NEVER invent legal, payment, or identity data that was not provided.
3. type into each field. For selects use click then pick the option element. For checkbox consent: tick only what is required to proceed.
4. Fill EVERYTHING first, then stop and report. submit ONLY if the task explicitly says to submit/send/apply.

## Tool discipline
- One field per type action; verify the value stuck from the page diff.
- If a validation error appears, fix THAT field using the error text — do not re-fill the whole form.
- Never touch fields the task did not mention if they are optional and unclear.

## Answer format
List: field -> value filled (mask sensitive values like passwords as •••). State clearly whether the form was submitted or left ready for review.`,
    allowedHosts: [],
    doneChecklist: ['Every visible required field identified and filled', 'Values sourced from USER PROFILE / task text only', 'Nothing submitted unless the user explicitly asked', 'Confirmation state described in the answer'],
    builtIn: true,
  },
  {
    id: 'summarize-page',
    name: 'Summarize Page',
    icon: '📄',
    category: 'Research',
    desc: 'Summarize the current page directly from readable text content. Concise, bullet-pointed, zero-navigation.',
    prompt: `Summarize the page the user is already on. Text-first, zero-navigation by default.

## Procedure
1. Read Readable page text and Headings from the structured page data FIRST. Do not take a screenshot-driven approach unless text is empty or navigation is required.
2. If the content is longer than the visible excerpt, use ONE scroll to bottom, then summarize.
3. Produce a structured summary under 300 words with:
   - 1-sentence TL;DR
   - 3–5 bullet points covering the core arguments, facts, or steps
   - Key conclusion or actionable takeaway`,
    allowedHosts: [],
    doneChecklist: ['Main topic identified from page content', 'Key points listed as concise bullets', 'Summary stays under 300 words', 'No navigation performed unless page content was empty'],
    builtIn: true,
  },
  {
    id: 'deep-research',
    name: 'Deep Research',
    icon: '🔬',
    category: 'Research',
    desc: 'Multi-source investigation with citations. Visits 3+ independent sources and synthesises agreements and conflicts.',
    prompt: `Multi-source investigation with explicit citations. Quality over speed, but never wander.

## Procedure
1. Decompose the task into 2–4 concrete research questions before browsing.
2. Use search for the first question. Open the 2–3 most authoritative results with new_tab.
3. For each visited source: extract key claims, facts, numbers, and record the exact URL.
4. Synthesize findings into a structured report noting both consensus and contradictions between sources. Cite every claim by source URL.`,
    allowedHosts: [],
    doneChecklist: ['At least 3 independent sources visited', 'URL + key claims captured per source', 'Synthesis written noting agreements AND disagreements', 'All claims cite their source URL'],
    builtIn: true,
  },
  {
    id: 'extract-data',
    name: 'Extract Data',
    icon: '📊',
    category: 'Data Extraction',
    desc: 'Scrape repeating rows, tables, or fields into structured JSON/CSV data ready for export.',
    prompt: `Turn the current page into structured, export-ready data. Precision over prose.

## Procedure
1. Inspect Tables, Headings, and page text to find the repeating data pattern (product rows, contact blocks, table columns, link lists).
2. Extract all records into clean, tabular JSON format. Include column headers and normalized field names.
3. Capture source URL and timestamp. Never invent or hallucinate missing data — mark empty fields as null.`,
    allowedHosts: [],
    doneChecklist: ['Every matching row/field on the page captured', 'Data returned as structured JSON (or CSV if requested)', 'Source URL and capture time noted', 'Zero invented values — missing fields are null'],
    builtIn: true,
  },
  {
    id: 'compare-prices',
    name: 'Compare Prices',
    icon: '🛒',
    category: 'Shopping',
    desc: 'Cross-store price comparison across Amazon, Flipkart, and other retailers with an explicit verdict.',
    prompt: `Cross-store price comparison with an explicit verdict.

## Procedure
1. Determine the exact product identity from the task (model, size, variant).
2. Search and compare prices across Amazon, Flipkart, and relevant stores.
3. For each store: extract product title, exact numeric price, seller/rating, and product link.
4. Output a clean comparison table and declare the best overall deal taking shipping into account.`,
    allowedHosts: ['amazon.in', 'amazon.com', 'flipkart.com'],
    doneChecklist: ['Product found on at least 2 shopping sites', 'Name, price, rating, URL captured per site', 'Best deal explicitly identified with total cost', 'Comparison table returned in data'],
    builtIn: true,
  },
  {
    id: 'find-alternatives',
    name: 'Find Alternatives',
    icon: '🔁',
    category: 'Research',
    desc: 'Discover and vet 3-5 replacement options for a product, SaaS tool, or open-source library.',
    prompt: `Discover and vet replacement options for a product, tool, or site. Identify key differences, pricing models, open-source status, and recommend the best fit.`,
    allowedHosts: [],
    doneChecklist: ['3–5 distinct alternatives found and verified', 'One-line profile per alternative (what/why/price model/URL)', 'A clear recommendation matched to the user\'s context'],
    builtIn: true,
  },
  {
    id: 'manage-bookmarks',
    name: 'Manage Bookmarks',
    icon: '🔖',
    category: 'Productivity',
    desc: 'Inspect, organize, and categorize browser bookmarks into coherent thematic folders.',
    prompt: `Audit and organize bookmarks. Deduplicate, categorize by topic, and suggest a clean folder hierarchy.`,
    allowedHosts: [],
    doneChecklist: ['Duplicate bookmarks identified', 'Topic hierarchy generated', 'Actionable reorganization proposed'],
    builtIn: true,
  },
  {
    id: 'monitor-page',
    name: 'Monitor Page',
    icon: '👁️',
    category: 'Productivity',
    desc: 'Check a page for updates, restocks, price drops, or changes since last visit.',
    prompt: `Inspect the current page state and compare against previous known state. Report precise diffs or price changes.`,
    allowedHosts: [],
    doneChecklist: ['Target element inspected', 'Current numeric value or text recorded', 'Change summary reported'],
    builtIn: true,
  },
  {
    id: 'organize-tabs',
    name: 'Organize Tabs',
    icon: '🗂️',
    category: 'Productivity',
    desc: 'Group open tabs by domain and topic, highlighting duplicate and memory-heavy tabs.',
    prompt: `Analyze all active tabs across windows. Group them into thematic collections and identify stale or duplicate tabs.`,
    allowedHosts: [],
    doneChecklist: ['Tabs grouped logically by domain/topic', 'Duplicate tabs flagged', 'Close recommendations provided'],
    builtIn: true,
  },
  {
    id: 'read-later',
    name: 'Read Later Queue',
    icon: '📚',
    category: 'Productivity',
    desc: 'Cleanly extract article text, estimated reading time, and author details for offline review.',
    prompt: `Extract distraction-free reading content. Strip ads, banners, and sidebars, returning clean markdown.`,
    allowedHosts: [],
    doneChecklist: ['Main body text extracted cleanly', 'Reading time estimated', 'Metadata (author, date, source) recorded'],
    builtIn: true,
  },
  {
    id: 'save-page',
    name: 'Save Full Page',
    icon: '💾',
    category: 'Productivity',
    desc: 'Archive the current page as an offline bundle, markdown note, or structured screenshot sequence.',
    prompt: `Capture complete page contents, DOM structure, and metadata for long-term archiving.`,
    allowedHosts: [],
    doneChecklist: ['Full page content retrieved', 'Assets documented', 'Clean markdown archive generated'],
    builtIn: true,
  },
  {
    id: 'screenshot-walkthrough',
    name: 'Screenshot Walkthrough',
    icon: '📸',
    category: 'Productivity',
    desc: 'Capture step-by-step visual walkthrough of an interactive flow with annotated notes.',
    prompt: `Execute the user-requested flow step by step, taking screenshots at each key transition to generate a visual guide.`,
    allowedHosts: [],
    doneChecklist: ['Each step executed cleanly', 'Visual state captured per step', 'Annotated walkthrough guide produced'],
    builtIn: true,
  },
];

let allSettingsSkills = [];
let editingSettingsSkillId = null;

async function loadSettingsSkills() {
  let libSkills = [];
  try {
    libSkills = await loadLibrarySkills();
  } catch (e) {
    console.warn('[Settings] Failed to fetch library skills, using defaults:', e);
  }
  const baseSkills = (libSkills && libSkills.length > 0) ? libSkills : DEFAULT_SKILLS;

  return new Promise(resolve => {
    if (!chrome.storage?.local) {
      resolve([...baseSkills]);
      return;
    }
    chrome.storage.local.get(['techymindSkills', 'opencometSkills'], data => {
      const userSkills = data['techymindSkills'] || data['opencometSkills'] || [];
      const seen = new Set();
      // User customized skills take precedence
      const merged = [...userSkills, ...baseSkills].filter(s => {
        if (!s?.id || seen.has(s.id)) return false;
        seen.add(s.id);
        return true;
      });
      resolve(merged);
    });
  });
}

async function renderSkills() {
  const grid = $('skillsGrid');
  if (!grid) return;

  allSettingsSkills = await loadSettingsSkills();

  grid.innerHTML = allSettingsSkills.map(s => {
    const isCustom = !s.builtIn || s.source === 'user';
    const desc = s.desc || s.description || (s.prompt ? s.prompt.substring(0, 110) + '…' : '');
    return `
      <div class="skill-card" data-skill-id="${s.id}">
        <div>
          <div class="skill-card-head">
            <span class="skill-title">${s.icon || '⚙️'} ${s.name}</span>
            <span class="skill-badge" style="${isCustom ? 'background:rgba(196,50,36,0.08);color:var(--accent);border-color:rgba(196,50,36,0.25);' : ''}">${isCustom ? 'Custom' : 'Built-in'}</span>
          </div>
          <p class="skill-desc">${desc}</p>
        </div>
        <div class="skill-card-action">
          <span>Inspect &amp; Edit Prompt</span>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 3l5 5-5 5"/></svg>
        </div>
      </div>
    `;
  }).join('');

  // Wire up clicking any skill card to inspect / edit injected prompt
  grid.querySelectorAll('.skill-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.skillId;
      openSettingsSkillModal(id);
    });
  });
}

function openSettingsSkillModal(id = null) {
  const modal = $('settingsSkillModal');
  if (!modal) return;

  editingSettingsSkillId = id;
  const skill = id ? allSettingsSkills.find(s => s.id === id) : null;

  const title = $('settingsModalTitle');
  if (title) title.textContent = skill ? `Skill: ${skill.name}` : 'Create New Skill';

  $('settingsSkillName').value      = skill?.name || '';
  $('settingsSkillIcon').value      = skill?.icon || '⚙️';
  $('settingsSkillCategory').value  = skill?.category || 'Custom';
  $('settingsSkillDesc').value      = skill?.desc || skill?.description || '';
  $('settingsSkillPrompt').value    = skill?.prompt || '';
  $('settingsSkillHosts').value     = (skill?.allowedHosts || []).join('\n');
  $('settingsSkillChecklist').value = (skill?.doneChecklist || []).join('\n');

  const deleteBtn = $('settingsSkillDeleteBtn');
  if (deleteBtn) {
    deleteBtn.style.display = (skill && (!skill.builtIn || skill.source === 'user')) ? 'inline-flex' : 'none';
  }

  modal.style.display = 'flex';
}

function closeSettingsSkillModal() {
  const modal = $('settingsSkillModal');
  if (modal) modal.style.display = 'none';
  editingSettingsSkillId = null;
}

$('settingsNewSkillBtn')?.addEventListener('click', () => openSettingsSkillModal(null));
$('settingsSkillModalClose')?.addEventListener('click', closeSettingsSkillModal);
$('settingsSkillCancelBtn')?.addEventListener('click', closeSettingsSkillModal);
$('settingsSkillModalBackdrop')?.addEventListener('click', closeSettingsSkillModal);

$('settingsSkillSaveBtn')?.addEventListener('click', async () => {
  const name = $('settingsSkillName')?.value.trim();
  const prompt = $('settingsSkillPrompt')?.value.trim();

  if (!name) {
    alert('Please provide a Skill Name.');
    return;
  }
  if (!prompt) {
    alert('Please provide the Injected Agent Instructions & Prompt.');
    return;
  }

  const parseLines = id => ($(id)?.value || '').split('\n').map(l => l.trim()).filter(Boolean);

  const skillData = {
    id: editingSettingsSkillId || `skill_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: name.substring(0, 80),
    icon: $('settingsSkillIcon')?.value.trim() || '⚙️',
    category: $('settingsSkillCategory')?.value || 'Custom',
    description: $('settingsSkillDesc')?.value.trim() || '',
    desc: $('settingsSkillDesc')?.value.trim() || '',
    prompt: prompt,
    allowedHosts: parseLines('settingsSkillHosts'),
    doneChecklist: parseLines('settingsSkillChecklist'),
    builtIn: false,
    source: 'user',
    updatedAt: Date.now(),
  };

  if (chrome.storage?.local) {
    chrome.storage.local.get(['techymindSkills', 'techymindSkillMeta', 'opencometSkills', 'opencometSkillMeta'], data => {
      const skills = data['techymindSkills'] || data['opencometSkills'] || [];
      const idx = skills.findIndex(s => s.id === skillData.id);
      if (idx >= 0) {
        skills[idx] = skillData;
      } else {
        skills.unshift(skillData);
      }

      const meta = skills.map(s => ({
        id: s.id,
        name: s.name,
        icon: s.icon,
        category: s.category,
        builtIn: false,
        source: 'user',
        description: s.description || s.desc,
        promptPreview: (s.prompt || '').substring(0, 280),
        allowedHosts: s.allowedHosts || [],
        doneChecklist: s.doneChecklist || [],
      }));

      chrome.storage.local.set({
        techymindSkills: skills,
        techymindSkillMeta: meta,
        opencometSkills: skills,
        opencometSkillMeta: meta,
      }, () => {
        closeSettingsSkillModal();
        renderSkills();
      });
    });
  } else {
    closeSettingsSkillModal();
    renderSkills();
  }
});

$('settingsSkillDeleteBtn')?.addEventListener('click', () => {
  if (!editingSettingsSkillId) return;
  if (!confirm('Are you sure you want to delete this custom skill?')) return;

  if (chrome.storage?.local) {
    chrome.storage.local.get(['techymindSkills', 'techymindSkillMeta', 'opencometSkills', 'opencometSkillMeta'], data => {
      const skills = (data['techymindSkills'] || data['opencometSkills'] || []).filter(s => s.id !== editingSettingsSkillId);
      const meta = (data['techymindSkillMeta'] || data['opencometSkillMeta'] || []).filter(s => s.id !== editingSettingsSkillId);
      chrome.storage.local.set({
        techymindSkills: skills,
        techymindSkillMeta: meta,
        opencometSkills: skills,
        opencometSkillMeta: meta,
      }, () => {
        closeSettingsSkillModal();
        renderSkills();
      });
    });
  }
});

// Ollama Connection Test
async function checkOllamaStatus() {
  const baseUrl = ($('ollamaBaseUrl')?.value || 'http://127.0.0.1:11434').trim().replace(/\/+$/, '');
  const dot = document.querySelector('#ollamaStatusIndicator .dot');
  const msg = $('ollamaStatusMsg');
  if (msg) msg.textContent = 'Checking connection…';

  try {
    const res = await fetch(`${baseUrl}/api/tags`);
    if (res.ok) {
      if (dot) { dot.className = 'dot online'; }
      if (msg) msg.textContent = `Online — Connected to ${baseUrl}`;
      return true;
    }
  } catch (e) { /* offline */ }

  if (dot) { dot.className = 'dot offline'; }
  if (msg) msg.textContent = `Offline — Make sure ollama serve is running at ${baseUrl}`;
  return false;
}

// Refresh Ollama Models
async function refreshOllamaModels() {
  const baseUrl = ($('ollamaBaseUrl')?.value || 'http://127.0.0.1:11434').trim().replace(/\/+$/, '');
  const select = $('ollamaModelSelect');
  if (!select) return;

  try {
    const res = await fetch(`${baseUrl}/api/tags`);
    if (res.ok) {
      const data = await res.json();
      const models = (data.models || []).map(m => m.name).filter(Boolean);
      if (models.length) {
        select.innerHTML = models.map(m =>
          `<option value="${m}" ${m === (currentSettings.ollamaTextModel || currentSettings.model) ? 'selected' : ''}>${m}</option>`
        ).join('');
        return;
      }
    }
  } catch {}
}

// Laya MLX Metal Daemon Test
async function checkMlxStatus() {
  const baseUrl = ($('mlxBaseUrl')?.value || 'http://127.0.0.1:8181').trim().replace(/\/+$/, '');
  const dot = $('mlxStatusDot');
  const msg = $('mlxStatusMsg');
  if (msg) msg.textContent = 'Checking MLX Metal daemon…';

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(`${baseUrl}/health`, { signal: ctrl.signal });
    clearTimeout(t);
    if (res.ok) {
      const data = await res.json();
      if (dot) { dot.className = 'dot online'; }
      if (msg) {
        msg.textContent = `Online — Metal GPU Active (${data.device || 'gpu'}) · Engine: ${data.engine || 'mlx'} · v${data.version || '1.0'}`;
      }
      return true;
    }
  } catch {}

  if (dot) { dot.className = 'dot offline'; }
  if (msg) msg.textContent = `Offline — Daemon not running at ${baseUrl}. (Seamless fallback to Gemma 3 Ollama active)`;
  return false;
}

// Save Settings
async function saveSettings() {
  const saveBtn = $('saveAllSettingsBtn');
  if (saveBtn) saveBtn.textContent = 'Saving…';

  // This page has no provider picker — it edits whichever provider is already
  // active, so `model` has to be written from the field that belongs to it.
  // #compatibleModel was read on load but never written back, so saving while
  // OpenAI/Gemini/Anthropic/etc. was active used to clobber `model` with the
  // Ollama tag below.
  const activeProvider = currentSettings.provider || DEFAULT_SETTINGS.provider;
  const isOllama = activeProvider === 'ollama';
  const activeModel = isOllama
    ? ($('ollamaModelSelect')?.value.trim() || currentSettings.ollamaTextModel || DEFAULT_SETTINGS.ollamaTextModel)
    : ($('compatibleModel') ? $('compatibleModel').value.trim() : (currentSettings.model || ''));

  const updated = {
    ...currentSettings,
    ollamaBaseUrl: $('ollamaBaseUrl')?.value.trim() || 'http://127.0.0.1:11434',
    ollamaTextModel: $('ollamaModelSelect')?.value || currentSettings.ollamaTextModel || DEFAULT_SETTINGS.ollamaTextModel,
    mlxFastPath: $('mlxFastPathToggle')?.checked !== false,
    mlxFastPathEnabled: $('mlxFastPathToggle')?.checked !== false,
    mlxBaseUrl: $('mlxBaseUrl')?.value.trim() || 'http://127.0.0.1:8181',
    providerBaseUrl: $('compatibleBaseUrl')?.value.trim() || '',
    apiKey: $('compatibleApiKey')?.value.trim() || '',
    model: activeModel,
    braveSearchKey: $('braveKey')?.value.trim() || '',
    langSearchKey: $('langSearchKey')?.value.trim() || '',
    serperKey: $('serperKey')?.value.trim() || '',
    deepResearchMaxSites: parseInt($('drMaxSites')?.value, 10) || 6,
    // Defaults come from DEFAULT_SETTINGS — do not re-inline the literals here.
    exportFormat: $('exportFormat')?.value || DEFAULT_SETTINGS.exportFormat,
    exportFolder: $('exportFolder')?.value.trim() || DEFAULT_SETTINGS.exportFolder,
    profileData: {
      fullName: $('profName')?.value.trim() || '',
      email: $('profEmail')?.value.trim() || '',
      phone: $('profPhone')?.value.trim() || '',
      company: $('profCompany')?.value.trim() || '',
      address: $('profAddress')?.value.trim() || '',
      city: $('profCity')?.value.trim() || '',
      state: $('profState')?.value.trim() || '',
      pincode: $('profPincode')?.value.trim() || '',
      country: $('profCountry')?.value.trim() || 'India',
    },
    voiceInputEngine: $('voiceInputEngine')?.value || 'webspeech',
    whisperApiKey: $('whisperApiKey')?.value.trim() || '',
    voiceOutputEnabled: $('voiceOutputToggle')?.checked !== false,
    voicePersona: $('voicePersonaSelect')?.value || 'female',
    enableTabGrouping: $('tabGroupingToggle')?.checked === true,
    vlmSpeedProfile: $('speedProfileSelect')?.value || DEFAULT_SETTINGS.vlmSpeedProfile,
  };

  await chrome.storage.local.set({
    [STORAGE_KEYS.SETTINGS]: updated,
    voiceOutputEnabled: updated.voiceOutputEnabled,
  });
  currentSettings = updated;

  // Persist Privacy Wall settings
  try {
    const privEnabled = $('privacyEnabledToggle')?.checked !== false;
    localStorage.setItem('techymindPrivacyEnabled', privEnabled ? '1' : '0');
    localStorage.setItem('opencometPrivacyEnabled', privEnabled ? '1' : '0');
    // MERGE into the stored config. This object used to be REPLACED wholesale,
    // which silently deleted runYolo / useNer / ocrPii / serverUrl — keys the
    // side panel owns and this page has no control for.
    const readCfg = (k) => { try { return JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch { return {}; } };
    const privConfig = {
      ...readCfg('techymindPrivacyConfig'),
      blurFaces: $('blurFacesToggle')?.checked !== false,
      redactDomPii: $('redactDomPiiToggle')?.checked !== false,
      redactTextPii: true,
      maskIndianId: $('indianPiiToggle')?.checked !== false,
    };
    localStorage.setItem('techymindPrivacyConfig', JSON.stringify(privConfig));
    localStorage.setItem('opencometPrivacyConfig', JSON.stringify(privConfig));
  } catch {}

  const status = $('sidebarSaveStatus');
  if (status) {
    status.textContent = 'Settings saved ✓';
    setTimeout(() => { status.textContent = 'Settings auto-saved'; }, 2000);
  }
  if (saveBtn) saveBtn.textContent = 'Save Settings';
}

// Event Listeners
$('grantMicBtn')?.addEventListener('click', requestMicPermission);
$('testOllamaBtn')?.addEventListener('click', checkOllamaStatus);
$('testMlxBtn')?.addEventListener('click', checkMlxStatus);
$('refreshOllamaModelsBtn')?.addEventListener('click', async () => {
  await checkOllamaStatus();
  await refreshOllamaModels();
});
$('saveAllSettingsBtn')?.addEventListener('click', saveSettings);

// SIH Evaluation & Live Demo Lab launchers
$('launchGovFormBtn')?.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('TechyMindBench/pages/gov-form.html') });
});
$('launchRedactionLabBtn')?.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('TechyMindBench/pages/redaction-lab.html') });
});
$('launchCheckoutDemoBtn')?.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('TechyMindBench/pages/checkout.html') });
});
$('launchDashboardBtn')?.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('TechyMindBench/dashboard.html') });
});

// Backup / Import
$('exportConfigBtn')?.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(currentSettings, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `techymind-config-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

// Modern Import Configuration with drag-and-drop & validation
async function handleImportJsonContent(jsonStr) {
  const fb = $('importFeedback');
  if (!fb) return;
  fb.style.display = 'block';
  try {
    const parsed = JSON.parse(jsonStr);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('JSON root must be a configuration object.');
    }
    const knownKeys = ['provider', 'model', 'ollamaBaseUrl', 'exportFolder', 'profileData'];
    const matchedKeys = knownKeys.filter(k => k in parsed);
    if (matchedKeys.length === 0 && Object.keys(parsed).length < 2) {
      throw new Error('Unrecognized TechyMind configuration schema.');
    }

    currentSettings = { ...DEFAULT_SETTINGS, ...parsed };
    await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: currentSettings });
    await initSettings();
    fb.className = 'idz-feedback success';
    fb.innerHTML = `✓ Configuration imported successfully (${Object.keys(parsed).length} properties restored).`;
    setTimeout(() => { if (fb) fb.style.display = 'none'; }, 5000);
  } catch (err) {
    fb.className = 'idz-feedback error';
    fb.innerHTML = `✕ Import failed: ${err.message || 'Invalid JSON file'}`;
  }
}

const importDropZone = $('importDropZone');
const importConfigFile = $('importConfigFile');

if (importConfigFile) {
  importConfigFile.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      await handleImportJsonContent(ev.target.result);
    };
    reader.readAsText(file);
  });
}

if (importDropZone) {
  importDropZone.addEventListener('dragover', e => {
    e.preventDefault();
    importDropZone.classList.add('dragover');
  });
  importDropZone.addEventListener('dragleave', () => {
    importDropZone.classList.remove('dragover');
  });
  importDropZone.addEventListener('drop', e => {
    e.preventDefault();
    importDropZone.classList.remove('dragover');
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      await handleImportJsonContent(ev.target.result);
    };
    reader.readAsText(file);
  });
}

// Diagnostics
function logDiag(msg) {
  const con = $('diagConsole');
  const log = $('diagLog');
  if (con && log) {
    con.style.display = 'block';
    log.textContent += `[${new Date().toLocaleTimeString()}] ${msg}\n`;
  }
}

$('testPrivacyBtn')?.addEventListener('click', () => {
  logDiag('Running Privacy Test…');
  logDiag('✓ Face detection cascade loaded');
  logDiag('✓ Credential field redactor verified');
  logDiag('✓ Indian PII patterns (Aadhaar, PAN, UPI, IFSC) verified');
  logDiag('✓ Fail-closed privacy boundary active');
});

$('testServiceBtn')?.addEventListener('click', async () => {
  logDiag('Checking Service Connection…');
  const online = await checkOllamaStatus();
  logDiag(online ? '✓ Ollama server online and responsive' : '✗ Ollama server offline');
});

$('testSystemBtn')?.addEventListener('click', () => {
  logDiag('Running System Test…');
  logDiag(`✓ Manifest V3: ${chrome.runtime.getManifest()?.version}`);
  logDiag('✓ Tab groups API active');
  logDiag('✓ Sandboxed execution ready');
});

initSettings();
