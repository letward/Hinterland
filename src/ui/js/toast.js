import { el } from './util.js';
import { t } from './i18n.js';

const stack = () => document.getElementById('toastStack');

export function toast(message, kind = 'info', duration = 2600) {
  if (typeof message !== 'string') message = t(message);
  if (!message) return;

  const node = el('div', { class: `toast ${kind}` }, [
    el('span', { class: 'toastDot' }),
    el('span', { class: 'toastText', text: message }),
  ]);

  stack().append(node);
  const remove = () => {
    node.classList.add('leaving');
    setTimeout(() => node.remove(), 200);
  };
  setTimeout(remove, duration);
  return remove;
}

export function toastFromKey(key, values, kind = 'info') {
  return toast(t(key, values), kind);
}