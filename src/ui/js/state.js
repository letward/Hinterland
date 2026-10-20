import { getAll } from './store.js';
import { activeTab, allTabs } from './tabs.js';

export function currentTab() {
  return activeTab();
}

export function currentSettings() {
  return getAll();
}

export function currentTabs() {
  return allTabs();
}

let handlers = { resolveTabConfirm: null, resolvePermission: null, resolveClose: null };

export function setHandlers(next) {
  handlers = { ...handlers, ...next };
}

export function handlersRef() {
  return handlers;
}