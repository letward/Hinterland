const KEY = 'panel';

async function enabled() {
  const stored = await chrome.storage.local.get(KEY);
  return Boolean(stored[KEY]);
}

const BAR_ID = 'hinterlandPanelBar';
const TOGGLED = new Set([
  'header',
  'footer',
  'aside',
  'nav',
  '[role="banner"]',
  '[role="navigation"]',
  '[role="complementary"]',
  '[role="contentinfo"]',
]);

function collect() {
  const found = [];
  for (const selector of TOGGLED) {
    for (const node of document.querySelectorAll(selector)) {
      if (node.closest(`#${BAR_ID}`)) continue;
      found.push(node);
    }
  }
  return found;
}

function apply(on) {
  const bar = document.getElementById(BAR_ID);
  bar?.remove();

  for (const node of collect()) {
    node.style.removeProperty('display');
    if (on) node.style.setProperty('display', 'none', 'important');
  }

  if (!on) return;

  const toolbar = document.createElement('div');
  toolbar.id = BAR_ID;
  toolbar.textContent = document.title;
  toolbar.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'toggle' }));
  document.documentElement.append(toolbar);
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== 'panel') return undefined;
  apply(Boolean(message.on));
  return undefined;
});

chrome.storage?.local?.get(KEY).then((stored) => apply(Boolean(stored[KEY])));