import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI_PATH = fileURLToPath(new URL('../bin/hinterland-sdk.mjs', import.meta.url));
const TEMP_DIR = fileURLToPath(new URL('./tmp-test-ext', import.meta.url));

describe('Hinterland SDK CLI', () => {
  before(() => {
    if (existsSync(TEMP_DIR)) rmSync(TEMP_DIR, { recursive: true, force: true });
  });

  after(() => {
    if (existsSync(TEMP_DIR)) rmSync(TEMP_DIR, { recursive: true, force: true });
  });

  test('CLI prints version', () => {
    const out = execFileSync(process.execPath, [CLI_PATH, 'version'], { encoding: 'utf8' });
    assert.ok(out.includes('v1.0.0'));
  });

  test('CLI init creates full extension structure', () => {
    const out = execFileSync(process.execPath, [CLI_PATH, 'init', 'my-test-widget', '--dir', TEMP_DIR], { encoding: 'utf8' });
    assert.ok(out.includes('Successfully scaffolded'));

    assert.ok(existsSync(join(TEMP_DIR, 'manifest.json')));
    assert.ok(existsSync(join(TEMP_DIR, 'background.js')));
    assert.ok(existsSync(join(TEMP_DIR, 'content.js')));
    assert.ok(existsSync(join(TEMP_DIR, 'content.css')));
    assert.ok(existsSync(join(TEMP_DIR, 'popup.html')));
    assert.ok(existsSync(join(TEMP_DIR, 'popup.js')));
    assert.ok(existsSync(join(TEMP_DIR, 'popup.css')));
    assert.ok(existsSync(join(TEMP_DIR, 'README.md')));

    const manifest = JSON.parse(readFileSync(join(TEMP_DIR, 'manifest.json'), 'utf8'));
    assert.equal(manifest.manifest_version, 3);
    assert.equal(manifest.name, 'My Test Widget');
  });

  test('CLI validate passes on scaffolded extension', () => {
    const out = execFileSync(process.execPath, [CLI_PATH, 'validate', TEMP_DIR], { encoding: 'utf8' });
    assert.ok(out.includes('Audit passed!'));
  });

  test('CLI pack creates valid zip archive', () => {
    const zipPath = join(TEMP_DIR, 'package.zip');
    const out = execFileSync(process.execPath, [CLI_PATH, 'pack', TEMP_DIR, zipPath], { encoding: 'utf8' });
    assert.ok(out.includes('Package created successfully'));
    assert.ok(existsSync(zipPath));
  });
});
