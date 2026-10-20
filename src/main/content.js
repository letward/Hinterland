import { settings } from './settings.js';

const injected = new WeakMap();
let sequence = 0;

export function applyContentSettings(tabList) {
  const css = buildUserStylesheet();
  for (const tab of tabList ?? []) {
    const contents = tab?.contents;
    if (!contents || contents.isDestroyed()) continue;
    applyZoom(contents, tab);
    applyStylesheet(contents, css);
  }
}

function applyZoom(contents, tab) {
  const steps = Number(settings.value('content.defaultZoom')) || 0;
  const factor = steps === 0 ? 1 : Math.pow(1.1, steps);
  if (tab.zoom === factor) return;
  tab.zoom = factor;
  contents.setZoomFactor(factor);
}

function applyStylesheet(contents, css) {
  const previous = injected.get(contents);
  if (previous?.css === css) return;
  if (previous?.key) {
    try {
      contents.removeStyleTag(previous.key);
    } catch {
      /* the stylesheet is already gone */
    }
  }
  if (!css) {
    injected.delete(contents);
    return;
  }
  const key = `hinterland user style ${(sequence += 1)}`;
  contents.insertCSS(css, key);
  injected.set(contents, { css, key });
}

/** Turns the content preferences into a single stylesheet applied to every page. */
function buildUserStylesheet() {
  const parts = [];
  const fontFamily = settings.value('content.defaultFontFamily');
  if (fontFamily && fontFamily.trim()) parts.push(`html { font-family: ${fontFamily.trim()}; }`);

  const fontSize = Number(settings.value('content.defaultFontSize')) || 0;
  if (fontSize) parts.push(`html { font-size: ${fontSize}px; }`);

  if (settings.value('content.lazyImages')) parts.push('img { loading: lazy; }');

  if (settings.value('content.markPdfLinks')) {
    parts.push('a[href$=".pdf"]::after { content: " (PDF)"; font-size: 0.8em; opacity: 0.7; }');
  }

  if (settings.value('content.customCssEnabled')) {
    const custom = settings.value('content.customCss');
    if (custom && custom.trim()) parts.push(custom);
  }

  return parts.join('\n');
}

export function javascriptDisabled() {
  return !settings.value('content.javascript');
}