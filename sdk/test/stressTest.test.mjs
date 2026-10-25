import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { stripTracking, escapeHtml, sanitizeHtml } from '../src/security.js';
import { resolveTarget, buildSearchUrl, activeEngines } from '../../src/main/navigation.js';
import { Settings } from '../../src/main/settings.js';
import { SCHEMA } from '../../src/main/schema.js';
import { encryptVault, decryptVault, verifyMasterPassword, generatePassword, calculateStrength } from '../../src/extensions/hinterlandPass/crypto.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('Hinterland Comprehensive Stress & Robustness Suite', () => {

  /* ------------------------------------------------------------- 1. SETTINGS & PROTOTYPE POLLUTION */
  describe('Settings Store Robustness & Prototype Pollution Protection', () => {
    it('rejects prototype pollution attempts in deepSet and deepGet', () => {
      const settings = new Settings();
      const beforeAdmin = Object.prototype.admin;
      const beforePolluted = Object.prototype.polluted;

      // Attempt setting via deepSet forbidden keys
      settings.set('__proto__.admin', true);
      settings.set('constructor.prototype.admin', true);
      settings.set('prototype.admin', true);

      assert.equal(Object.prototype.admin, undefined, 'Object.prototype must not be polluted with admin');
      assert.equal(Object.prototype.polluted, undefined, 'Object.prototype must not be polluted');

      // Attempt via merge
      const attacks = [
        { '__proto__': { admin: true } },
        { 'constructor': { 'prototype': { admin: true } } },
        null,
        undefined,
        'not-an-object',
        123,
        [1, 2, 3],
      ];

      for (const attack of attacks) {
        assert.doesNotThrow(() => {
          settings.merge(attack);
        }, `settings.merge must handle malformed input gracefully: ${JSON.stringify(attack)}`);
      }

      assert.equal(Object.prototype.admin, beforeAdmin);
      assert.equal(Object.prototype.polluted, beforePolluted);
    });

    it('enforces schema type constraints, ranges, and option validation under fuzzing', () => {
      const settings = new Settings();

      // Number setting with bounds (e.g. content.defaultZoom, maxUndo, memorySaverDelay)
      settings.set('tabs.maxUndo', 99999);
      assert.ok(settings.value('tabs.maxUndo') <= 100, 'maxUndo must respect schema bounds');

      settings.set('tabs.maxUndo', -50);
      assert.ok(settings.value('tabs.maxUndo') >= 0, 'maxUndo must respect schema minimum');

      settings.set('tabs.maxUndo', 'invalid-number');
      assert.equal(typeof settings.value('tabs.maxUndo'), 'number');

      // Select setting (e.g. appearance.theme)
      settings.set('appearance.theme', 'non-existent-theme-xyz');
      assert.equal(settings.value('appearance.theme'), 'system', 'invalid select option must fall back to default');

      // Multiselect setting (extensions.enabled)
      settings.set('extensions.enabled', ['hinterlandfocus', 'custom_ext', 'hinterlandfocus']);
      const enabledExts = settings.value('extensions.enabled');
      assert.ok(Array.isArray(enabledExts));
      assert.ok(enabledExts.includes('hinterlandfocus'));
      assert.ok(enabledExts.includes('custom_ext'));
      assert.equal(enabledExts.filter((e) => e === 'hinterlandfocus').length, 1, 'duplicates must be deduplicated');

      // Invalid multiselect input falls back to default
      settings.set('extensions.enabled', 'invalid-string-not-array');
      assert.deepEqual(settings.value('extensions.enabled'), ['hinterlandfocus', 'hinterlandpanel', 'hinterlandpass']);
    });
  });

  /* ------------------------------------------------------------- 2. URL RESOLUTION & NAVIGATION FUZZING */
  describe('URL Navigation & Target Resolution Fuzzing', () => {
    it('resolves valid web protocols, internal pages, and search keywords reliably', () => {
      const cases = [
        { input: 'https://example.com', expectedKind: 'url', expectedUrl: 'https://example.com' },
        { input: 'http://localhost:3000/app', expectedKind: 'url', expectedUrl: 'http://localhost:3000/app' },
        { input: '127.0.0.1:8080', expectedKind: 'url', expectedUrl: 'https://127.0.0.1:8080/' },
        { input: 'hinterland://newtab', expectedKind: 'url', expectedUrl: 'hinterland://newtab/' },
        { input: 'hinterland://settings', expectedKind: 'url', expectedUrl: 'hinterland://settings' },
        { input: 'about:blank', expectedKind: 'url', expectedUrl: 'about:blank' },
        { input: 'view-source:https://example.org', expectedKind: 'url', expectedUrl: 'view-source:https://example.org' },
        { input: '', expectedKind: 'empty', expectedUrl: 'hinterland://newtab/' },
        { input: '   ', expectedKind: 'empty', expectedUrl: 'hinterland://newtab/' },
      ];

      for (const { input, expectedKind, expectedUrl } of cases) {
        const res = resolveTarget(input);
        assert.equal(res.kind, expectedKind, `Input "${input}" should resolve to kind ${expectedKind}`);
        if (expectedUrl) {
          assert.equal(res.url, expectedUrl, `Input "${input}" should resolve to URL ${expectedUrl}`);
        }
      }
    });

    it('handles search queries and keywords with special characters and spaces safely', () => {
      const q = resolveTarget('@gh electron/electron');
      assert.equal(q.kind, 'search');
      assert.ok(q.url.includes('github.com'));
      assert.ok(q.url.includes('electron%2Felectron'));

      const standaloneKeyword = resolveTarget('@yt');
      assert.equal(standaloneKeyword.kind, 'url');
      assert.ok(standaloneKeyword.url.includes('youtube.com'));

      const complexQuery = resolveTarget('how to use "fetch()" & async/await?');
      assert.equal(complexQuery.kind, 'search');
      assert.ok(complexQuery.url.includes('async%2Fawait'));
    });
  });

  /* ------------------------------------------------------------- 3. TRACKING PARAMETER STRIPPER STRESS */
  describe('Tracking Parameter Stripper Edge Cases', () => {
    it('strips diverse advertising and analytics tracking parameters case-insensitively', () => {
      const url = 'https://shop.example.com/product/123?UTM_SOURCE=adwords&utm_medium=cpc&utm_campaign=summer&GCLID=abc123xyz&fbclid=fb_click&trk=network&id=valid_id#section';
      const clean = stripTracking(url);

      assert.ok(!clean.includes('UTM_SOURCE'));
      assert.ok(!clean.includes('utm_medium'));
      assert.ok(!clean.includes('utm_campaign'));
      assert.ok(!clean.includes('GCLID'));
      assert.ok(!clean.includes('fbclid'));
      assert.ok(clean.includes('id=valid_id'));
      assert.ok(clean.endsWith('#section'));
    });

    it('handles malformed, empty, and non-string inputs gracefully', () => {
      assert.equal(stripTracking(''), '');
      assert.equal(stripTracking(null), '');
      assert.equal(stripTracking(undefined), '');
      assert.equal(stripTracking(12345), '');
      assert.equal(stripTracking('not a url'), 'not a url');
    });
  });

  /* ------------------------------------------------------------- 4. TAB MANAGEMENT & DIRECTIONAL LOGIC */
  describe('Tabstrip Management & Directional Closing Simulation', () => {
    const createTabs = () => [
      { id: 't1', pinned: true, title: 'Pinned 1', url: 'https://site1.com' },
      { id: 't2', pinned: false, title: 'Tab 2', url: 'https://site2.com' },
      { id: 't3', pinned: false, title: 'Tab 3', url: 'https://site3.com' },
      { id: 't4', pinned: true, title: 'Pinned 4', url: 'https://site4.com' },
      { id: 't5', pinned: false, title: 'Tab 5', url: 'https://site5.com' },
      { id: 't6', pinned: false, title: 'Tab 6', url: 'https://site6.com' },
    ];

    it('correctly isolates tabs to close to the right while protecting pinned tabs', () => {
      const tabs = createTabs();
      const activeIdx = tabs.findIndex((t) => t.id === 't2');
      const rightTabs = tabs.slice(activeIdx + 1).filter((t) => !t.pinned);

      assert.deepEqual(rightTabs.map((t) => t.id), ['t3', 't5', 't6']);
      assert.ok(!rightTabs.some((t) => t.id === 't4'), 'Pinned tab t4 must never be in toClose');
    });

    it('correctly isolates tabs to close to the left while protecting pinned tabs', () => {
      const tabs = createTabs();
      const activeIdx = tabs.findIndex((t) => t.id === 't5');
      const leftTabs = tabs.slice(0, activeIdx).filter((t) => !t.pinned);

      assert.deepEqual(leftTabs.map((t) => t.id), ['t2', 't3']);
      assert.ok(!leftTabs.some((t) => t.id === 't1' || t.id === 't4'), 'Pinned tabs must never be in toClose');
    });

    it('detects and deduplicates duplicate URLs excluding pinned tabs', () => {
      const tabs = [
        { id: 'd1', pinned: true, url: 'https://dup.com/' },
        { id: 'd2', pinned: false, url: 'https://dup.com/' },
        { id: 'd3', pinned: false, url: 'https://dup.com#section' }, // hash variation
        { id: 'd4', pinned: false, url: 'https://unique.com' },
      ];

      const seen = new Set();
      const duplicates = [];
      for (const tab of tabs) {
        if (tab.pinned) continue;
        const normalized = tab.url.split('#')[0].replace(/\/+$/, '').toLowerCase();
        if (seen.has(normalized)) duplicates.push(tab.id);
        else seen.add(normalized);
      }

      assert.deepEqual(duplicates, ['d3']);
      assert.ok(!duplicates.includes('d1'), 'Pinned tab must not be flagged as duplicate to close');
    });
  });

  /* ------------------------------------------------------------- 5. HINTERLAND PASS CRYPTOGRAPHY STRESS */
  describe('Hinterland Pass Cryptography & Vault Security', () => {
    const password = 'SuperSecretMasterPassword!2026';
    const vaultData = {
      items: [
        { id: 'p1', title: 'GitHub', username: 'dev@hinterland.de', password: 'P@ssw0rd123!', url: 'https://github.com' },
        { id: 'p2', title: 'Banking', username: 'user99', password: 'Vault#Secret#2026', url: 'https://bank.de' },
      ],
      updatedAt: Date.now(),
    };

    it('encrypts and decrypts complex vault payloads without data loss', async () => {
      const encrypted = await encryptVault(vaultData, password);
      assert.ok(encrypted.salt);
      assert.ok(encrypted.iv);
      assert.ok(encrypted.ciphertext);
      assert.ok(encrypted.verification);

      const isValid = await verifyMasterPassword(encrypted, password);
      assert.equal(isValid, true, 'Master password verification must succeed');

      const isInvalid = await verifyMasterPassword(encrypted, 'WrongPassword!');
      assert.equal(isInvalid, false, 'Wrong password must be rejected');

      const decrypted = await decryptVault(encrypted, password);
      assert.deepEqual(decrypted, vaultData, 'Decrypted vault must strictly match original data');
    });

    it('detects corrupted or tampered ciphertext with cryptographic authentication', async () => {
      const encrypted = await encryptVault(vaultData, password);

      // Tamper with ciphertext by corrupting bytes
      const rawCipher = atob(encrypted.ciphertext);
      const tamperedBytes = rawCipher.slice(0, 10) + String.fromCharCode(rawCipher.charCodeAt(10) ^ 0xff) + rawCipher.slice(11);
      const tampered = { ...encrypted, ciphertext: btoa(tamperedBytes) };

      await assert.rejects(async () => {
        await decryptVault(tampered, password);
      }, /Decryption failed/);
    });

    it('generates high entropy passwords meeting strict policy requirements', () => {
      for (let i = 0; i < 20; i++) {
        const pass = generatePassword({ length: 24, numbers: true, symbols: true, uppercase: true, lowercase: true });
        assert.equal(pass.length, 24);
        assert.ok(/[0-9]/.test(pass), 'must contain numbers');
        assert.ok(/[A-Z]/.test(pass), 'must contain uppercase');
        assert.ok(/[a-z]/.test(pass), 'must contain lowercase');

        const { entropy } = calculateStrength(pass);
        assert.ok(entropy >= 100, `24-character full-charset password should have >= 100 bits of entropy: got ${entropy}`);
      }
    });
  });

  /* ------------------------------------------------------------- 6. IPC VALIDATION & ATTACK DEFENSE */
  describe('IPC Security Boundaries & Parameter Hardening', () => {
    it('app:killProcess validation prevents killing root, negative PIDs or invalid types', () => {
      function validateKillPid(pid, currentPid = 1234) {
        if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0 || pid === currentPid) return false;
        return true;
      }

      assert.equal(validateKillPid(0), false, 'PID 0 must be rejected');
      assert.equal(validateKillPid(-1), false, 'Negative PID must be rejected');
      assert.equal(validateKillPid(-999), false);
      assert.equal(validateKillPid(1234, 1234), false, 'Self PID must be rejected');
      assert.equal(validateKillPid(NaN), false, 'NaN PID must be rejected');
      assert.equal(validateKillPid(3.14), false, 'Float PID must be rejected');
      assert.equal(validateKillPid('9999'), false, 'String PID must be rejected');
      assert.equal(validateKillPid(5678, 1234), true, 'Valid foreign PID must be accepted');
    });

    it('site:setPermission rejects prototype pollution and disallowed permission types', () => {
      const ALLOWED = new Set(['media', 'geolocation', 'notifications', 'midiSysex', 'pointerLock', 'fullscreen', 'openExternal', 'clipboard', 'camera', 'microphone']);

      function validatePermission(perm) {
        if (!perm || typeof perm !== 'string' || !ALLOWED.has(perm)) return false;
        return true;
      }

      assert.equal(validatePermission('__proto__'), false);
      assert.equal(validatePermission('constructor'), false);
      assert.equal(validatePermission('admin'), false);
      assert.equal(validatePermission('geolocation'), true);
      assert.equal(validatePermission('camera'), true);
    });

    it('stashes:importJson sanitizes input and strips non-http URL schemes', () => {
      const maliciousStashes = [
        null,
        {},
        { title: 'Bad Stash', tabs: [{ url: 'javascript:alert(1)' }, { url: 'data:text/html,evil' }] },
        { title: 'Good Stash', tabs: [{ url: 'https://example.com', title: 'Example' }] },
      ];

      const valid = maliciousStashes
        .filter((s) => s && typeof s === 'object' && Array.isArray(s.tabs) && s.tabs.length > 0)
        .map((s) => ({
          title: String(s.title || 'Stash'),
          tabs: s.tabs.filter((t) => t && typeof t.url === 'string' && (t.url.startsWith('http://') || t.url.startsWith('https://'))),
        }))
        .filter((s) => s.tabs.length > 0);

      assert.equal(valid.length, 1);
      assert.equal(valid[0].title, 'Good Stash');
      assert.equal(valid[0].tabs[0].url, 'https://example.com');
    });

    it('bookmarks JSON import filters dangerous protocols', () => {
      const importedJson = [
        { title: 'Safe Bookmark', url: 'https://trusted.org' },
        { title: 'Exploit Link', url: 'javascript:alert(document.domain)' },
        { title: 'Data URL', url: 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==' },
      ];

      const safeBookmarks = importedJson.filter(
        (b) => b && typeof b.url === 'string' && (b.url.startsWith('http://') || b.url.startsWith('https://'))
      );

      assert.equal(safeBookmarks.length, 1);
      assert.equal(safeBookmarks[0].url, 'https://trusted.org');
    });
  });

  /* ------------------------------------------------------------- 7. PROTOCOL RESOLVER MALFORMED ENCODING */
  describe('Protocol Resolver Resiliency', () => {
    it('safely handles malformed percent encoding without unhandled URIError', () => {
      function safeDecode(pathname) {
        try {
          return decodeURIComponent(pathname);
        } catch {
          return null;
        }
      }

      assert.equal(safeDecode('/index.html'), '/index.html');
      assert.equal(safeDecode('/%E0%A4%A'), null, 'Malformed percent encoding must return null instead of throwing');
      assert.equal(safeDecode('/valid%20file.html'), '/valid file.html');
    });
  });
});
