import { el } from './util.js';
import { icon } from './icons.js';
import { t } from './i18n.js';

let host = null;
let shell = null;
let closeHandler = null;
let card = null;
let currentKey = '';

function report() {
  if (!shell) return;
  const base = shell.offsetHeight;
  const extra = card ? card.offsetHeight : 0;
  window.hinterland.layout.setChromeHeight(base);
  window.hinterland.layout.setPopupBottom(extra ? base + extra : 0);
}

export function bindShell(node) {
  shell = node;
  host = document.getElementById('popup');
  new ResizeObserver(() => report()).observe(shell);
  window.addEventListener('resize', () => report());
}

export function isOpen(key = '') {
  return Boolean(card) && (!key || key === currentKey);
}

export function closePopup() {
  if (!card) return;
  closeHandler?.();
  closeHandler = null;
  card.remove();
  card = null;
  currentKey = '';
  host.hidden = true;
  report();
}

/** Opens a surface directly beneath the toolbar. `render` receives its host node. */
export function openPopup({ key = '', align = 'stretch', onClose, render }) {
  if (card && currentKey === key) {
    closePopup();
    return null;
  }
  closePopup();

  host.hidden = false;
  card = el('div', { class: align === 'right' ? 'popupCard menuCard' : 'popupCard' });
  host.append(card);
  currentKey = key;
  closeHandler = typeof onClose === 'function' ? onClose : null;
  render(card);
  report();
  return card;
}

export function popupNode() {
  return card;
}

export function section(labelKey) {
  return el('div', { class: 'popupSection', text: t(labelKey) });
}

export function row({ iconName, title, subtitle, aside, selected, onSelect, trailing }) {
  const button = el('button', { class: `row${selected ? ' rowSelected' : ''}`, type: 'button' });
  button.addEventListener('click', () => onSelect?.(button));
  if (iconName) button.append(el('span', { class: 'rowIcon', html: icon(iconName) }));
  button.append(
    el('span', { class: 'rowBody' }, [
      el('span', { class: 'rowTitle', text: title }),
      subtitle ? el('span', { class: 'rowSub', text: subtitle }) : null,
    ]),
  );
  if (aside) button.append(el('span', { class: 'rowAside', text: aside }));
  if (trailing) button.append(...[].concat(trailing));
  return button;
}

export function separator() {
  return el('div', { class: 'separator' });
}

export function empty(message) {
  return el('div', { class: 'emptyState', text: message });
}