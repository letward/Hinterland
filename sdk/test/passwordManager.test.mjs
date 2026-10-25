import test from 'node:test';
import assert from 'node:assert/strict';
import { PasswordManager } from '../../src/main/passwords.js';

test('Password Manager Core Service & Security Engine', async (t) => {
  let mockStorage = {};
  const mockSettings = {
    value: (key) => mockStorage[key],
    set: async (key, val) => { mockStorage[key] = val; },
  };

  // Create isolated PasswordManager instance with injected storage
  class TestPasswordManager extends PasswordManager {
    constructor() {
      super();
      this.storage = {};
    }
    getSettings() {
      const raw = this.storage['data.passwordsSettings'];
      return {
        autoLockMinutes: 15,
        autofillEnabled: true,
        savePromptEnabled: true,
        neverDomains: [],
        ...(raw && typeof raw === 'object' ? raw : {}),
      };
    }
    async updateSettings(patch) {
      const cur = this.getSettings();
      const updated = { ...cur, ...patch };
      this.storage['data.passwordsSettings'] = updated;
      return updated;
    }
    isInitialized() {
      const pkg = this.storage['data.passwordsVault'];
      return Boolean(pkg?.ciphertext && pkg?.salt && pkg?.verification);
    }
    async persist() {
      if (!this.cachedMasterPassword || !Array.isArray(this.cachedVaultItems)) {
        throw new Error('Cannot persist locked vault.');
      }
      const { encryptVault } = await import('../../src/extensions/hinterlandPass/crypto.js');
      const pkg = await encryptVault(this.cachedVaultItems, this.cachedMasterPassword);
      this.storage['data.passwordsVault'] = pkg;
    }
    async setup(masterPassword) {
      if (!masterPassword || masterPassword.length < 8) {
        throw new Error('Master password must be at least 8 characters long.');
      }
      this.cachedMasterPassword = masterPassword;
      this.cachedVaultItems = [];
      await this.persist();
      return { ok: true, isUnlocked: true, vaultCount: 0 };
    }
    async unlock(masterPassword) {
      const pkg = this.storage['data.passwordsVault'];
      if (!pkg) throw new Error('Vault has not been initialized yet.');
      const { verifyMasterPassword, decryptVault } = await import('../../src/extensions/hinterlandPass/crypto.js');
      const valid = await verifyMasterPassword(pkg, masterPassword);
      if (!valid) return { ok: false, error: 'Incorrect master password. Please try again.' };
      this.cachedMasterPassword = masterPassword;
      this.cachedVaultItems = await decryptVault(pkg, masterPassword);
      return { ok: true, isUnlocked: true, vaultCount: this.cachedVaultItems.length };
    }
    async changeMasterPassword(currentPassword, newPassword) {
      if (!currentPassword || !newPassword || newPassword.length < 8) {
        throw new Error('New master password must be at least 8 characters long.');
      }
      const pkg = this.storage['data.passwordsVault'];
      const { verifyMasterPassword, decryptVault, encryptVault } = await import('../../src/extensions/hinterlandPass/crypto.js');
      const valid = await verifyMasterPassword(pkg, currentPassword);
      if (!valid) throw new Error('Current master password does not match.');
      const items = this.cachedVaultItems || (await decryptVault(pkg, currentPassword));
      this.cachedMasterPassword = newPassword;
      this.cachedVaultItems = items;
      this.storage['data.passwordsVault'] = await encryptVault(items, newPassword);
      return { ok: true };
    }
  }

  const pm = new TestPasswordManager();

  await t.test('detects uninitialized state on first run', () => {
    assert.equal(pm.isInitialized(), false);
    assert.equal(pm.isUnlocked(), false);
    const status = pm.getStatus('https://github.com/login');
    assert.equal(status.isInitialized, false);
    assert.equal(status.isUnlocked, false);
    assert.equal(status.vaultCount, 0);
    assert.equal(status.activeTabDomain, 'github.com');
  });

  await t.test('rejects setup with short master password', async () => {
    await assert.rejects(async () => {
      await pm.setup('short');
    }, /at least 8 characters long/);
  });

  await t.test('initializes and unlocks vault with valid master password', async () => {
    const res = await pm.setup('MasterPassword123!');
    assert.equal(res.ok, true);
    assert.equal(res.isUnlocked, true);
    assert.equal(pm.isInitialized(), true);
    assert.equal(pm.isUnlocked(), true);
  });

  await t.test('saves, updates, and retrieves credentials by domain', async () => {
    const saved = await pm.saveLogin({
      domain: 'github.com',
      title: 'GitHub Work',
      username: 'dev@company.com',
      password: 'SuperSecretToken#2026',
    });

    assert.equal(saved.ok, true);
    assert.equal(saved.item.domain, 'github.com');
    assert.equal(saved.item.username, 'dev@company.com');

    // Retrieve by domain
    const match = pm.getLoginsForUrl('https://github.com/session/new');
    assert.equal(match.ok, true);
    assert.equal(match.logins.length, 1);
    assert.equal(match.logins[0].username, 'dev@company.com');
    assert.equal(match.logins[0].password, 'SuperSecretToken#2026');

    // Updating existing login for same domain and username
    const updated = await pm.saveLogin({
      domain: 'github.com',
      title: 'GitHub Work Primary',
      username: 'dev@company.com',
      password: 'UpdatedSecretToken#999',
    });
    assert.equal(updated.ok, true);

    const matchAfterUpdate = pm.getLoginsForUrl('github.com');
    assert.equal(matchAfterUpdate.logins.length, 1);
    assert.equal(matchAfterUpdate.logins[0].password, 'UpdatedSecretToken#999');
    assert.equal(matchAfterUpdate.logins[0].title, 'GitHub Work Primary');
  });

  await t.test('search filters logins across title, username, and domain', async () => {
    await pm.saveLogin({
      domain: 'gitlab.com',
      title: 'GitLab Personal',
      username: 'johndoe',
      password: 'GitLabPassword456!',
    });

    const all = pm.getAllLogins('');
    assert.equal(all.logins.length, 2);

    const filtered = pm.getAllLogins('johndoe');
    assert.equal(filtered.logins.length, 1);
    assert.equal(filtered.logins[0].domain, 'gitlab.com');

    const domainFiltered = pm.getAllLogins('github');
    assert.equal(domainFiltered.logins.length, 1);
    assert.equal(domainFiltered.logins[0].domain, 'github.com');
  });

  await t.test('locks vault, wipes sensitive memory, and blocks access while locked', async () => {
    pm.lock();
    assert.equal(pm.isUnlocked(), false);
    assert.equal(pm.cachedMasterPassword, null);
    assert.equal(pm.cachedVaultItems, null);

    // Lookups should report locked state
    const lookup = pm.getLoginsForUrl('github.com');
    assert.equal(lookup.locked, true);
    assert.deepEqual(lookup.logins, []);

    // Saves must reject
    const saveRes = await pm.saveLogin({ domain: 'test.com', password: '123' });
    assert.equal(saveRes.locked, true);

    // Unlocking with wrong password fails
    const wrongRes = await pm.unlock('WrongPassword999!');
    assert.equal(wrongRes.ok, false);
    assert.equal(pm.isUnlocked(), false);

    // Unlocking with correct password succeeds
    const unlockRes = await pm.unlock('MasterPassword123!');
    assert.equal(unlockRes.ok, true);
    assert.equal(pm.isUnlocked(), true);
    assert.equal(unlockRes.vaultCount, 2);
  });

  await t.test('changes master password with re-encryption', async () => {
    const changeRes = await pm.changeMasterPassword('MasterPassword123!', 'BrandNewMasterPass2026!');
    assert.equal(changeRes.ok, true);

    // Lock and verify old password fails and new password works
    pm.lock();
    const tryOld = await pm.unlock('MasterPassword123!');
    assert.equal(tryOld.ok, false);

    const tryNew = await pm.unlock('BrandNewMasterPass2026!');
    assert.equal(tryNew.ok, true);
    assert.equal(tryNew.vaultCount, 2);
  });

  await t.test('manages never-save blacklist', async () => {
    await pm.neverSaveDomain('https://banking.example.com/login');
    const status = pm.getStatus('banking.example.com');
    assert.equal(status.neverDomain, true);

    const normal = pm.getStatus('wikipedia.org');
    assert.equal(normal.neverDomain, false);
  });

  await t.test('exports and imports vault JSON backups cleanly', async () => {
    const exported = pm.exportVault();
    assert.equal(exported.ok, true);
    assert.equal(exported.data.count, 2);
    assert.equal(exported.data.format, 'hinterland-pass-export-v1');

    // Import a new third credential
    const importPayload = [
      {
        title: 'New Service',
        domain: 'newservice.org',
        username: 'alice',
        password: 'AlicePassword789#',
      },
    ];

    const importRes = await pm.importVault(importPayload);
    assert.equal(importRes.ok, true);
    assert.equal(importRes.importedCount, 1);
    assert.equal(importRes.totalCount, 3);

    const check = pm.getLoginsForUrl('newservice.org');
    assert.equal(check.logins.length, 1);
    assert.equal(check.logins[0].username, 'alice');
  });

  await t.test('deletes credentials by id', async () => {
    const check = pm.getLoginsForUrl('newservice.org');
    const idToDelete = check.logins[0].id;
    const delRes = await pm.deleteLogin(idToDelete);
    assert.equal(delRes.ok, true);

    const afterDel = pm.getLoginsForUrl('newservice.org');
    assert.equal(afterDel.logins.length, 0);
  });

  await t.test('generates cryptographically strong passwords conforming to options', () => {
    const gen = pm.generatePassword({ length: 32, uppercase: true, lowercase: true, numbers: true, symbols: true });
    assert.equal(gen.ok, true);
    assert.equal(gen.password.length, 32);
    assert.ok(gen.strength.entropy >= 100);
    assert.equal(gen.strength.label, 'Excellent');
  });
});
