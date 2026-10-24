import { el, clear, debounce, prettyUrl, isInternal, hostOf } from './util.js';
import { icon } from './icons.js';
import { t } from './i18n.js';
import { get } from './store.js';
import { openPopup, closePopup, isOpen, empty } from './popup.js';
import { activeTab } from './tabs.js';

const api = () => window.hinterland;

let input = null;
let form = null;
let iconSlot = null;
let clearButton = null;
let starButton = null;
let zoomButton = null;
let progress = null;
let items = [];
let selected = -1;
let editing = false;

const fetchSuggestions = debounce(async (value) => {
  const list = await api().search.suggest(value);
  render(value, list);
}, 110);

export function bindOmnibox(nodes) {
  form = nodes.form;
  input = nodes.input;
  iconSlot = nodes.icon;
  clearButton = nodes.clear;
  starButton = nodes.star;
  zoomButton = nodes.zoom;
  progress = nodes.progress;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    commit();
  });

  input.addEventListener('focus', () => {
    editing = true;
    input.select();
    if (isOpen('omni')) return;
    openPopup({ key: 'omni', render: (host) => render(input.value, []) });
  });

  input.addEventListener('input', () => {
    editing = true;
    selected = -1;
    clearButton.hidden = input.value.length === 0;
    if (!isOpen('omni')) openPopup({ key: 'omni', render: (host) => render(input.value, []) });
    fetchSuggestions(input.value);
    updateStar();
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      move(1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(-1);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      if (isOpen('omni')) closePopup();
      else input.blur();
      return;
    }
    if (event.key === 'Tab') event.preventDefault();
  });

  input.addEventListener('blur', () => {
    setTimeout(() => {
      editing = false;
      if (!isOpen('omni')) closePopup();
    }, 120);
  });

  clearButton.addEventListener('click', () => {
    input.value = '';
    clearButton.hidden = true;
    input.focus();
  });

  starButton.addEventListener('click', () => window.dispatchEvent(new CustomEvent('hinterland:bookmark')));

  if (zoomButton) {
    zoomButton.addEventListener('click', () => {
      const tab = activeTab();
      if (tab) api().tab.zoom(tab.id, 1);
    });
  }
}

function move(delta) {
  const count = items.length;
  if (!count) return;
  selected = selected === -1 ? (delta > 0 ? 0 : count - 1) : (selected + delta + count) % count;
  const list = [...document.querySelectorAll('.popupCard [data-index]')];
  list.forEach((node) => node.classList.toggle('rowSelected', Number(node.dataset.index) === selected));
  document.querySelector(`.popupCard [data-index="${selected}"]`)?.scrollIntoView({ block: 'nearest' });
}

function commit() {
  if (selected >= 0 && items[selected]) {
    const target = items[selected];
    closePopup();
    input.blur();
    if (target.kind === 'engine') {
      const url = target.url.replaceAll('{q}', encodeURIComponent(input.value.trim()));
      api().tab.navigate(activeTab()?.id, url);
      return;
    }
    api().tab.navigate(activeTab()?.id, target.url);
    return;
  }

  const value = input.value.trim();
  closePopup();
  input.blur();
  if (!value) return;
  api().tab.navigate(activeTab()?.id, value);
}

