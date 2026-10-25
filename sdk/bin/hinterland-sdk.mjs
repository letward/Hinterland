#!/usr/bin/env node

/**
 * @fileoverview Hinterland Extension SDK CLI Tool
 * Scaffolding, security auditing, validation, and packaging for Hinterland extensions.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, basename, relative, extname } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { validateManifest, PERMISSION_LEVELS } from '../src/manifest.js';

const VERSION = '1.0.0';

/* ------------------------------------------------------------- Terminal Colors */

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(msg = '') {
  console.log(msg);
}

function info(msg) {
  console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`);
}

function success(msg) {
  console.log(`${colors.green}✔${colors.reset} ${msg}`);
}

function warn(msg) {
  console.log(`${colors.yellow}⚠${colors.reset} ${colors.yellow}${msg}${colors.reset}`);
}

function error(msg) {
  console.error(`${colors.red}✖${colors.reset} ${colors.red}${msg}${colors.reset}`);
}

/* ----------------------------------------------------------------- CLI Actions */

function printBanner() {
  log(`${colors.bold}${colors.blue}Hinterland Extension SDK${colors.reset} ${colors.dim}v${VERSION}${colors.reset}`);
  log(`${colors.dim}A secure, developer-friendly toolkit for building Hinterland browser extensions.${colors.reset}\n`);
}

function printHelp() {
  printBanner();
  log(`Usage: hinterland-sdk <command> [options]\n`);
  log(`Commands:`);
  log(`  init <name>         Scaffold a new extension with secure defaults`);
  log(`  validate <dir>      Audit and validate an extension for security & MV3 compliance`);
  log(`  pack <dir> [out]    Validate and package extension into a distributable .zip archive`);
  log(`  version             Display SDK version`);
  log(`  help                Display this help guide\n`);
  log(`Options:`);
  log(`  --strict            Treat security warnings as errors during validation`);
  log(`  --dir <path>        Target directory for scaffolding (defaults to ./<name>)\n`);
}

/**
 * Scaffolds a new extension.
 */
function cmdInit(name, options = {}) {
  if (!name || name.startsWith('-')) {
    error('Extension name is required: hinterland-sdk init <extension-name>');
    process.exit(1);
  }

  const cleanName = name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
  const targetDir = resolve(options.dir || cleanName);

  if (existsSync(targetDir)) {
    error(`Target directory "${targetDir}" already exists. Please specify an empty directory.`);
    process.exit(1);
  }

  info(`Scaffolding new Hinterland extension in ${colors.bold}${targetDir}${colors.reset}...`);
  mkdirSync(targetDir, { recursive: true });
  mkdirSync(join(targetDir, 'icons'), { recursive: true });

  const titleName = name.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  // 1. manifest.json
  const manifest = {
    manifest_version: 3,
    name: titleName,
    version: '1.0.0',
    description: `A secure extension for Hinterland: ${titleName}`,
    permissions: ['activeTab', 'storage'],
    action: {
      default_title: titleName,
      default_popup: 'popup.html',
    },
    background: {
      service_worker: 'background.js',
    },
    content_scripts: [
      {
        matches: ['http://*/*', 'https://*/*'],
        js: ['content.js'],
        css: ['content.css'],
        run_at: 'document_idle',
      },
    ],
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'none';",
    },
  };
  writeFileSync(join(targetDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  // 2. background.js
  const backgroundJs = `/**
 * Background Service Worker for ${titleName}
 * Created with @hinterland/extension-sdk
 */

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[${titleName}] Installed:', details.reason);
  await chrome.storage.local.set({ enabled: true, count: 0 });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'GET_STATUS') {
    chrome.storage.local.get(['enabled', 'count']).then((data) => {
      sendResponse({ ok: true, data });
    });
    return true; // Keep message channel open for async response
  }

  if (message?.type === 'INCREMENT') {
    chrome.storage.local.get('count').then(async (data) => {
      const nextCount = (data.count || 0) + 1;
      await chrome.storage.local.set({ count: nextCount });
      sendResponse({ ok: true, count: nextCount });
    });
    return true;
  }
});
`;
  writeFileSync(join(targetDir, 'background.js'), backgroundJs, 'utf8');

  // 3. content.js
  const contentJs = `/**
 * Content Script for ${titleName}
 * Runs inside web pages securely in an isolated world.
 */

