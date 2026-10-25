/**
 * @fileoverview Hinterland Extension SDK - UI Kit & Design Tokens
 * Provides lightweight, accessible UI components and design tokens matching Hinterland's sleek aesthetic.
 */

import { safeHtml } from './security.js';

export const HINTERLAND_CSS_VARS = `
:root {
  --ht-bg: #111317;
  --ht-surface: #181b22;
  --ht-surface-hover: #222631;
  --ht-border: #2d3340;
  --ht-text: #e6edf3;
  --ht-text-dim: #8b949e;
  --ht-accent: #388bfd;
  --ht-accent-hover: #58a6ff;
  --ht-danger: #f85149;
  --ht-success: #3fb950;
  --ht-warning: #d29922;
  --ht-radius: 8px;
  --ht-radius-sm: 4px;
  --ht-font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --ht-font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
}

@media (prefers-color-scheme: light) {
  :root {
    --ht-bg: #f6f8fa;
    --ht-surface: #ffffff;
    --ht-surface-hover: #f3f4f6;
    --ht-border: #d0d7de;
    --ht-text: #1f2328;
    --ht-text-dim: #656d76;
    --ht-accent: #0969da;
    --ht-accent-hover: #218bff;
    --ht-danger: #cf222e;
    --ht-success: #1a7f37;
    --ht-warning: #9a6700;
  }
}

body {
  margin: 0;
  padding: 0;
  background-color: var(--ht-bg);
  color: var(--ht-text);
  font-family: var(--ht-font-sans);
  font-size: 13px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

* {
  box-sizing: border-box;
}
`;

/**
 * Injects Hinterland design system tokens into the current document.
 *
 * @param {Document} [doc=document] - Target document
 */
export function injectHinterlandTheme(doc = document) {
  if (!doc) return;
  const style = doc.createElement('style');
  style.setAttribute('data-hinterland-theme', 'true');
  style.textContent = HINTERLAND_CSS_VARS;
  doc.head.prepend(style);
}

/**
 * Reactive state store for extension popup or content UI.
 *
 * @param {object} initialState - Initial store state
 */
export class Store {
  constructor(initialState = {}) {
    this.state = { ...initialState };
    this.listeners = new Set();
  }

  get(key) {
    return this.state[key];
  }

  getState() {
    return { ...this.state };
  }

  set(keyOrPatch, val) {
    if (typeof keyOrPatch === 'string') {
      this.state[keyOrPatch] = val;
    } else if (typeof keyOrPatch === 'object' && keyOrPatch !== null) {
      Object.assign(this.state, keyOrPatch);
    }
    this._notify();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  _notify() {
    for (const listener of this.listeners) {
      try {
        listener(this.getState());
      } catch (err) {
        console.error('[Store] Subscriber error:', err);
      }
    }
  }
}

/**
 * Factory for creating a reactive Store.
 *
 * @param {object} initialState
 * @returns {Store}
 */
export function createStore(initialState = {}) {
  return new Store(initialState);
}

/**
 * UI Component builders for popups and options views.
 */
export class UIHelper {
  /**
   * Creates an accessible button matching Hinterland styles.
   *
   * @param {object} options
   * @param {string} options.label - Button text
   * @param {'default'|'primary'|'danger'} [options.variant='default']
   * @param {Function} [options.onClick]
   * @returns {HTMLButtonElement}
   */
  static createButton({ label, variant = 'default', onClick }) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.style.cssText = `
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 6px 12px;
      font-size: 12px;
      font-weight: 500;
      border-radius: var(--ht-radius-sm);
      border: 1px solid var(--ht-border);
      cursor: pointer;
      transition: background 0.15s ease, border-color 0.15s ease;
      background: ${variant === 'primary' ? 'var(--ht-accent)' : variant === 'danger' ? 'var(--ht-danger)' : 'var(--ht-surface)'};
      color: ${variant === 'primary' || variant === 'danger' ? '#ffffff' : 'var(--ht-text)'};
    `;

