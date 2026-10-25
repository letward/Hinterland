import { el, clear } from './util.js';
import { icon } from './icons.js';
import { t } from './i18n.js';

let modal = null;
let surface = null;
let content = null;
let onCloseHandler = null;

function nodes() {
  modal = document.getElementById('modal');
  surface = document.getElementById('modalSurface');
  content = document.getElementById('modalContent');
}

function activateItem(item, sidebar, nav) {
  for (const node of sidebar?.children ?? []) node.classList.remove('active');
  const index = nav.indexOf(item);
  if (sidebar?.children[index]) sidebar.children[index].classList.add('active');
  clear(content);
  content.append(item.render());
}

/**
 * Full surface overlay. `nav` items each provide their own render function,
 * which lets every panel stay independent of the modal shell.
 */
export function openModal({ title, iconName = 'shield', nav = [], activeId, onClose }) {
  nodes();
  if (!modal || !surface || !content) return;

  clear(surface);
  onCloseHandler = onClose ?? null;

  const bar = el('div', { class: 'modalBar' }, [
    el('span', { class: 'rowIcon', html: icon(iconName) }),
    el('div', { class: 'modalTitle', text: title }),
    el('button', {
      class: 'iconButton',
      type: 'button',
      html: icon('close'),
      title: t('action.close'),
      'aria-label': t('action.close'),
      onclick: () => closeModal(),
    }),
  ]);

  const body = el('div', { class: 'modalBody' });
  let sidebar = null;

  if (nav.length) {
    sidebar = el('nav', { class: 'modalNav' });
    nav.forEach((item) => {
      const button = el('button', { class: 'navItem', type: 'button' }, [
        el('span', { html: icon(item.icon ?? 'gear') }),
        el('span', { text: t(item.labelKey) }),
      ]);
      button.addEventListener('click', () => activateItem(item, sidebar, nav));
      sidebar.append(button);
    });
    body.append(sidebar);
  }

  body.append(content);
  surface.append(bar, body);
  if (!modal.open) modal.showModal();
  window.hinterland.layout.setFullscreen(true);
  if (nav.length) {
    const target = (activeId && nav.find((item) => item.id === activeId)) || nav[0];
    activateItem(target, sidebar, nav);
  }
}

export function closeModal() {
  nodes();
  if (!modal) return;
  window.hinterland.layout.setFullscreen(false);
  if (modal.open) modal.close();
  if (surface) clear(surface);
  onCloseHandler?.();
  onCloseHandler = null;
}

export function isModalOpen() {
  nodes();
  return Boolean(modal?.open);
}