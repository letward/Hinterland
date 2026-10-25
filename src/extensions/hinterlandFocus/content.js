const KEY = 'focus';

async function enabled() {
  const stored = await chrome.storage.local.get(KEY);
  return Boolean(stored[KEY]);
}

function apply(on) {
  const root = document.documentElement;
  if (on) root.setAttribute('data-hinterland-focus', 'true');
  else root.removeAttribute('data-hinterland-focus');
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== 'focus') return undefined;
  apply(Boolean(message.on));
  return undefined;
});

window.addEventListener('hinterland:extension-action', async (event) => {
  if (event.detail?.extensionId === 'hinterlandfocus') {
    const isCurrentlyOn = document.documentElement.getAttribute('data-hinterland-focus') === 'true';
    const next = !isCurrentlyOn;
    try {
      await chrome.storage?.local?.set({ [KEY]: next });
    } catch {}
    apply(next);
  }
});

chrome.storage?.local?.get(KEY).then((stored) => apply(Boolean(stored[KEY])));
