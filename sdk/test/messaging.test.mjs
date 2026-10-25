import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createMessageBus } from '../src/messaging.js';
import { validateOrigin } from '../src/security.js';

describe('Messaging System', () => {
  test('registers and unregisters typed message handlers', () => {
    const bus = createMessageBus();
    const handler = (payload) => ({ echo: payload });
    const unsubscribe = bus.on('PING', handler);

    assert.equal(bus.handlers.has('PING'), true);
    assert.equal(bus.handlers.get('PING').handler, handler);

    unsubscribe();
    assert.equal(bus.handlers.has('PING'), false);
  });

  test('validateOrigin verifies sender extension ID', () => {
    // Mock chrome environment
    globalThis.chrome = {
      runtime: {
        id: 'hinterland_trusted_ext_id',
      },
    };

    const validSender = { id: 'hinterland_trusted_ext_id' };
    const forgedSender = { id: 'malicious_impersonator' };

    assert.equal(validateOrigin(validSender), true);
    assert.equal(validateOrigin(forgedSender), false);
    assert.equal(validateOrigin(null), false);

    delete globalThis.chrome;
  });
});
