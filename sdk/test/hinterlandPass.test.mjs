import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveKey,
  encryptVault,
  decryptVault,
  verifyMasterPassword,
  generatePassword,
  calculateStrength,
  normalizeDomain,
} from '../../src/extensions/hinterlandPass/crypto.js';

describe('Hinterland Pass Cryptography & Vault Engine', () => {
  test('encrypts and decrypts vault round-trip with master password', async () => {
    const master = 'SuperSecretMasterPassphrase123!';
    const originalVault = [
      {
        id: 'item_1',
        title: 'GitHub',
        domain: 'github.com',
        username: 'dev@hinterland.de',
        password: 'secureTokenPassword!987',
      },
      {
        id: 'item_2',
        title: 'Email',
        domain: 'mail.hinterland.de',
        username: 'admin',
        password: 'anotherStrongPassword456#',
      },
    ];

    const encryptedPkg = await encryptVault(originalVault, master);
    assert.ok(encryptedPkg.salt, 'salt must exist');
    assert.ok(encryptedPkg.iv, 'iv must exist');
    assert.ok(encryptedPkg.ciphertext, 'ciphertext must exist');
    assert.ok(encryptedPkg.verification, 'verification token must exist');

    // Decrypt with correct master password
    const decrypted = await decryptVault(encryptedPkg, master);
    assert.deepEqual(decrypted, originalVault, 'Decrypted vault must match original data');
  });

  test('validates correct master password and rejects incorrect passphrase', async () => {
    const master = 'CorrectPassphrase99!';
    const wrong = 'WrongPassphrase11!';
    const data = [{ id: '1', secret: 'myData' }];

    const pkg = await encryptVault(data, master);

    const valid = await verifyMasterPassword(pkg, master);
    assert.equal(valid, true, 'verifyMasterPassword must return true for correct passphrase');

    const invalid = await verifyMasterPassword(pkg, wrong);
    assert.equal(invalid, false, 'verifyMasterPassword must return false for wrong passphrase');

    await assert.rejects(
      async () => {
        await decryptVault(pkg, wrong);
      },
      /Decryption failed/,
      'decryptVault must reject incorrect passphrase',
    );
  });

  test('generates cryptographically secure passwords conforming to options', () => {
    const pwd20 = generatePassword({ length: 20 });
    assert.equal(pwd20.length, 20);

    const pwd32 = generatePassword({ length: 32 });
    assert.equal(pwd32.length, 32);

    // Alpha-only
    const alphaOnly = generatePassword({
      length: 25,
      uppercase: true,
      lowercase: true,
      numbers: false,
      symbols: false,
    });
    assert.match(alphaOnly, /^[A-Za-z]+$/);

    // Numbers only
    const digitsOnly = generatePassword({
      length: 12,
      uppercase: false,
      lowercase: false,
      numbers: true,
      symbols: false,
    });
    assert.match(digitsOnly, /^[0-9]+$/);
  });

  test('calculates password strength and entropy correctly', () => {
    const weak = calculateStrength('123456');
    assert.equal(weak.label, 'Weak');
    assert.ok(weak.entropy < 30);

    const strong = calculateStrength('K9#mQ2$zL8!vW4*xP1@r');
    assert.ok(strong.entropy >= 80);
    assert.equal(strong.label, 'Excellent');
  });

  test('normalizes domains accurately from various URL structures', () => {
    assert.equal(normalizeDomain('https://www.github.com/login'), 'github.com');
    assert.equal(normalizeDomain('http://sub.domain.org:8080/path?q=1'), 'sub.domain.org');
    assert.equal(normalizeDomain('www.google.com'), 'google.com');
    assert.equal(normalizeDomain('gitlab.com'), 'gitlab.com');
    assert.equal(normalizeDomain('https://gitlab.com'), 'gitlab.com');
  });
});
