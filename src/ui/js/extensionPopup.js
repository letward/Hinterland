import { $, el, clear } from './util.js';
import { icon } from './icons.js';
import { t } from './i18n.js';
import { openPopup, closePopup, isOpen } from './popup.js';
import { toast } from './toast.js';

const api = () => window.hinterland;

let currentId = null;

export function openExtensionPopup(id) {
  if (currentId === id && isOpen()) {
    closePopup();
    currentId = null;
    return;
  }
  currentId = id;
  openPopup({
    key: 'extension',
    align: 'right',
    render: (card) => {
      api().extensions.info(id).then((info) => {
        card.replaceChildren();
        if (!info) {
          card.append(el('div', { class: 'empty', text: t('extensions.notFound') }));
          return;
        }
        card.append(extensionPopupContent(card, info));
      });
    },
    onClose: () => {
      currentId = null;
    },
  });
}

export function closeExtensionPopup() {
  if (isOpen()) closePopup();
  currentId = null;
}

function extensionPopupContent(card, info) {
  const header = el('div', { class: 'popupHeader' }, [
    el('div', { class: 'popupIcon' }, [
      info.icons
        ? el('img', {
          src: info.icons[Object.keys(info.icons).pop()],
          alt: '',
          style: { width: '24px', height: '24px', borderRadius: '4px' },
        })
        : el('span', { html: icon('puzzle'), style: { width: '24px', height: '24px' } }),
    ]),
    el('div', { class: 'popupTitle', text: info.name }),
    el('div', { class: 'popupVersion', text: `v${info.version}` }),
  ]);

  const desc = info.description
    ? el('div', { class: 'popupDesc', text: info.description })
    : null;

  const toggle = el('button', {
    class: 'switch',
    type: 'button',
    role: 'switch',
    'aria-checked': String(info.enabled),
  });
  toggle.addEventListener('click', async () => {
    const next = toggle.getAttribute('aria-checked') !== 'true';
    toggle.setAttribute('aria-checked', String(next));
    toggle.disabled = true;
    try {
      await api().extensions.toggle(id, next);
      toast(t(next ? 'extensions.enabled' : 'extensions.disabled'), 'success');
    } catch {
      toast(t('extensions.toggleFailed'), 'error');
    } finally {
      toggle.disabled = false;
    }
  });

  const toggleRow = el('div', { class: 'popupRow' }, [
    el('span', { class: 'popupRowLabel', text: t('extensions.enabled') }),
    toggle,
  ]);

  const actionBtn = info.action
    ? el('button', {
      class: 'button',
      type: 'button',
      onclick: async () => {
        await api().extensions.action(id);
        closePopup();
      },
    }, [el('span', { html: icon('puzzle') }), ` ${info.action.defaultTitle || t('extensions.action')}`])
    : null;

  const actionRow = actionBtn ? el('div', { class: 'popupRow' }, [actionBtn]) : null;

  const manageBtn = el('button', {
    class: 'button',
    type: 'button',
    onclick: () => {
      closePopup();
      window.dispatchEvent(new CustomEvent('hinterland:openpanel', { detail: { panel: 'extensions' } }));
    },
  }, [el('span', { html: icon('settings') }), ` ${t('extensions.manage')}`]);

  card.append(header);
  if (desc) card.append(desc);
  card.append(toggleRow);
  if (actionRow) card.append(actionRow);
  card.append(el('div', { class: 'separator' }), manageBtn);

  return card;
}

window.addEventListener('hinterland:extension-action', (event) => {
  const id = event.detail?.extensionId;
  if (!id) return;
  openExtensionPopup(id);
});
