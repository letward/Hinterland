import { app } from 'electron';
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { EventEmitter } from 'node:events';
import { SCHEMA, buildDefaults } from './schema.js';

const FILE_NAME = 'settings.json';

function deepGet(object, path) {
  return path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), object);
}

function deepSet(object, path, value) {
  const keys = path.split('.');
  let node = object;
  for (let index = 0; index < keys.length - 1; index += 1) {
    const key = keys[index];
    if (typeof node[key] !== 'object' || node[key] === null) node[key] = {};
    node = node[key];
  }
  node[keys[keys.length - 1]] = value;
}

function deepClone(value) {
  return structuredClone(value);
}

function coerce(definition, raw) {
  if (raw === undefined || raw === null) return deepClone(definition.default);
  try {
    switch (definition.type) {
      case 'bool':
        return Boolean(raw);
      case 'number': {
        let number = Number(raw);
        if (!Number.isFinite(number)) return deepClone(definition.default);
        if (typeof definition.min === 'number') number = Math.max(definition.min, number);
        if (typeof definition.max === 'number') number = Math.min(definition.max, number);
        return number;
      }
      case 'select':
        return definition.options.some((option) => option.value === raw)
          ? raw
          : deepClone(definition.default);
      case 'multiselect': {
        if (!Array.isArray(raw)) return deepClone(definition.default);
        const allowed = definition.options?.length ? definition.options.map((option) => option.value) : null;
        const values = allowed ? raw.filter((value) => allowed.includes(value)) : [...new Set(raw.map(String))];
        return values;
      }
      case 'list':
        return Array.isArray(raw) ? raw.map((entry) => deepClone(entry)) : [];
      case 'keyvalue': {
        if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
        return raw;
      }
      default:
        return typeof raw === typeof definition.default ? raw : deepClone(definition.default);
    }
  } catch {
    return deepClone(definition.default);
  }
}

export class Settings extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
    this.schema = SCHEMA;
    this.data = buildDefaults();
    this.filePath = join(app.getPath('userData'), FILE_NAME);
    this.timer = null;
  }

  load() {
    if (!existsSync(this.filePath)) return;
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8'));
      for (const definition of this.schema) {
        const value = coerce(definition, deepGet(parsed, definition.key));
        if (value !== undefined) deepSet(this.data, definition.key, value);
      }
    } catch (error) {
      console.warn('[Hinterland] Settings file could not be read, using defaults.', error.message);
    }
  }

  saveNow() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      const temporary = `${this.filePath}.tmp`;
      writeFileSync(temporary, JSON.stringify(this.data, null, 2), 'utf8');
      renameSync(temporary, this.filePath);
    } catch (error) {
      console.warn('[Hinterland] Settings could not be written.', error.message);
    }
  }

  scheduleSave() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.saveNow(), 250);
  }

  all() {
    return deepClone(this.data);
  }

  get(key) {
    const value = deepGet(this.data, key);
    return value === undefined ? deepGet(this.data, key) : value;
  }

  has(key) {
    return deepGet(this.data, key) !== undefined;
  }

  /** Resolves a setting and always falls back to the schema default. */
  value(key) {
    const found = SCHEMA.find((definition) => definition.key === key);
    const stored = deepGet(this.data, key);
    return stored === undefined ? deepClone(found?.default) : deepClone(stored);
  }

  set(key, value, { silent = false } = {}) {
    const definition = SCHEMA.find((entry) => entry.key === key);
    if (!definition) return false;
    const next = coerce(definition, value);
    const previous = deepGet(this.data, key);
    deepSet(this.data, key, next);
    this.scheduleSave();
    if (!silent && JSON.stringify(previous) !== JSON.stringify(next)) {
      this.emit('change', { key, value: deepClone(next), previous });
      this.emit(`change:${key}`, deepClone(next), deepClone(previous));
    }
    return true;
  }

  merge(patch, { silent = false } = {}) {
    const changed = [];
    for (const [key, value] of Object.entries(patch)) {
      const definition = SCHEMA.find((entry) => entry.key === key);
      if (!definition) continue;
      const next = coerce(definition, value);
      const previous = deepGet(this.data, key);
      if (JSON.stringify(previous) === JSON.stringify(next)) continue;
      deepSet(this.data, key, next);
      changed.push({ key, value: deepClone(next), previous: deepClone(previous) });
    }
    if (!changed.length) return [];
    this.scheduleSave();
    if (!silent) {
      for (const entry of changed) {
        this.emit('change', entry);
        this.emit(`change:${entry.key}`, entry.value, entry.previous);
      }
    }
    return changed;
  }

  reset(key) {
    const definition = SCHEMA.find((entry) => entry.key === key);
    if (!definition) return;
    this.set(key, deepClone(definition.default));
  }

  resetAll() {
    const before = this.all();
    this.data = buildDefaults();
    this.scheduleSave();
    this.emit('change', { key: '*', value: null, previous: before });
    this.emit('reset');
  }

  export() {
    return JSON.stringify(
      {
        format: 'hinterland.settings',
        version: 1,
        exportedAt: new Date().toISOString(),
        settings: this.all(),
      },
      null,
      2,
    );
  }

  import(text, { replace = false } = {}) {
    let parsed;
    try {
      parsed = typeof text === 'string' ? JSON.parse(text) : text;
    } catch {
      throw new Error('invalidJson');
    }
    const payload = parsed?.settings ?? parsed;
    if (!payload || typeof payload !== 'object') throw new Error('invalidPayload');
    const next = {};
    for (const definition of SCHEMA) {
      const value = deepGet(payload, definition.key);
      if (value !== undefined) deepSet(next, definition.key, coerce(definition, value));
    }
    if (replace) this.data = { ...buildDefaults(), ...next };
    else this.merge(next);
    if (replace) this.saveNow();
    return Object.keys(next).length;
  }
}

export const settings = new Settings();