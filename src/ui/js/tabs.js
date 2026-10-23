import { el, clear } from './util.js';
import { icon } from './icons.js';
import { get } from './store.js';
import { t } from './i18n.js';
import { prettyUrl } from './util.js';

const api = () => window.hinterland;

let container = null;
let state = { tabs: [], activeId: null, groups: [] };
let dragId = null;

function faviconNode(tab) {
  if (!get('tabs.showFavicons', true)) return null;
  if (tab.favicon) {
    const image = el('img', { class: 'tabFavicon', src: tab.favicon, alt: '' });
    image.addEventListener('error', () => {
      const fallback = el('span', { class: 'tabFaviconFallback', html: icon('globe') });
      image.replaceWith(fallback);
    });
    return image;
  }
  return el('span', { class: 'tabFaviconFallback', html: icon(isInternal(tab.url) ? 'compass' : 'globe') });
}

function groupColorDot(group) {
  return el('span', { class: 'groupColorDot', style: { background: group.color } });
}

function buildGroupHeader(group, tabsInGroup) {
  const node = el('div', {
    class: `groupHeader${group.collapsed ? ' groupCollapsed' : ''}`,
    'data-group': group.id,
  });

  const toggle = el('button', {
    class: 'groupToggle',
    type: 'button',
    html: group.collapsed ? icon('expand') : icon('collapse'),
    title: group.collapsed ? t('menu.groupExpand') : t('menu.groupCollapse'),
    'aria-label': group.collapsed ? t('menu.groupExpand') : t('menu.groupCollapse'),
  });
  toggle.addEventListener('click', (event) => {
    event.stopPropagation();
    api().tabs.groupUpdate(group.id, { collapsed: !group.collapsed });
  });

  node.append(
    groupColorDot(group),
    toggle,
    el('span', { class: 'groupTitle', text: group.name }),
    el('span', { class: 'groupCount', text: String(tabsInGroup.length) }),
    el('button', {
      class: 'groupClose',
      type: 'button',
      html: icon('close'),
      title: t('menu.groupDelete'),
      'aria-label': t('menu.groupDelete'),
    }),
  );

  node.querySelector('.groupClose').addEventListener('click', (event) => {
    event.stopPropagation();
    api().tabs.groupDelete(group.id);
  });

  return node;
}

function buildTab(tab) {
  const group = state.groups.find((g) => g.id === tab.groupId);
  const node = el('div', {
    class: `tab${tab.id === state.activeId ? ' tabActive' : ''}${tab.privateMode ? ' tabPrivate' : ''}${tab.pinned ? ' tabPinned' : ''}${group ? ` groupTab group-${group.id.replace(/[^a-z0-9]/gi, '')}` : ''}`,
    role: 'tab',
    'data-id': tab.id,
    'data-group': tab.groupId ?? '',
    draggable: 'false',
  });

  const iconSlot = faviconNode(tab);
  if (iconSlot) node.append(iconSlot);
  if (tab.pinned) node.append(el('span', { class: 'tabFaviconFallback', html: icon('pin') }));
  if (group) node.append(groupColorDot(group));
  node.append(el('span', { class: 'tabTitle', text: tab.title || prettyUrl(tab.url) }));

  if (tab.audible) {
    node.append(el('span', { class: 'tabSound', html: icon(tab.muted ? 'volumeOff' : 'volume') }));
  }

  const close = el('button', { class: 'tabClose', type: 'button', html: icon('close'), title: 'Close' });
  close.addEventListener('click', (event) => {
    event.stopPropagation();
    api().tabs.close(tab.id);
  });
  node.append(close);

  if (tab.loading) node.append(el('div', { class: 'tabLoader' }));

  node.addEventListener('mousedown', (event) => {
    if (event.button === 1) {
      event.preventDefault();
      api().tabs.close(tab.id);
      return;
    }
    if (event.button !== 0) return;
    if (event.target.closest('.tabClose, .groupClose, .groupToggle')) return;
    if (state.activeId === tab.id) return;
    api().tabs.activate(tab.id);
  });

  node.addEventListener('auxclick', (event) => {
    if (event.button === 1) api().tabs.close(tab.id);
  });

  node.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    window.dispatchEvent(new CustomEvent('hinterland:tabmenu', { detail: { tab, x: event.clientX, y: event.clientY } }));
  });

  node.addEventListener('dragstart', (event) => {
    dragId = tab.id;
    node.classList.add('tabDragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', tab.id);
  });

  node.addEventListener('dragend', () => {
    dragId = null;
    node.classList.remove('tabDragging');
  });

  node.addEventListener('dragover', (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const box = node.getBoundingClientRect();
    const after = event.clientX > box.left + box.width / 2;
    node.classList.toggle('tabDropBefore', !after);
    node.classList.toggle('tabDropAfter', after);
  });

  node.addEventListener('dragleave', () => {
    node.classList.remove('tabDropBefore', 'tabDropAfter');
  });

  node.addEventListener('drop', (event) => {
    event.preventDefault();
    node.classList.remove('tabDropBefore', 'tabDropAfter');
    if (!dragId || dragId === tab.id) return;
    const box = node.getBoundingClientRect();
    const after = event.clientX > box.left + box.width / 2;
    const target = state.tabs.findIndex((entry) => entry.id === tab.id);
    api().tabs.move(dragId, after ? target + 1 : target);
  });

  node.addEventListener('dblclick', () => api().tabs.pin(tab.id, !tab.pinned));

  return node;
}

