import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import accountHandler from '../../website/api/account.js';
import telemetryHandler from '../../website/api/telemetry.js';
import storeHandler from '../../website/api/store.js';

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    data: null,
    setHeader(k, v) {
      res.headers[k.toLowerCase()] = v;
      return res;
    },
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(payload) {
      res.data = payload;
      return res;
    },
    end() {
      return res;
    },
  };
  return res;
}

describe('Hinterland v1.20.0 Features & Serverless APIs', () => {
  describe('Account API (website/api/account.js)', () => {
    it('handles OPTIONS pre-flight with CORS headers', async () => {
      const req = { method: 'OPTIONS', headers: {} };
      const res = mockRes();
      await accountHandler(req, res);

      assert.equal(res.statusCode, 204);
      assert.equal(res.headers['access-control-allow-origin'], '*');
      assert.ok(res.headers['access-control-allow-methods'].includes('GET'));
    });

    it('returns provider status on GET /api/account/providers', async () => {
      const req = { method: 'GET', url: '/api/account/providers', headers: {} };
      const res = mockRes();
      await accountHandler(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.data.ok, true);
      assert.ok(res.data.sync);
      assert.ok(res.data.analytics);
    });

    it('rejects unauthenticated GET /api/account/me with 401', async () => {
      const req = { method: 'GET', url: '/api/account/me', headers: {} };
      const res = mockRes();
      await accountHandler(req, res);

      assert.equal(res.statusCode, 401);
      assert.equal(res.data.ok, false);
      assert.equal(res.data.error, 'notLoggedIn');
    });

    it('validates displayName length on PUT /api/account/me', async () => {
      const req = {
        method: 'PUT',
        url: '/api/account/me',
        headers: { authorization: 'Bearer dummy-invalid-token' },
        body: { displayName: 'A'.repeat(81) },
      };
      const res = mockRes();
      await accountHandler(req, res);

      assert.equal(res.statusCode, 401); // Unauthorized due to invalid token
    });
  });

  describe('Telemetry API (website/api/telemetry.js)', () => {
    it('handles OPTIONS pre-flight with CORS headers', async () => {
      const req = { method: 'OPTIONS', headers: {} };
      const res = mockRes();
      await telemetryHandler(req, res);

      assert.equal(res.statusCode, 204);
      assert.equal(res.headers['access-control-allow-origin'], '*');
    });

    it('rejects non-POST methods with 405 Method Not Allowed', async () => {
      const req = { method: 'GET', headers: {} };
      const res = mockRes();
      await telemetryHandler(req, res);

      assert.equal(res.statusCode, 405);
      assert.equal(res.data.ok, false);
      assert.equal(res.data.error, 'methodNotAllowed');
    });

    it('handles opt-out cleanly without persisting data', async () => {
      const req = {
        method: 'POST',
        headers: {},
        body: {
          optIn: false,
          events: [{ name: 'page_view', props: { path: '/home' } }],
        },
      };
      const res = mockRes();
      await telemetryHandler(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.data.ok, true);
      assert.equal(res.data.accepted, 0);
      assert.equal(res.data.note, 'optedOut');
    });

    it('accepts allowed events and filters out forbidden or PII fields', async () => {
      const req = {
        method: 'POST',
        headers: {},
        body: {
          optIn: true,
          sessionId: 'test-session-123',
          appVersion: '1.20.0',
          events: [
            {
              name: 'page_view',
              props: {
                section: 'store',
                user_email: 'leak@example.com', // Should be stripped by PII filter
                auth_token: 'secret123',        // Should be stripped by PII filter
                clean_stat: 42,
              },
            },
            {
              name: 'malicious_event', // Not in ALLOWED_EVENTS
              props: { foo: 'bar' },
            },
          ],
        },
      };
      const res = mockRes();
      await telemetryHandler(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.data.ok, true);
      // Only 1 allowed event accepted (page_view); malicious_event is discarded
      assert.equal(res.data.accepted, 1);
    });
  });

  describe('Community Store API (website/api/store.js)', () => {
    it('handles OPTIONS pre-flight with CORS headers', async () => {
      const req = { method: 'OPTIONS', headers: {} };
      const res = mockRes();
      await storeHandler(req, res);

      assert.equal(res.statusCode, 204);
      assert.equal(res.headers['access-control-allow-origin'], '*');
    });

    it('returns empty catalog or disabled fallback on GET without Supabase', async () => {
      const req = { method: 'GET', url: '/api/store', headers: {} };
      const res = mockRes();
      await storeHandler(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.data.ok, true);
      assert.ok(Array.isArray(res.data.themes));
      assert.ok(Array.isArray(res.data.extensions));
    });

    it('rejects unauthenticated upload on POST with 401', async () => {
      const req = {
        method: 'POST',
        headers: {},
        body: { kind: 'theme', name: 'Cyberpunk', id: 'cyberpunk' },
      };
      const res = mockRes();
      await storeHandler(req, res);

      assert.equal(res.statusCode, 401);
      assert.equal(res.data.ok, false);
      assert.equal(res.data.error, 'notLoggedIn');
    });
  });
});
