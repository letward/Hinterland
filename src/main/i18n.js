import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { I18N_ROOT } from './resources.js';

const SUPPORTED = ['de', 'en'];
const cache = new Map();

function flatten(source, prefix = '', target = {}) {
  for (const [key, value] of Object.entries(source ?? {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) flatten(value, path, target);
    else target[path] = String(value);
  }
  return target;
}

function loadLocale(code) {
  if (cache.has(code)) return cache.get(code);
  const file = join(I18N_ROOT, `${code}.json`);
  let flat = {};
  if (existsSync(file)) {
    try {
      flat = flatten(JSON.parse(readFileSync(file, 'utf8')));
    } catch (error) {
      console.warn(`[Hinterland] Locale ${code} could not be read.`, error.message);
    }
  }
  cache.set(code, flat);
  return flat;
}

export function systemLanguage() {
  const raw = (Intl.DateTimeFormat().resolvedOptions().locale || 'en').toLowerCase();
  const base = raw.split(/[-_]/)[0];
  return SUPPORTED.includes(base) ? base : 'en';
}

export function resolveLanguage(preference) {
  if (preference && preference !== 'system' && SUPPORTED.includes(preference)) return preference;
  return systemLanguage();
}

export function availableLanguages() {
  return [...SUPPORTED];
}

export function translations(code) {
  const primary = loadLocale(code);
  if (code === 'en') return primary;
  return { ...loadLocale('en'), ...primary };
}

export function translate(code, key, values = {}) {
  const table = translations(code);
  let text = table[key] ?? loadLocale('en')[key] ?? key;
  for (const [name, value] of Object.entries(values)) {
    text = text.replaceAll(`{${name}}`, String(value));
  }
  return text;
}