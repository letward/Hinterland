const KEY = 'focus';

chrome.action.onClicked.addListener(async (tab) => {
  const stored = await chrome.storage.local.get(KEY);
  const next = typeof stored[KEY] === 'boolean' ? !stored[KEY] : true;
  await chrome.storage.local.set({ [KEY]: next });
  chrome.action.setTitle({ title: next ? 'Focus mode off' : 'Focus mode on' });
  if (typeof tab?.id === 'number') {
    await chrome.tabs.sendMessage(tab.id, { type: 'focus', on: next }).catch(() => {});
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(KEY);
  const on = typeof stored[KEY] === 'boolean' ? stored[KEY] : true;
  await chrome.storage.local.set({ [KEY]: on });
  chrome.action.setTitle({ title: on ? 'Focus mode off' : 'Focus mode on' });
});