(function init() {
  console.log('[${titleName}] Content script initialized safely.');

  // Listen for actions dispatched from Hinterland or background
  window.addEventListener('hinterland:extension-action', (event) => {
    console.log('[${titleName}] Browser action clicked for:', event.detail?.extensionId);
  });
})();
`;
  writeFileSync(join(targetDir, 'content.js'), contentJs, 'utf8');

  // 4. content.css
  const contentCss = `/**
 * Scoped styles for ${titleName}
 */
[data-hinterland-ext-active] {
  transition: opacity 0.2s ease;
}
`;
  writeFileSync(join(targetDir, 'content.css'), contentCss, 'utf8');

  // 5. popup.html
  const popupHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(titleName)}</title>
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <div class="header">
    <div class="title">${escapeHtml(titleName)}</div>
    <span class="badge">v1.0.0</span>
  </div>

  <div class="card">
    <label class="switch-row">
      <span>Enable Extension</span>
      <input type="checkbox" id="toggleEnabled" checked>
    </label>
    <div class="stat-row">
      <span class="stat-label">Actions taken:</span>
      <span class="stat-value" id="countVal">0</span>
    </div>
  </div>

  <div class="actions">
    <button type="button" id="btnAction" class="btn primary">Trigger Action</button>
    <button type="button" id="btnClose" class="btn secondary">Close</button>
  </div>

  <script src="popup.js"></script>
</body>
</html>
`;
  writeFileSync(join(targetDir, 'popup.html'), popupHtml, 'utf8');

  // 6. popup.css
  const popupCss = `:root {
  --ht-bg: #111317;
  --ht-surface: #181b22;
  --ht-border: #2d3340;
  --ht-text: #e6edf3;
  --ht-text-dim: #8b949e;
  --ht-accent: #388bfd;
  --ht-radius: 8px;
}

body {
  width: 300px;
  margin: 0;
  padding: 16px;
  background: var(--ht-bg);
  color: var(--ht-text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 13px;
  user-select: none;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.title {
  font-weight: 600;
  font-size: 14px;
}

.badge {
  font-size: 10px;
  background: var(--ht-border);
  color: var(--ht-text-dim);
  padding: 2px 6px;
  border-radius: 4px;
}

.card {
  background: var(--ht-surface);
  border: 1px solid var(--ht-border);
  border-radius: var(--ht-radius);
  padding: 12px;
  margin-bottom: 14px;
}

.switch-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  margin-bottom: 10px;
}

.stat-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--ht-text-dim);
}

.actions {
  display: flex;
  gap: 8px;
}

.btn {
  flex: 1;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid var(--ht-border);
  transition: opacity 0.15s ease;
}

.btn.primary {
  background: var(--ht-accent);
  color: #ffffff;
  border-color: transparent;
}

.btn.secondary {
  background: var(--ht-surface);
  color: var(--ht-text);
}
`;
  writeFileSync(join(targetDir, 'popup.css'), popupCss, 'utf8');

  // 7. popup.js
  const popupJs = `/**
 * Popup Script for ${titleName}
 */

document.addEventListener('DOMContentLoaded', async () => {
  const toggle = document.getElementById('toggleEnabled');
  const countEl = document.getElementById('countVal');
  const btnAction = document.getElementById('btnAction');
  const btnClose = document.getElementById('btnClose');

  // Load state safely
  const stored = await chrome.storage.local.get(['enabled', 'count']);
  toggle.checked = stored.enabled !== false;
  countEl.textContent = String(stored.count || 0);

  toggle.addEventListener('change', async () => {
    await chrome.storage.local.set({ enabled: toggle.checked });
  });

  btnAction.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'INCREMENT' }, (res) => {
      if (res?.ok) countEl.textContent = String(res.count);
    });
  });

  btnClose.addEventListener('click', () => {
    if (window.hinterlandExtension?.closePopup) {
      window.hinterlandExtension.closePopup();
    } else {
      window.close();
    }
  });
});
`;
  writeFileSync(join(targetDir, 'popup.js'), popupJs, 'utf8');

  // 8. README.md
  const readmeMd = `# ${titleName}

A custom extension created for the Hinterland Browser.

## Structure

- \`manifest.json\`: Manifest V3 extension configuration with secure defaults.
- \`background.js\`: Background service worker managing state.
- \`content.js\` & \`content.css\`: Isolated in-page content script.
- \`popup.html\`, \`popup.js\`, \`popup.css\`: Safe action popup UI.

## Testing in Hinterland

1. Open Hinterland Browser.
2. Go to **Settings** > **Extensions**.
3. Enable **Allow Unpacked Extensions**.
4. Click **Install Unpacked Extension** and select this directory.
`;
  writeFileSync(join(targetDir, 'README.md'), readmeMd, 'utf8');

  success(`Successfully scaffolded ${colors.bold}${titleName}${colors.reset} in ${targetDir}`);
  log(`\nNext steps:`);
  log(`  1. cd ${cleanName}`);
  log(`  2. npx hinterland-sdk validate .`);
  log(`  3. Load unpacked in Hinterland (Settings > Extensions)\n`);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Scans code files for dangerous patterns.
 */
