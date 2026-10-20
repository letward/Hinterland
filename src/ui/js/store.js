let data = {};

function read(path) {
  return path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), data);
}

export function setSettings(values) {
  data = values ?? {};
  return data;
}

export function settings() {
  return data;
}

export function get(path, fallbackValue) {
  const value = read(path);
  return value === undefined ? fallbackValue : value;
}

export function getAll() {
  return data;
}

export function clone(value) {
  return structuredClone(value);
}