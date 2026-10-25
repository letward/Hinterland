import { renderHinterStore } from './hinterStore.js';
import { setStrings } from './i18n.js';

async function init() {
  const root = document.getElementById('storeRoot');
  if (!root) return;

  // Fetch strings if hinterlandPage is present
  try {
    const res = await fetch('hinterland://strings/de.json');
    if (res.ok) {
      const strings = await res.json();
      setStrings(strings, 'de');
    }
  } catch {}

  const view = renderHinterStore('all');
  root.append(view);
}

init();