function scanCodeSecurity(directory) {
  const issues = [];
  const files = [];

  function walk(dir) {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === '.git') continue;
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (['.js', '.mjs', '.cjs', '.html'].includes(extname(full))) files.push(full);
    }
  }

  walk(directory);

  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    const rel = relative(directory, file);

    if (/\beval\s*\(/.test(content)) {
      issues.push({ file: rel, level: 'error', message: 'Use of eval() detected. This is strictly prohibited in Hinterland extensions.' });
    }
    if (/new\s+Function\s*\(/.test(content)) {
      issues.push({ file: rel, level: 'error', message: 'Use of new Function() detected. Dynamic code evaluation is prohibited.' });
    }
    if (/document\.write\s*\(/.test(content)) {
      issues.push({ file: rel, level: 'error', message: 'Use of document.write() detected. Use safe DOM methods or sanitizeHtml.' });
    }
    if (/http:\/\/(?!www\.w3\.org)[^l\s"']/i.test(content) && !rel.endsWith('.md')) {
      issues.push({ file: rel, level: 'warning', message: 'Unencrypted HTTP URL found. All network calls must use HTTPS.' });
    }
    if (/\.innerHTML\s*=/.test(content) && !content.includes('sanitizeHtml') && !content.includes('safeHtml')) {
      issues.push({ file: rel, level: 'warning', message: 'Direct innerHTML assignment detected. Use sanitizeHtml() or safeHtml to avoid XSS.' });
    }
  }

  return issues;
}

/**
 * Validates and audits an extension.
 */
function cmdValidate(dirArg, options = {}) {
  const dir = resolve(dirArg || '.');
  info(`Auditing extension in ${colors.bold}${dir}${colors.reset}...`);

  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    error(`Directory not found: ${dir}`);
    process.exit(1);
  }

  const manifestPath = join(dir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    error(`Missing "manifest.json" in ${dir}`);
    process.exit(1);
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    error(`Failed to parse manifest.json: ${err.message}`);
    process.exit(1);
  }

  // 1. Manifest validation
  const result = validateManifest(manifest, options);

  // 2. File references check
  const referencedFiles = [];
  if (manifest.background?.service_worker) referencedFiles.push(manifest.background.service_worker);
  if (manifest.action?.default_popup) referencedFiles.push(manifest.action.default_popup);
  if (Array.isArray(manifest.content_scripts)) {
    for (const cs of manifest.content_scripts) {
      if (Array.isArray(cs.js)) referencedFiles.push(...cs.js);
      if (Array.isArray(cs.css)) referencedFiles.push(...cs.css);
    }
  }

  for (const ref of referencedFiles) {
    const full = join(dir, ref);
    if (!existsSync(full)) {
      result.errors.push(`Referenced file does not exist: "${ref}"`);
    }
  }

  // 3. Code security audit
  const codeIssues = scanCodeSecurity(dir);
  for (const issue of codeIssues) {
    if (issue.level === 'error') {
      result.errors.push(`[${issue.file}] ${issue.message}`);
    } else {
      result.warnings.push(`[${issue.file}] ${issue.message}`);
    }
  }

  // Summary output
  log('\n' + colors.bold + 'Audit Report:' + colors.reset);
  log(`  Name:    ${manifest.name || 'Unknown'}`);
  log(`  Version: ${manifest.version || '0.0.0'}`);
  log(`  MV:      ${manifest.manifest_version || 'None'}`);

  if (result.errors.length > 0) {
    log(`\n${colors.red}${colors.bold}Errors (${result.errors.length}):${colors.reset}`);
    for (const err of result.errors) error(`  ${err}`);
  }

  if (result.warnings.length > 0) {
    log(`\n${colors.yellow}${colors.bold}Warnings (${result.warnings.length}):${colors.reset}`);
    for (const w of result.warnings) warn(`  ${w}`);
  }

  const passed = result.errors.length === 0 && (!options.strict || result.warnings.length === 0);

  log('');
  if (passed) {
    success(`Audit passed! Extension complies with Hinterland security & MV3 guidelines.`);
    return true;
  } else {
    error(`Audit failed. Please resolve the errors above before distributing.`);
    return false;
  }
}

/* ------------------------------------------------------------- Pure Node ZIP */

/**
 * Creates a standard ZIP archive from a directory without external dependencies.
 */
function createZipArchive(sourceDir, outputFile) {
  const files = [];

  function walk(dir) {
    for (const entry of readdirSync(dir)) {
      if (['node_modules', '.git', '.DS_Store'].includes(entry)) continue;
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full);
      } else {
        const rel = relative(sourceDir, full).replace(/\\/g, '/');
        files.push({ rel, full, size: st.size, mtime: st.mtime });
      }
    }
  }

  walk(sourceDir);

  const localHeaders = [];
  const centralRecords = [];
  let offset = 0;

  // CRC32 table
  const crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[i] = c;
  }

  function crc32(buf) {
    let crc = -1;
    for (let i = 0; i < buf.length; i++) {
      crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
    }
    return (crc ^ -1) >>> 0;
  }

  for (const file of files) {
    const rawData = readFileSync(file.full);
    const compressed = deflateRawSync(rawData);
    const useDeflate = compressed.length < rawData.length;
    const dataToStore = useDeflate ? compressed : rawData;
    const method = useDeflate ? 8 : 0; // 8 = Deflated, 0 = Stored
    const fileCrc = crc32(rawData);

    const nameBuf = Buffer.from(file.rel, 'utf8');

    // Local file header (30 bytes)
    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0); // PK\x03\x04
    lfh.writeUInt16LE(20, 4); // version needed
    lfh.writeUInt16LE(0, 6); // general flags
    lfh.writeUInt16LE(method, 8); // compression
    lfh.writeUInt16LE(0, 10); // mod time
    lfh.writeUInt16LE(0, 12); // mod date
    lfh.writeUInt32LE(fileCrc, 14); // crc32
    lfh.writeUInt32LE(dataToStore.length, 18); // comp size
    lfh.writeUInt32LE(rawData.length, 22); // uncomp size
    lfh.writeUInt16LE(nameBuf.length, 26); // name len
    lfh.writeUInt16LE(0, 28); // extra len

    const localChunk = Buffer.concat([lfh, nameBuf, dataToStore]);
    localHeaders.push(localChunk);

    // Central directory file header (46 bytes)
    const cdfh = Buffer.alloc(46);
    cdfh.writeUInt32LE(0x02014b50, 0); // PK\x01\x02
    cdfh.writeUInt16LE(20, 4); // version made by
    cdfh.writeUInt16LE(20, 6); // version needed
    cdfh.writeUInt16LE(0, 8); // flags
    cdfh.writeUInt16LE(method, 10); // method
    cdfh.writeUInt16LE(0, 12); // mod time
    cdfh.writeUInt16LE(0, 14); // mod date
    cdfh.writeUInt32LE(fileCrc, 16); // crc32
    cdfh.writeUInt32LE(dataToStore.length, 20); // comp size
    cdfh.writeUInt32LE(rawData.length, 24); // uncomp size
    cdfh.writeUInt16LE(nameBuf.length, 28); // name len
    cdfh.writeUInt16LE(0, 30); // extra len
    cdfh.writeUInt16LE(0, 32); // comment len
    cdfh.writeUInt16LE(0, 34); // disk num
    cdfh.writeUInt16LE(0, 36); // internal attrs
    cdfh.writeUInt32LE(0, 38); // external attrs
    cdfh.writeUInt32LE(offset, 42); // relative offset of local header

    centralRecords.push(Buffer.concat([cdfh, nameBuf]));
    offset += localChunk.length;
  }

  const centralDir = Buffer.concat(centralRecords);

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // PK\x05\x06
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // start disk
  eocd.writeUInt16LE(files.length, 8); // entries on disk
  eocd.writeUInt16LE(files.length, 10); // total entries
  eocd.writeUInt32LE(centralDir.length, 12); // size of central dir
  eocd.writeUInt32LE(offset, 16); // offset of central dir
  eocd.writeUInt16LE(0, 20); // comment len

  const finalZip = Buffer.concat([...localHeaders, centralDir, eocd]);
  writeFileSync(outputFile, finalZip);
}

