import { debounce } from './util.js';
import { icon } from './icons.js';
import { t } from './i18n.js';
import { currentTab } from './state.js';

const api = () => window.hinterland;

let bar = null;
let input = null;
let counter = null;
let previous = '';
let options = { caseSensitive: false, wholeWord: false, regex: false };

const run = debounce(() => {
  const tab = currentTab();
  if (!tab) return;
  const value = input.value;
  if (!value) {
    api().tab.findStop(tab.id);
    counter.textContent = `0/0`;
    return;
  }
  api().tab.find(tab.id, value, { forward: true, ...options });
}, 140);

export function bindFind(nodes) {
  bar = nodes.bar;
  input = nodes.input;
  counter = nodes.count;

  input.addEventListener('input', run);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      const tab = currentTab();
      if (!tab) return;
      if (event.shiftKey) api().tab.find(tab.id, input.value, { forward: false, ...options });
      else api().tab.findNext(tab.id);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      closeFind();
    }
  });

  nodes.next.addEventListener('click', () => {
    const tab = currentTab();
    if (tab) api().tab.findNext(tab.id);
  });

  nodes.prev.addEventListener('click', async () => {
    const tab = currentTab();
    if (!tab) return;
    options.forward = false;
    await api().tab.find(tab.id, input.value || previous, { ...options });
    options.forward = true;
    api().tab.findNext(tab.id);
  });

  nodes.close.addEventListener('click', () => closeFind());
  input.placeholder = t('find.placeholder');
}

export function openFind() {
  if (!bar) return;
  bar.hidden = false;
  previous = '';
  input.value = '';
  counter.textContent = '0/0';
  input.focus();
}

export function closeFind() {
  if (!bar) return;
  const tab = currentTab();
  if (tab) api().tab.findStop(tab.id, true);
  bar.hidden = true;
  input.value = '';
  counter.textContent = '0/0';
}

export function isFindOpen() {
  return Boolean(bar && !bar.hidden);
}

export function applyFindResult(payload) {
  if (!bar || bar.hidden) return;
  const result = payload?.result;
  if (!result) return;
  const matches = Number(result.matches) || 0;
  const active = Number(result.activeMatchOrdinal) || 0;
  counter.textContent = matches ? `${active}/${matches}` : '0/0';
  if (input.value) previous = input.value;
}