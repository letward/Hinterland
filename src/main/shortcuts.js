import { app } from 'electron';
import { DEFAULT_SHORTCUTS } from './constants.js';
import { settings } from './settings.js';
import { tabs } from './tabs.js';
import { surface } from './windows.js';
import { NEW_TAB_URL } from './constants.js';

const UI_ACTIONS = new Set(['focusAddress', 'focusSearch', 'settings', 'bookmarks', 'history', 'find', 'sidebar', 'shortcuts', 'commandPalette', 'downloads']);

function normaliseCombo(combo) {
  const parts = String(combo ?? '')
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return '';
  const key = parts.pop();
  const modifiers = new Set(parts.map((part) => part.toLowerCase()));
  return `${modifiers.has('ctrl') || modifiers.has('control') ? 'ctrl' : ''}+${modifiers.has('alt') || modifiers.has('option') ? 'alt' : ''}+${modifiers.has('shift') ? 'shift' : ''}+${modifiers.has('meta') || modifiers.has('cmd') || modifiers.has('command') ? 'meta' : ''}+${key.toLowerCase()}`;
}

function comboFor(input) {
  return normaliseCombo(
    `${input.control ? 'Ctrl' : ''}${input.alt ? 'Alt' : ''}${input.shift ? 'Shift' : ''}${input.meta ? 'Meta' : ''}+${input.key}`,
  );
}

function table() {
  const custom = settings.value('shortcuts') ?? {};
  const merged = { ...DEFAULT_SHORTCUTS };
  for (const [action, combo] of Object.entries(custom)) {
    if (typeof combo !== 'string') continue;
    merged[action] = combo;
  }
  return merged;
}

function zoom(delta) {
  const tab = tabs.active;
  if (!tab) return;
  const steps = Math.round(Math.log(tab.zoom || 1) / Math.log(1.1) + delta);
  tab.zoom = Math.pow(1.1, Math.max(-3, Math.min(5, steps)));
  tab.contents.setZoomFactor(tab.zoom);
  surface.send('tab:update', { ...tab.snapshot(), id: tab.id });
}

function run(action) {
  const tab = tabs.active;

  switch (action) {
    case 'newTab':
      tabs.create({ url: NEW_TAB_URL });
      return true;
    case 'privateTab':
      tabs.create({ url: NEW_TAB_URL, privateMode: true });
      return true;
    case 'closeTab':
      if (tab) tabs.close(tab.id);
      return true;
    case 'duplicateTab':
      if (tab) tabs.duplicate(tab.id);
      return true;
    case 'muteTab':
      if (tab) {
        tab.muted = !tab.muted;
        tab.contents.setAudioMuted(tab.muted);
        surface.send('tab:update', { ...tab.snapshot(), id: tab.id });
      }
      return true;
    case 'reopenTab':
      tabs.reopenClosed();
      return true;
    case 'nextTab':
      tabs.cycle(1);
      return true;
    case 'previousTab':
      tabs.cycle(-1);
      return true;
    case 'goBack':
      if (tab?.canGoBack) tab.contents.navigationHistory.goBack();
      return true;
    case 'goForward':
      if (tab?.canGoForward) tab.contents.navigationHistory.goForward();
      return true;
    case 'reload':
      tab?.contents.reload();
      return true;
    case 'hardReload':
      tab?.contents.reloadIgnoringCache();
      return true;
    case 'stop':
      tab?.contents.stop();
      surface.send('shortcut', { action: 'stop' });
      return true;
    case 'zoomIn':
      zoom(1);
      return true;
    case 'zoomOut':
      zoom(-1);
      return true;
    case 'zoomReset':
      if (tab) {
        tab.zoom = 1;
        tab.contents.setZoomFactor(1);
        surface.send('tab:update', { ...tab.snapshot(), id: tab.id });
      }
      return true;
    case 'fullscreen':
      surface.toggleFullScreen();
      return true;
    case 'duplicateTab':
      if (tab) tabs.duplicate(tab.id);
      return true;
    case 'muteTab':
      if (tab) {
        tab.muted = !tab.muted;
        tab.contents.setAudioMuted(tab.muted);
        surface.send('tab:update', { ...tab.snapshot(), id: tab.id });
      }
      return true;
    default:
      if (UI_ACTIONS.has(action)) {
        surface.send('shortcut', { action });
        return true;
      }
      return false;
  }
}

export function installShortcuts() {
  app.on('web-contents-created', (_event, contents) => {
    const shortcuts = table();
    const lookup = new Map();
    for (const [action, combo] of Object.entries(shortcuts)) {
      if (combo && typeof combo === 'string') lookup.set(normaliseCombo(combo), action);
    }

    contents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;
      const action = lookup.get(comboFor(input));
      if (!action) return;
      if (run(action)) event.preventDefault();
    });
  });
}

export function describeShortcuts() {
  return Object.entries(table()).map(([action, combo]) => ({ action, combo }));
}