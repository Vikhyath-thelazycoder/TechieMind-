// ══════════════════════════════════════════════════════════════════════════
// TechyMindBench/visual-overlay.test.js
// Verification suite for Phase 1: In-Page AI Cursor & Target Bracket Overlay
// ══════════════════════════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

export async function run() {
  const results = [];
  const add = (name, ok, error = null) => results.push({ name, ok, error });

  // 1. Verify file existence
  try {
    const cssPath = path.join(rootDir, 'src/content/visual-overlay.css');
    const jsPath = path.join(rootDir, 'src/content/visual-overlay.js');
    const cssExists = fs.existsSync(cssPath);
    const jsExists = fs.existsSync(jsPath);
    add('visual-overlay.css and visual-overlay.js exist', cssExists && jsExists);
  } catch (err) {
    add('visual-overlay files exist', false, err.message);
  }

  // 2. Verify manifest.json registration
  try {
    const manifestPath = path.join(rootDir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const contentScripts = manifest.content_scripts || [];
    const hasJs = contentScripts.some(cs => cs.js && cs.js.includes('src/content/visual-overlay.js'));
    const hasCss = contentScripts.some(cs => cs.css && cs.css.includes('src/content/visual-overlay.css'));
    add('manifest.json registers visual-overlay js and css', hasJs && hasCss);
  } catch (err) {
    add('manifest registration', false, err.message);
  }

  // 3. Verify CSS critical rules (pointer-events: none, high z-index, transforms)
  try {
    const css = fs.readFileSync(path.join(rootDir, 'src/content/visual-overlay.css'), 'utf8');
    const hasPointerEventsNone = css.includes('pointer-events: none !important');
    const hasHighZIndex = css.includes('z-index: 2147483647');
    const hasTranslate3d = css.includes('translate3d');
    const hasThemes = css.includes('techymind-theme-action') &&
                      css.includes('techymind-theme-pii') &&
                      css.includes('techymind-theme-success');
    add('visual-overlay.css has pointer-events: none, max z-index, 3D transforms, semantic themes',
      hasPointerEventsNone && hasHighZIndex && hasTranslate3d && hasThemes);
  } catch (err) {
    add('CSS critical rules', false, err.message);
  }

  // 4. Verify DOM Detector / Actions Agent-Owned Immunity (Agent never clicks or scrapes itself)
  try {
    const detectorJs = fs.readFileSync(path.join(rootDir, 'src/content/dom-detector.js'), 'utf8');
    const actionsJs = fs.readFileSync(path.join(rootDir, 'src/background/actions.js'), 'utf8');

    // Test simulated element matching against the isAgentOwned regex/selector logic
    const testIds = [
      'techymind-ai-cursor',
      'techymind-target-highlight',
      'techymind-cursor-badge',
      'techymind-agent-overlay',
      'techymind-dom-highlight-container',
      '__techymind_cursor__',
      '__techymind_target_highlight__'
    ];

    const matchAgentOwned = (id) => {
      return (
        id.startsWith('techymind-') ||
        id.startsWith('open-comet-') ||
        id.startsWith('__techymind_') ||
        id.startsWith('__opencomet_')
      );
    };

    const allIgnored = testIds.every(id => matchAgentOwned(id));
    const detectorHasSelector = detectorJs.includes('[id^="techymind-"]') && detectorJs.includes('__techymind_cursor__');
    const actionsHasSelector = actionsJs.includes('[id^="techymind-"]');

    add('Overlay elements are strictly agent-owned (immune to scraper and self-click)',
      allIgnored && detectorHasSelector && actionsHasSelector);
  } catch (err) {
    add('Agent-owned immunity', false, err.message);
  }

  // 5. Test Controller Logic in Mock Window / DOM
  try {
    // Create a lightweight DOM mock environment
    const createdElements = [];
    const mockDocument = {
      body: {
        appendChild: (el) => createdElements.push(el)
      },
      documentElement: {},
      getElementById: (id) => createdElements.find(el => el.id === id) || null,
      createElement: (tag) => {
        const el = {
          tagName: tag.toUpperCase(),
          id: '',
          className: '',
          style: {},
          attributes: {},
          setAttribute: (k, v) => { el.attributes[k] = v; },
          getAttribute: (k) => el.attributes[k] || null,
          querySelector: (sel) => {
            if (sel.startsWith('#')) return createdElements.find(e => e.id === sel.slice(1)) || null;
            return { textContent: '', style: {}, classList: { add() {}, remove() {} } };
          },
          querySelectorAll: () => [],
          classList: {
            classes: new Set(),
            add: (c) => el.classList.classes.add(c),
            remove: (c) => el.classList.classes.delete(c),
            contains: (c) => el.classList.classes.has(c)
          },
          remove: () => {
            const idx = createdElements.indexOf(el);
            if (idx >= 0) createdElements.splice(idx, 1);
          },
          isConnected: true
        };
        return el;
      }
    };

    globalThis.document = mockDocument;
    globalThis.window = {
      innerWidth: 1920,
      innerHeight: 1080,
      document: mockDocument
    };

    // Dynamically load the visual overlay module
    await import(path.join(rootDir, 'src/content/visual-overlay.js') + `?t=${Date.now()}`);
    const controller = globalThis.window?.__techymindVisualOverlay || globalThis.__techymindVisualOverlay;

    // Test cursor creation and gliding
    const cursor = controller.ensureCursor();
    const cursorCreated = cursor && cursor.id === 'techymind-ai-cursor';

    // Test coordinate movement
    controller.moveCursor(350, 420, { durationMs: 250, label: 'Testing Cursor' });
    const cursorTransformed = cursor.style.transform === 'translate3d(350px, 420px, 0)';
    const cursorVisible = cursor.classList.contains('techymind-cursor-visible');

    // Test target highlight creation
    const targetBracket = controller.ensureTargetHighlight();
    controller.highlightElement({ left: 100, top: 200, width: 300, height: 50 }, {
      colorState: 'action',
      label: 'Search Field'
    });
    const bracketPositioned = targetBracket.style.left === '96px' && targetBracket.style.top === '196px';
    const bracketVisible = targetBracket.classList.contains('techymind-target-visible');

    // Test PII semantic theme
    controller.highlightElement({ left: 50, top: 50, width: 200, height: 40 }, {
      sensitive: true,
      label: 'Password'
    });
    const piiThemeApplied = targetBracket.className === 'techymind-theme-pii';

    add('Visual Overlay controller renders cursor, transforms coordinates, and applies PII themes',
      cursorCreated && cursorTransformed && cursorVisible && bracketPositioned && bracketVisible && piiThemeApplied);
  } catch (err) {
    add('Controller in mock DOM', false, err.message);
  } finally {
    delete globalThis.document;
    delete globalThis.window;
  }

  // 6. Verify actions.js integration (press and domType visual hooks)
  try {
    const actionsCode = fs.readFileSync(path.join(rootDir, 'src/background/actions.js'), 'utf8');
    const hasVisualOverlayInPress = actionsCode.includes('__techymindVisualOverlay') &&
                                    actionsCode.includes('handleTargetAction');
    const hasTypingCadence = actionsCode.includes('async function domType') &&
                             actionsCode.includes('sleepMs') &&
                             actionsCode.includes('insertText');
    const hasActionFeedbackMessage = actionsCode.includes('TECHYMIND_ACTION_FEEDBACK');

    add('actions.js integrates visual agency into press and adds human typing cadence to domType',
      hasVisualOverlayInPress && hasTypingCadence && hasActionFeedbackMessage);
  } catch (err) {
    add('actions.js integration', false, err.message);
  }

  const pass = results.every(r => r.ok);
  return {
    name: 'Visual Agency (AI cursor & target bracket)',
    pass,
    metrics: {
      passed: results.filter(r => r.ok).length,
      total: results.length,
      results
    }
  };
}