/**
 * Packages extension into .zip.
 */
function cmdPack(dirArg, outArg) {
  const dir = resolve(dirArg || '.');
  const valid = cmdValidate(dir, { strict: true });
  if (!valid) {
    error('Cannot package extension: validation failed. Fix errors above.');
    process.exit(1);
  }

  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  const defaultOutName = `${manifest.name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-')}-v${manifest.version}.zip`;
  const outFile = resolve(outArg || defaultOutName);

  info(`Packaging ${manifest.name} into ${colors.bold}${outFile}${colors.reset}...`);
  createZipArchive(dir, outFile);
  success(`Package created successfully: ${outFile}`);
}

/* ----------------------------------------------------------------- CLI Runner */

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
    printHelp();
    return;
  }

  if (args[0] === 'version' || args[0] === '--version' || args[0] === '-v') {
    log(`v${VERSION}`);
    return;
  }

  const cmd = args[0];

  if (cmd === 'init') {
    const name = args[1];
    let dir = null;
    for (let i = 2; i < args.length; i++) {
      if (args[i] === '--dir' && args[i + 1]) dir = args[i + 1];
    }
    cmdInit(name, { dir });
  } else if (cmd === 'validate' || cmd === 'lint') {
    const dir = args[1] && !args[1].startsWith('-') ? args[1] : '.';
    const strict = args.includes('--strict');
    const ok = cmdValidate(dir, { strict });
    if (!ok) process.exit(1);
  } else if (cmd === 'pack') {
    const dir = args[1] && !args[1].startsWith('-') ? args[1] : '.';
    const out = args[2] && !args[2].startsWith('-') ? args[2] : null;
    cmdPack(dir, out);
  } else {
    error(`Unknown command: "${cmd}". Run "hinterland-sdk help" for usage.`);
    process.exit(1);
  }
}

main();
