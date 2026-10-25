/**
 * Smart Reading Companion - Popup UI Logic
 */

document.addEventListener('DOMContentLoaded', async () => {
  const toggle = document.getElementById('toggleEnabled');
  const articlesEl = document.getElementById('articlesCount');
  const wordsEl = document.getElementById('wordsCount');
  const btnClose = document.getElementById('btnClose');

  // Load config safely via message bus
  chrome.runtime.sendMessage({ type: 'GET_READER_CONFIG' }, (res) => {
    if (res?.ok && res.config) {
      toggle.checked = res.config.enabled !== false;
      articlesEl.textContent = String(res.config.articlesRead || 0);
      wordsEl.textContent = Number(res.config.totalWordsRead || 0).toLocaleString();
    }
  });

  toggle.addEventListener('change', () => {
    chrome.runtime.sendMessage({
      type: 'SET_READER_CONFIG',
      payload: { enabled: toggle.checked },
    });
  });

  btnClose.addEventListener('click', () => {
    if (window.hinterlandExtension?.closePopup) {
      window.hinterlandExtension.closePopup();
    } else {
      window.close();
    }
  });
});