export function renderTabs(snapshot) {
  state = snapshot ?? state;
  if (!container) return;
  clear(container);

  const groupsMap = new Map();
  for (const group of state.groups) {
    groupsMap.set(group.id, group);
  }

  const ungrouped = [];
  for (const tab of state.tabs) {
    if (!tab.groupId || !groupsMap.has(tab.groupId)) {
      ungrouped.push(tab);
    }
  }

  for (const group of state.groups) {
    const tabsInGroup = state.tabs.filter((t) => t.groupId === group.id);
    if (group.collapsed && tabsInGroup.length > 0) {
      container.append(buildGroupHeader(group, tabsInGroup));
      continue;
    }
    container.append(buildGroupHeader(group, tabsInGroup));
    for (const tab of tabsInGroup) {
      container.append(buildTab(tab));
    }
  }

  if (ungrouped.length > 0) {
    const hasGroups = state.groups.length > 0;
    if (hasGroups) {
      container.append(el('div', { class: 'groupHeader groupUngrouped', 'data-group': '' }, [
        el('span', { class: 'groupColorDot', style: { background: 'transparent' } }),
        el('span', { class: 'groupTitle', text: t('settings.tabs.ungrouped') }),
        el('span', { class: 'groupCount', text: String(ungrouped.length) }),
      ]));
    }
    for (const tab of ungrouped) {
      container.append(buildTab(tab));
    }
  }

  const active = container.querySelector('.tabActive');
  active?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

export function updateTab(snapshot) {
  if (!container) return;
  const index = state.tabs.findIndex((entry) => entry.id === snapshot.id);
  if (index === -1) return;
  state.tabs[index] = snapshot;
  if (snapshot.id === state.activeId) state.activeId = snapshot.id;

  const existing = container.querySelector(`[data-id="${snapshot.id}"]`);
  if (!existing) {
    renderTabs(state);
    return;
  }
  const next = buildTab(snapshot);
  if (existing.classList.contains('tabActive')) {
    container.querySelector('.tabActive')?.classList.remove('tabActive');
    next.classList.add('tabActive');
  }
  existing.replaceWith(next);
}

export function setActive(activeId) {
  state.activeId = activeId;
  for (const node of container?.children ?? []) {
    node.classList.toggle('tabActive', node.dataset.id === activeId);
  }
  container?.querySelector('.tabActive')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

export function activeTab() {
  return state.tabs.find((entry) => entry.id === state.activeId) ?? null;
}

export function allTabs() {
  return state.tabs;
}

export function bindTabs(node) {
  container = node;
}

function isInternal(url) {
  return typeof url === 'string' && url.startsWith('hinterland://');
}