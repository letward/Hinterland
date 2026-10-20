const fallback = (key) => key.split('.').at(-1);

let table = {};
let language = 'en';

export function setStrings(strings, code) {
  table = strings ?? {};
  language = code || 'en';
}

export function currentLanguage() {
  return language;
}

export function t(key, values) {
  if (typeof key !== 'string' || key.length === 0) return '';
  let text = table[key];
  if (text === undefined) text = fallback(key);
  if (!values) return text;
  return String(text).replaceAll(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match,
  );
}

export function applyTranslations(root = document) {
  for (const node of root.querySelectorAll('[data-i18n]')) {
    node.textContent = t(node.dataset.i18n);
  }
  for (const node of root.querySelectorAll('[data-i18n-title]')) {
    node.title = t(node.dataset.i18nTitle);
    node.setAttribute('aria-label', t(node.dataset.i18nTitle));
  }
  for (const node of root.querySelectorAll('[data-i18n-placeholder]')) {
    node.placeholder = t(node.dataset.i18nPlaceholder);
  }
}