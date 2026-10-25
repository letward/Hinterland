/**
 * Smart Reading Companion - Background Service Worker
 * Manages extension state, storage, and message routing.
 */

const STORAGE_KEY = 'smart_reader_state';

// Initialize defaults on install
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[SmartReader] Installed:', details.reason);
  const data = await chrome.storage.local.get(STORAGE_KEY);
  if (!data[STORAGE_KEY]) {
    await chrome.storage.local.set({
      [STORAGE_KEY]: {
        enabled: true,
        fontSize: '16px',
        theme: 'auto',
        articlesRead: 0,
        totalWordsRead: 0,
      },
    });
  }
});

// Handle incoming messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') return false;

  if (message.type === 'GET_READER_CONFIG') {
    chrome.storage.local.get(STORAGE_KEY).then((data) => {
      sendResponse({ ok: true, config: data[STORAGE_KEY] || {} });
    });
    return true;
  }

  if (message.type === 'SET_READER_CONFIG') {
    chrome.storage.local.get(STORAGE_KEY).then(async (data) => {
      const current = data[STORAGE_KEY] || {};
      const updated = { ...current, ...message.payload };
      await chrome.storage.local.set({ [STORAGE_KEY]: updated });

      // Notify active tab if needed
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, { type: 'CONFIG_UPDATED', config: updated }).catch(() => {});
      }
      sendResponse({ ok: true, config: updated });
    });
    return true;
  }

  if (message.type === 'RECORD_ARTICLE_READ') {
    chrome.storage.local.get(STORAGE_KEY).then(async (data) => {
      const current = data[STORAGE_KEY] || {};
      const words = typeof message.payload?.words === 'number' ? message.payload.words : 0;
      const updated = {
        ...current,
        articlesRead: (current.articlesRead || 0) + 1,
        totalWordsRead: (current.totalWordsRead || 0) + words,
      };
      await chrome.storage.local.set({ [STORAGE_KEY]: updated });
      sendResponse({ ok: true, config: updated });
    });
    return true;
  }

  return false;
});
