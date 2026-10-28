import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const require = createRequire(import.meta.url);

describe('Hinterland v1.23.0 Features & Polish', () => {
  describe('Official User Guide Documentation', () => {
    const guidePath = join(ROOT, 'website', 'docs', 'user-guide.html');

    it('user guide HTML file exists', () => {
      assert.ok(existsSync(guidePath), 'website/docs/user-guide.html must exist');
    });

    it('contains all core guide sections and valid navigation anchors', () => {
      const html = readFileSync(guidePath, 'utf8');
      const expectedSections = ['start', 'browse', 'privacy', 'organize', 'settings', 'help'];
      for (const sectionId of expectedSections) {
        assert.ok(
          html.includes(`id="${sectionId}"`) || html.includes(`id='${sectionId}'`),
          `user guide should contain section #${sectionId}`
        );
        assert.ok(
          html.includes(`href="#${sectionId}"`) || html.includes(`href='#${sectionId}'`),
          `user guide navigation should link to #${sectionId}`
        );
      }
    });

    it('includes safety guidelines and responsible browsing notices', () => {
      const html = readFileSync(guidePath, 'utf8');
      assert.ok(html.includes('Safety rule:'), 'user guide must contain safety instructions');
      assert.ok(html.includes('Back to Hinterland'), 'user guide must have a back link');
    });
  });

  describe('UI Design Tokens & Tactile Button States', () => {
    it('declares pointer cursor and drag exclusion for button elements in tokens.css', () => {
      const uiTokens = readFileSync(join(ROOT, 'src', 'ui', 'css', 'tokens.css'), 'utf8');
      assert.ok(uiTokens.includes('button,'), 'tokens.css should define button selectors');
      assert.ok(uiTokens.includes('cursor: pointer'), 'buttons must default to pointer cursor');
      assert.ok(uiTokens.includes('-webkit-app-region: no-drag'), 'buttons must have no-drag in chrome');
      assert.ok(uiTokens.includes('cursor: not-allowed'), 'disabled buttons must show not-allowed cursor');
    });

    it('declares matching button cursor rules in website/tokens.css', () => {
      const webTokens = readFileSync(join(ROOT, 'website', 'tokens.css'), 'utf8');
      assert.ok(webTokens.includes('cursor: pointer'), 'website buttons must default to pointer cursor');
      assert.ok(webTokens.includes('cursor: not-allowed'), 'website disabled buttons must show not-allowed cursor');
    });
  });

  describe('In-Browser User Guide Accessibility & Locales', () => {
    it('defines user guide strings in both English and German locales', () => {
      const en = JSON.parse(readFileSync(join(ROOT, 'src', 'ui', 'locales', 'en.json'), 'utf8'));
      const de = JSON.parse(readFileSync(join(ROOT, 'src', 'ui', 'locales', 'de.json'), 'utf8'));

      assert.equal(typeof en.menu?.userGuide, 'string');
      assert.equal(typeof de.menu?.userGuide, 'string');
      assert.equal(typeof en.about?.userGuide, 'string');
      assert.equal(typeof de.about?.userGuide, 'string');
      assert.ok(en.menu.userGuide.length > 0);
      assert.ok(de.menu.userGuide.length > 0);
    });

    it('includes user guide launcher in main menu definition', () => {
      const menuSource = readFileSync(join(ROOT, 'src', 'ui', 'js', 'menu.js'), 'utf8');
      assert.ok(menuSource.includes("t('menu.userGuide')"), 'menu.js must reference menu.userGuide');
      assert.ok(menuSource.includes('user-guide.html'), 'menu.js must link to user-guide.html');
    });

    it('includes user guide button in about page definition', () => {
      const panelsSource = readFileSync(join(ROOT, 'src', 'ui', 'js', 'panels.js'), 'utf8');
      assert.ok(panelsSource.includes("t('about.userGuide')"), 'panels.js must reference about.userGuide');
      assert.ok(panelsSource.includes('user-guide.html'), 'panels.js must link to user-guide.html');
    });
  });

  describe('Website Feedback API Hardening', () => {
    const feedbackHandler = require('../../website/api/feedback.js');

    function mockRes() {
      const res = {
        statusCode: 200,
        headers: {},
        data: null,
        setHeader(k, v) {
          this.headers[k.toLowerCase()] = v;
          return this;
        },
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(payload) {
          this.data = payload;
          return this;
        },
        end() {
          return this;
        },
      };
      return res;
    }

    it('rejects missing or empty feedback text', async () => {
      const req = {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: { text: '' },
      };
      const res = mockRes();
      await feedbackHandler(req, res);
      assert.equal(res.statusCode, 400);
      assert.ok(res.data?.error);
    });

    it('rejects non-POST requests with 405 Method Not Allowed', async () => {
      const req = { method: 'GET', headers: {} };
      const res = mockRes();
      await feedbackHandler(req, res);
      assert.equal(res.statusCode, 405);
    });
  });

  describe('Account Portal Verification Integration', () => {
    const {
      createAccount,
      createVerificationCode,
      consumeVerificationCode,
      accountsByEmail,
    } = require('../../website/api/_account.js');

    it('successfully confirms account verification with valid code', async () => {
      const testEmail = `verify.v123.${Date.now()}@example.com`;
      const account = await createAccount({ email: testEmail, password: 'StrongPass123!' });
      assert.equal(account.emailVerified, false);

      const code = createVerificationCode({ identifier: testEmail, purpose: 'email' });
      assert.equal(code.length, 6);

      const consumed = consumeVerificationCode(code, { identifier: testEmail, purpose: 'email' });
      assert.equal(consumed.ok, true);

      // Verify email status is updated on account
      const found = accountsByEmail.get(testEmail);
      assert.ok(found);
      found.emailVerified = true;
      assert.equal(found.emailVerified, true);
    });
  });
});
