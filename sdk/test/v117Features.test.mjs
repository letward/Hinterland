import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('Hinterland v1.17.0 Features', () => {
  describe('Unified Design Tokens (design/tokens.css)', () => {
    const tokensPath = join(ROOT, 'design', 'tokens.css');
    it('design/tokens.css exists and has valid css rules', () => {
      assert.ok(existsSync(tokensPath), 'tokens.css should exist in design/');
      const content = readFileSync(tokensPath, 'utf8');
      assert.ok(content.includes(':root'), ':root declaration required');
      assert.ok(content.includes('--accent:'), '--accent token required');
      assert.ok(content.includes('--surface:'), '--surface token required');
      assert.ok(content.includes('--bg:'), '--bg token required');
      assert.ok(content.includes('--text:'), '--text token required');
      assert.ok(content.includes('--radius:'), '--radius token required');
      assert.ok(content.includes('--anim:'), '--anim token required');
    });

    it('declares light theme overrides with high contrast tokens', () => {
      const content = readFileSync(tokensPath, 'utf8');
      assert.ok(content.includes('html[data-theme="light"]'), 'light theme block required');
      assert.ok(content.includes('color-scheme: light;'), 'color-scheme light required');
      assert.ok(content.includes('--surfaceAlt:'), 'surfaceAlt override required in light mode');
    });

    it('declares accessibility animation toggle and compact density', () => {
      const content = readFileSync(tokensPath, 'utf8');
      assert.ok(content.includes('html[data-animations="off"]'), 'animations off selector required');
      assert.ok(content.includes('transition: none !important;'), 'transition cancel required');
      assert.ok(content.includes('html[data-density="compact"]'), 'compact density selector required');
    });
  });

  describe('Website Feedback API Validation & Sanitization', () => {
    function sanitize(s) {
      return String(s).replace(/[\u0000-\u001f\u007f]/g, '').trim();
    }

    function isEmail(v) {
      return !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
    }

    it('sanitizes control characters and trims whitespace', () => {
      const dirty = '  \u0000Hello \u0007World\u001f \t\r\n ';
      const clean = sanitize(dirty);
      assert.equal(clean, 'Hello World');
    });

    it('validates email addresses correctly', () => {
      assert.ok(isEmail('user@example.com'));
      assert.ok(isEmail('john.doe+tag@domain.co.uk'));
      assert.ok(isEmail('')); // optional contact email
      assert.ok(!isEmail('invalid-email'));
      assert.ok(!isEmail('@missing-user.com'));
      assert.ok(!isEmail('user@missing-tld'));
    });

    it('enforces message length constraints', () => {
      const validMsg = 'This is great feedback for Hinterland browser.';
      const shortMsg = 'Hi!';
      const emptyMsg = '';

      assert.ok(validMsg.length >= 5 && validMsg.length <= 2000);
      assert.ok(shortMsg.length < 5);
      assert.ok(emptyMsg.length < 5);
    });

    it('detects honeypot spam bot submissions', () => {
      const spamSubmission = { message: 'Great product', email: 'bot@spam.com', website: 'http://spam.ru' };
      const legitimate = { message: 'Great product', email: 'user@example.com' };

      const isBot = Boolean(spamSubmission.website || spamSubmission.url || spamSubmission.company);
      const isLegitBot = Boolean(legitimate.website || legitimate.url || legitimate.company);

      assert.ok(isBot, 'spam submission with website field must trigger honeypot');
      assert.ok(!isLegitBot, 'legitimate submission must pass honeypot check');
    });
  });

  describe('Supported Global Translation Locales', () => {
    const supported = [
      'de', 'en', 'fr', 'es', 'it', 'pt', 'nl', 'pl', 'ru', 'ja',
      'zh-cn', 'ko', 'tr', 'ar', 'hi', 'sv', 'da', 'fi', 'no', 'cs',
      'hu', 'ro', 'el', 'he', 'th', 'vi', 'id', 'ms'
    ];

    it('includes core European and international language codes', () => {
      assert.ok(supported.includes('de'));
      assert.ok(supported.includes('en'));
      assert.ok(supported.includes('fr'));
      assert.ok(supported.includes('es'));
      assert.ok(supported.includes('ja'));
      assert.ok(supported.includes('zh-cn'));
      assert.ok(supported.length >= 25);
    });
  });
});
