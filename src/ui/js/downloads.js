import { el, clear, formatBytes } from './util.js';
import { icon } from './icons.js';
import { t } from './i18n.js';
import { openDownloads, trackDownload } from './panels.js';

const api = () => window.hinterland;

let shelf = null;
let timer = null;
const items = new Map();

export function bindShelf(node) {
  shelf = node;
  node.addEventListener('click', (event) => {
    if (event.target.closest('button')) return;
    openDownloads();
  });
}

function paint() {
  const entries = [...items.values()];
  const visible = entries.slice(-1);
  if (!visible.length) {
    shelf.hidden = true;
    clear(shelf);
    return;
  }
  const entry = visible[0];
  const total = Number(entry.totalBytes) || 0;
  const received = Number(entry.receivedBytes) || 0;
  const percent = total ? Math.min(100, Math.round((received / total) * 100)) : entry.state === 'completed' ? 100 : 0;

  clear(shelf);
  shelf.hidden = false;
  shelf.append(
    el('span', { class: 'downloadIcon', html: icon('download') }),
    el('div', { class: 'downloadMeta' }, [
      el('div', { class: 'downloadName', text: entry.filename }),
      el('div', { class: 'downloadSub', text: entry.state === 'completed' ? t('downloads.done') : `${percent}% — ${formatBytes(received)}${total ? ` / ${formatBytes(total)}` : ''}` }),
      el('div', { class: 'downloadBar' }, [el('div', { class: 'downloadBarFill', style: { width: `${percent}%` } })]),
    ]),
    el('button', { class: 'iconButton small', type: 'button', html: icon('external'), title: t('action.open'), onclick: () => api().app.revealFile(entry.savePath) }),
    el('button', { class: 'iconButton small', type: 'button', html: icon('close'), title: t('action.dismiss'), onclick: () => hide() }),
  );
}

function hide() {
  items.clear();
  shelf.hidden = true;
  clear(shelf);
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

export function onDownloadNew(payload) {
  trackDownload(payload);
  items.set(payload.id, payload);
  if (timer) clearTimeout(timer);
  paint();
}

export function onDownloadProgress(payload) {
  trackDownload(payload);
  items.set(payload.id, payload);
  paint();
}

export function onDownloadDone(payload) {
  trackDownload(payload);
  items.set(payload.id, payload);
  paint();
  timer = setTimeout(hide, 5000);
}

export function downloadCount() {
  return items.size;
}