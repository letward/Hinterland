import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
let checked = 0;

function walk(directory, filter) {
  const files = [];
  if (!existsSync(directory)) return files;
  for (const entry of readdirSync(directory)) {
    if (['node_modules', '.git', 'build', 'dist'].includes(entry)) continue;
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) files.push(...walk(full, filter));
    else if (filter(extname(full))) files.push(full);
  }
  return files;
}

/* ------------------------------------------------------------------ syntax */

const sources = walk(join(ROOT, 'src'), (ext) => ['.js', '.mjs', '.cjs'].includes(ext));
sources.push(...walk(join(ROOT, 'scripts'), (ext) => ['.mjs'].includes(ext)));
sources.push(...walk(join(ROOT, 'sdk'), (ext) => ['.js', '.mjs', '.cjs'].includes(ext)));
sources.push(...walk(join(ROOT, 'examples'), (ext) => ['.js', '.mjs', '.cjs'].includes(ext)));

for (const file of sources) {
  checked += 1;
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (error) {
    failures.push(`syntax ${file.replace(ROOT, '')}\n      ${String(error.stderr ?? error.message).split('\n').slice(0, 4).join('\n      ')}`);
  }
}

/* -------------------------------------------------------------------- json */

const jsonFiles = walk(join(ROOT, 'src'), (ext) => ext === '.json');
jsonFiles.push(...walk(join(ROOT, 'sdk'), (ext) => ext === '.json'));
jsonFiles.push(...walk(join(ROOT, 'examples'), (ext) => ext === '.json'));
for (const file of jsonFiles) {
  checked += 1;
  try {
    JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    failures.push(`json ${file.replace(ROOT, '')}: ${error.message}`);
  }
}

/* ------------------------------------------------------------------ locales */

function flatten(source, prefix = '', target = {}) {
  for (const [key, value] of Object.entries(source)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) flatten(value, path, target);
    else target[path] = String(value);
  }
  return target;
}

const localeDir = join(ROOT, 'src', 'ui', 'locales');
const locales = {};
for (const name of ['en', 'de']) {
  const file = join(localeDir, `${name}.json`);
  if (!existsSync(file)) {
    failures.push(`locale missing: ${name}.json`);
    continue;
  }
  locales[name] = flatten(JSON.parse(readFileSync(file, 'utf8')));
}

const schemaSource = readFileSync(join(ROOT, 'src', 'main', 'schema.js'), 'utf8');
const schemaKeys = new Set();
for (const match of schemaSource.matchAll(/labelKey:\s*'([^']+)'/g)) schemaKeys.add(match[1]);
for (const match of schemaSource.matchAll(/titleKey:\s*'([^']+)'/g)) schemaKeys.add(match[1]);

const uiSources = walk(join(ROOT, 'src', 'ui'), (ext) => ['.js'].includes(ext))
  .concat(walk(join(ROOT, 'src', 'main'), (ext) => ext === '.js'))
  .concat([join(ROOT, 'src', 'preload', 'chrome.cjs')]);

for (const file of uiSources) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(/\bt\(\s*'([a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+)+)'/g)) schemaKeys.add(match[1]);
  for (const match of source.matchAll(/t\(`([a-z][a-zA-Z0-9]*\.[a-zA-Z0-9.]+)`/g)) {
    if (!match[1].includes('${')) schemaKeys.add(match[1]);
  }
}

for (const [locale, table] of Object.entries(locales)) {
  for (const key of [...schemaKeys].sort()) {
    if (table[key] === undefined) failures.push(`missing ${locale} key: ${key}`);
  }
}

const [primary, secondary] = ['en', 'de'].map((name) => Object.keys(locales[name] ?? {}));
for (const key of primary) {
  if (!secondary.includes(key)) failures.push(`missing de key: ${key}`);
}
for (const key of secondary) {
  if (!primary.includes(key)) failures.push(`missing en key: ${key}`);
}

/* ------------------------------------------------------------------- report */

console.log(`checked ${checked} files, ${schemaKeys.size} string keys`);

if (failures.length) {
  console.error(`\n${failures.length} problem(s):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exitCode = 1;
} else {
  console.log('all good');
}