async function render(value, suggestions) {
  if (!isOpen('omni')) return;
  const card = document.querySelector('.popupCard');
  if (!card) return;
  clear(card);
  items = [];
  selected = -1;

  const engines = await api().search.engines();
  const trimmed = value.trim();

  if (trimmed) {
    const target = await api().search.resolve(trimmed);
    if (target.kind === 'url') {
      items.push({ kind: 'url', url: trimmed, title: prettyUrl(trimmed), detail: target.url });
      card.append(entry(items[0], 0, 'omni.go'));
    } else if (target.url) {
      items.push({ kind: 'engine', url: target.engine ? engines[0]?.url : target.url, title: trimmed, detail: target.url });
      card.append(entry(items[0], 0, 'omni.searchWith'));
    } else {
      card.append(empty(t('omni.noEngine')));
      card.append(
        el('button', {
          class: 'row',
          type: 'button',
          onclick: () => {
            closePopup();
            window.dispatchEvent(new CustomEvent('hinterland:opensettings', { detail: { section: 'general' } }));
          },
        }, [
          el('span', { class: 'rowIcon', html: icon('gear') }),
          el('span', { class: 'rowBody' }, [
            el('span', { class: 'rowTitle', text: t('omni.addEngine') }),
            el('span', { class: 'rowSub', text: t('omni.addEngineDesc') }),
          ]),
        ]),
      );
    }
  } else {
    card.append(el('div', { class: 'popupSection', text: t('omni.recent') }));
    const recent = suggestions.length ? suggestions : await api().history.search('');
    if (!recent.length) {
      card.append(empty(t('omni.noRecent')));
    }
    for (const item of recent.slice(0, 7)) {
      const entryItem = { kind: 'history', url: item.url, title: item.title || item.url, detail: item.url };
      items.push(entryItem);
      card.append(entry(entryItem, items.length - 1, 'omni.open'));
    }
  }

  if (trimmed && suggestions.length) {
    card.append(el('div', { class: 'popupSection', text: t('omni.matches') }));
    for (const suggestion of suggestions.slice(0, 6)) {
      const entryItem = { kind: 'history', url: suggestion.url, title: suggestion.title, detail: suggestion.url };
      items.push(entryItem);
      card.append(entry(entryItem, items.length - 1, 'omni.open'));
    }
  }

  if (trimmed && engines.length > 1) {
    card.append(el('div', { class: 'popupSection', text: t('omni.searchIn') }));
    for (const engine of engines.slice(0, 5)) {
      const entryItem = { kind: 'engine', url: engine.url, title: trimmed, detail: engine.name };
      items.push(entryItem);
      card.append(
        entry(entryItem, items.length - 1, 'omni.searchWith', engine.name, () => {
          api().tab.navigate(activeTab()?.id, engine.url.replaceAll('{q}', encodeURIComponent(trimmed)));
        }),
      );
    }
  }
}

function entry(item, index, labelKey, aside, onSelect) {
  const node = el('button', { class: 'row', type: 'button' });
  node.dataset.index = index;
  node.addEventListener('click', () => {
    if (onSelect) return onSelect();
    closePopup();
    input.blur();
    api().tab.navigate(activeTab()?.id, item.url.replaceAll('{q}', encodeURIComponent(input.value.trim())));
  });
  node.addEventListener('mouseenter', () => {
    selected = index;
    for (const other of document.querySelectorAll('.popupCard .row')) other.classList.remove('rowSelected');
    node.classList.add('rowSelected');
  });

  node.append(
    el('span', {
      class: 'rowIcon',
      html: icon(item.kind === 'engine' ? 'search' : item.kind === 'history' ? 'clock' : 'globe'),
    }),
    el('span', { class: 'rowBody' }, [
      el('span', { class: 'rowTitle', text: item.title }),
      el('span', { class: 'rowSub', text: prettyUrl(item.detail) }),
    ]),
    aside ? el('span', { class: 'rowAside', text: aside }) : el('span', { class: 'rowAside', text: t(labelKey) }),
  );
  return node;
}

export function syncOmni(tab) {
  if (!input) return;
  const url = tab?.url ?? '';
  const shown = url === 'hinterland://newtab/' || url === 'about:blank' ? '' : url;

  iconSlot.innerHTML = icon(iconFor(url));
  iconSlot.classList.toggle('secure', url.startsWith('https://'));
  progress.classList.toggle('active', Boolean(tab?.loading));
  clearButton.hidden = editing || !shown;
  starButton.hidden = !shown;
  starButton.classList.toggle('on', isBookmarked(url));
  if (zoomButton) {
    const factor = Number(tab?.zoom) || 1;
    if (Math.abs(factor - 1) > 0.02) {
      zoomButton.hidden = false;
      zoomButton.textContent = `${Math.round(factor * 100)}%`;
      zoomButton.title = t('menu.resetZoom');
    } else {
      zoomButton.hidden = true;
    }
  }
  if (!editing) input.value = shown;
}

function iconFor(url) {
  if (isInternal(url)) return 'compass';
  if (url.startsWith('https://')) return 'lock';
  if (url.startsWith('about:') || url === '') return 'search';
  return 'globe';
}

function isBookmarked(url) {
  const bookmarks = get('data.bookmarks', []) ?? [];
  return bookmarks.some((entry) => entry.url === url);
}

function updateStar() {
  const value = input?.value ?? '';
  starButton.hidden = !value;
  starButton.classList.toggle('on', isBookmarked(value));
}

export function focusOmnibox(selectAll = true) {
  if (!input) return;
  closePopup();
  input.focus();
  if (selectAll) input.select();
  else input.setSelectionRange(input.value.length, input.value.length);
  editing = true;
}

export function omniboxHost() {
  return hostOf(input?.value ?? '');
}