    if (onClick) btn.addEventListener('click', onClick);
    return btn;
  }

  /**
   * Creates an accessible switch toggle.
   *
   * @param {object} options
   * @param {string} options.label - Toggle label
   * @param {boolean} [options.checked=false] - Initial checked state
   * @param {(checked: boolean) => void} [options.onChange]
   * @returns {HTMLElement}
   */
  static createSwitch({ label, checked = false, onChange }) {
    const wrapper = document.createElement('label');
    wrapper.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 8px 0;
      cursor: pointer;
      font-weight: 500;
    `;

    const span = document.createElement('span');
    span.textContent = label;

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.style.cssText = `
      appearance: none;
      width: 34px;
      height: 18px;
      background: ${checked ? 'var(--ht-accent)' : 'var(--ht-border)'};
      border-radius: 10px;
      position: relative;
      cursor: pointer;
      outline: none;
      transition: background 0.2s ease;
    `;

    const knob = document.createElement('span');
    knob.style.cssText = `
      position: absolute;
      top: 2px;
      left: ${checked ? '18px' : '2px'};
      width: 14px;
      height: 14px;
      background: #ffffff;
      border-radius: 50%;
      transition: left 0.2s ease;
      pointer-events: none;
    `;
    input.appendChild(knob);

    input.addEventListener('change', () => {
      input.style.background = input.checked ? 'var(--ht-accent)' : 'var(--ht-border)';
      knob.style.left = input.checked ? '18px' : '2px';
      if (onChange) onChange(input.checked);
    });

    wrapper.append(span, input);
    return wrapper;
  }

  /**
   * Creates a card container.
   *
   * @param {object} options
   * @param {string} [options.title]
   * @param {string} [options.subtitle]
   * @param {HTMLElement|HTMLElement[]} [options.content]
   * @returns {HTMLDivElement}
   */
  static createCard({ title, subtitle, content }) {
    const card = document.createElement('div');
    card.style.cssText = `
      background: var(--ht-surface);
      border: 1px solid var(--ht-border);
      border-radius: var(--ht-radius);
      padding: 14px;
      margin-bottom: 12px;
    `;

    if (title) {
      const header = document.createElement('div');
      header.style.cssText = 'font-weight: 600; font-size: 13px; margin-bottom: 4px;';
      header.textContent = title;
      card.appendChild(header);
    }

    if (subtitle) {
      const sub = document.createElement('div');
      sub.style.cssText = 'font-size: 11px; color: var(--ht-text-dim); margin-bottom: 10px;';
      sub.textContent = subtitle;
      card.appendChild(sub);
    }

    if (content) {
      if (Array.isArray(content)) card.append(...content);
      else card.appendChild(content);
    }

    return card;
  }

  /**
   * Creates a status badge element.
   *
   * @param {object} options
   * @param {string} options.text
   * @param {'success'|'warning'|'danger'|'neutral'} [options.status='neutral']
   * @returns {HTMLSpanElement}
   */
  static createBadge({ text, status = 'neutral' }) {
    const badge = document.createElement('span');
    badge.textContent = text;
    const colors = {
      success: { bg: 'rgba(63, 185, 80, 0.15)', text: 'var(--ht-success)' },
      warning: { bg: 'rgba(210, 153, 34, 0.15)', text: 'var(--ht-warning)' },
      danger: { bg: 'rgba(248, 81, 73, 0.15)', text: 'var(--ht-danger)' },
      neutral: { bg: 'var(--ht-surface-hover)', text: 'var(--ht-text-dim)' },
    }[status] || { bg: 'var(--ht-surface-hover)', text: 'var(--ht-text-dim)' };

    badge.style.cssText = `
      display: inline-block;
      padding: 2px 6px;
      font-size: 10px;
      font-weight: 600;
      border-radius: 4px;
      background: ${colors.bg};
      color: ${colors.text};
      text-transform: uppercase;
      letter-spacing: 0.5px;
    `;
    return badge;
  }
}
