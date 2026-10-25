/**
 * @fileoverview Hinterland Pass - Popup Controller
 * Manages UI views, user interactions, password generation, and vault manipulation.
 */

import {
  calculateStrength,
  generatePassword,
  normalizeDomain,
} from './crypto.js';

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const statusPill = document.getElementById('vaultStatusPill');
  const btnLockVault = document.getElementById('btnLockVault');
  const btnClosePopup = document.getElementById('btnClosePopup');
  const toastEl = document.getElementById('toast');

  const viewSetup = document.getElementById('viewSetup');
  const viewUnlock = document.getElementById('viewUnlock');
  const viewDashboard = document.getElementById('viewDashboard');

  // Setup Form
  const formSetup = document.getElementById('formSetup');
  const setupPassword = document.getElementById('setupPassword');
  const setupConfirm = document.getElementById('setupConfirm');
  const setupStrengthBar = document.getElementById('setupStrengthBar');
  const setupStrengthLabel = document.getElementById('setupStrengthLabel');

  // Unlock Form
  const formUnlock = document.getElementById('formUnlock');
  const unlockPassword = document.getElementById('unlockPassword');
  const unlockError = document.getElementById('unlockError');

  // Dashboard Tabs
  const navTabs = document.querySelectorAll('.nav-tab');
  const tabPanes = document.querySelectorAll('.tab-pane');

  // Tab 1: This Site
  const currentSiteDomain = document.getElementById('currentSiteDomain');
  const btnAddForCurrentSite = document.getElementById('btnAddForCurrentSite');
  const siteLoginsList = document.getElementById('siteLoginsList');

  // Tab 2: All Logins
  const vaultSearchInput = document.getElementById('vaultSearchInput');
  const btnAddNewLogin = document.getElementById('btnAddNewLogin');
  const allLoginsList = document.getElementById('allLoginsList');

  // Tab 3: Generator
  const genPasswordDisplay = document.getElementById('genPasswordDisplay');
  const btnCopyGenerated = document.getElementById('btnCopyGenerated');
  const btnRegenerate = document.getElementById('btnRegenerate');
  const btnFillGenerated = document.getElementById('btnFillGenerated');
  const genStrengthBar = document.getElementById('genStrengthBar');
  const genStrengthLabel = document.getElementById('genStrengthLabel');
  const genEntropyLabel = document.getElementById('genEntropyLabel');
  const genLengthSlider = document.getElementById('genLengthSlider');
  const genLengthVal = document.getElementById('genLengthVal');
  const genUpper = document.getElementById('genUpper');
  const genLower = document.getElementById('genLower');
  const genNumbers = document.getElementById('genNumbers');
  const genSymbols = document.getElementById('genSymbols');
  const genAvoidAmbiguous = document.getElementById('genAvoidAmbiguous');

  // Tab 4: Settings
  const selectAutoLock = document.getElementById('selectAutoLock');
  const btnOpenChangePassword = document.getElementById('btnOpenChangePassword');
  const btnExportVault = document.getElementById('btnExportVault');
  const btnTriggerImport = document.getElementById('btnTriggerImport');
  const importFileInput = document.getElementById('importFileInput');

  // Modals
  const modalEditLogin = document.getElementById('modalEditLogin');
  const formEditLogin = document.getElementById('formEditLogin');
  const modalTitle = document.getElementById('modalTitle');
  const editItemId = document.getElementById('editItemId');
  const editTitle = document.getElementById('editTitle');
  const editDomain = document.getElementById('editDomain');
  const editUsername = document.getElementById('editUsername');
  const editPassword = document.getElementById('editPassword');
  const editNotes = document.getElementById('editNotes');
  const btnCloseModal = document.getElementById('btnCloseModal');
  const btnCancelEdit = document.getElementById('btnCancelEdit');
  const btnModalGenPassword = document.getElementById('btnModalGenPassword');

  const modalChangePassword = document.getElementById('modalChangePassword');
  const formChangePassword = document.getElementById('formChangePassword');
  const changeCurrentPassword = document.getElementById('changeCurrentPassword');
  const changeNewPassword = document.getElementById('changeNewPassword');
  const changeConfirmPassword = document.getElementById('changeConfirmPassword');
  const btnCloseChangePass = document.getElementById('btnCloseChangePass');
  const btnCancelChangePass = document.getElementById('btnCancelChangePass');

  let activeSiteDomain = '';
  let toastTimer = null;

  /* ----------------------------------------------------------------- Toast */

  function showToast(message) {
    if (toastTimer) clearTimeout(toastTimer);
    toastEl.textContent = message;
    toastEl.hidden = false;
    toastTimer = setTimeout(() => {
      toastEl.hidden = true;
    }, 2200);
  }

  /* ------------------------------------------------------------- Safe Copy */

  async function copyToClipboard(text, label = 'Copied to clipboard!') {
    try {
      await navigator.clipboard.writeText(text);
      showToast(label);
    } catch {
      showToast('Could not copy.');
    }
  }

  /* --------------------------------------------------- Show/Hide Toggles */

  document.querySelectorAll('[data-toggle-target]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-toggle-target');
      const input = document.getElementById(targetId);
      if (input) {
        input.type = input.type === 'password' ? 'text' : 'password';
      }
    });
  });

  /* ------------------------------------------------------- Message Helpers */

  function sendMessage(type, payload = null) {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ type, payload }, (response) => {
          resolve(response || { ok: false, error: 'No response from background.' });
        });
      } else {
        resolve({ ok: false, error: 'Extension runtime unavailable.' });
      }
    });
  }

  /* ------------------------------------------------------ View Controller */

  async function refreshState() {
    const res = await sendMessage('HP_GET_STATUS');
    if (!res?.ok || !res.status) {
      showUnlockView();
      return;
    }

    const { isInitialized, isUnlocked, activeTabDomain } = res.status;
    const urlParams = new URLSearchParams(window.location.search);
    const paramUrl = urlParams.get('activeUrl');
    const paramDomain = paramUrl ? normalizeDomain(paramUrl) : '';
    activeSiteDomain = paramDomain || activeTabDomain || '';

    if (!isInitialized) {
      showSetupView();
    } else if (!isUnlocked) {
      showUnlockView();
    } else {
      showDashboardView(res.status);
    }
  }

  function showSetupView() {
    viewSetup.hidden = false;
    viewUnlock.hidden = true;
    viewDashboard.hidden = true;
    btnLockVault.hidden = true;
    statusPill.textContent = 'Setup';
    statusPill.className = 'vault-status-pill';
  }

  function showUnlockView() {
    viewSetup.hidden = true;
    viewUnlock.hidden = false;
    viewDashboard.hidden = true;
    btnLockVault.hidden = true;
    statusPill.textContent = 'Locked';
    statusPill.className = 'vault-status-pill';
    unlockPassword.value = '';
    unlockError.hidden = true;
    setTimeout(() => unlockPassword.focus(), 50);
  }

  function showDashboardView(status) {
    viewSetup.hidden = true;
    viewUnlock.hidden = true;
    viewDashboard.hidden = false;
    btnLockVault.hidden = false;
    statusPill.textContent = 'Unlocked';
    statusPill.className = 'vault-status-pill unlocked';

    if (status.settings?.autoLockMinutes !== undefined) {
      selectAutoLock.value = String(status.settings.autoLockMinutes);
    }

    currentSiteDomain.textContent = activeSiteDomain || 'No active tab';
    loadThisSiteLogins();
    loadAllLogins();
    updateGeneratorPassword();
  }

  /* ------------------------------------------------------------ Setup Form */

  setupPassword.addEventListener('input', () => {
    const val = setupPassword.value;
    const strength = calculateStrength(val);
    setupStrengthBar.style.width = `${Math.min(100, Math.max(15, strength.score))}%`;
    setupStrengthBar.style.backgroundColor = strength.color;
    setupStrengthLabel.textContent = `Strength: ${strength.label} (${strength.entropy} bits)`;
    setupStrengthLabel.style.color = strength.color;
  });

  formSetup.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (setupPassword.value !== setupConfirm.value) {
      showToast('Passwords do not match.');
      return;
    }

    const res = await sendMessage('HP_SETUP_MASTER_PASSWORD', {
      masterPassword: setupPassword.value,
    });

    if (res?.ok) {
      showToast('Vault created successfully!');
      refreshState();
    } else {
      showToast(res?.error || 'Failed to initialize vault.');
    }
  });

  /* ----------------------------------------------------------- Unlock Form */

  formUnlock.addEventListener('submit', async (e) => {
    e.preventDefault();
    unlockError.hidden = true;

    const res = await sendMessage('HP_UNLOCK', {
      masterPassword: unlockPassword.value,
    });

    if (res?.ok) {
      refreshState();
    } else {
      unlockError.textContent = res?.error || 'Incorrect master password.';
      unlockError.hidden = false;
    }
  });

  btnLockVault.addEventListener('click', async () => {
    await sendMessage('HP_LOCK');
    showToast('Vault locked.');
    refreshState();
  });

  btnClosePopup.addEventListener('click', () => {
    if (window.hinterlandExtension?.closePopup) {
      window.hinterlandExtension.closePopup();
    } else {
      window.close();
    }
  });

  /* ------------------------------------------------------- Tab Navigation */

  navTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      navTabs.forEach((t) => t.classList.remove('active'));
      tabPanes.forEach((p) => { p.hidden = true; p.classList.remove('active'); });

      tab.classList.add('active');
      const targetPane = document.getElementById(tab.getAttribute('data-tab'));
      if (targetPane) {
        targetPane.hidden = false;
        targetPane.classList.add('active');
      }

      if (tab.id === 'navThisSite') loadThisSiteLogins();
      if (tab.id === 'navVault') loadAllLogins();
    });
  });

  /* ------------------------------------------------------- Tab 1: This Site */

  async function loadThisSiteLogins() {
    siteLoginsList.replaceChildren();

    if (!activeSiteDomain) {
      siteLoginsList.appendChild(createEmptyState('🌐', 'No active website detected.'));
      return;
    }

    const res = await sendMessage('HP_GET_LOGINS_FOR_URL', { domain: activeSiteDomain });
    const logins = res?.logins || [];

    if (logins.length === 0) {
      siteLoginsList.appendChild(
        createEmptyState('🛡️', `No logins saved for ${activeSiteDomain}.`, () => {
          openEditModal(null, activeSiteDomain);
        }, '+ Save Login for Site'),
      );
      return;
    }

    for (const item of logins) {
      siteLoginsList.appendChild(createLoginCard(item, true));
    }
  }

  btnAddForCurrentSite.addEventListener('click', () => {
    openEditModal(null, activeSiteDomain);
  });

  /* ------------------------------------------------------- Tab 2: All Logins */

  async function loadAllLogins() {
    allLoginsList.replaceChildren();
    const query = vaultSearchInput.value.trim();
    const res = await sendMessage('HP_GET_ALL_LOGINS', { query });
    const logins = res?.logins || [];

    if (logins.length === 0) {
      allLoginsList.appendChild(
        createEmptyState('🔍', query ? 'No matching logins found.' : 'Your vault is currently empty.'),
      );
      return;
    }

    for (const item of logins) {
      allLoginsList.appendChild(createLoginCard(item, false));
    }
  }

  vaultSearchInput.addEventListener('input', () => {
    loadAllLogins();
  });

  btnAddNewLogin.addEventListener('click', () => {
    openEditModal(null, '');
  });

  /* ------------------------------------------------------ Login Card Builder */

  function createLoginCard(item, isThisSite = false) {
    const card = document.createElement('div');
    card.className = 'login-card';

    // Top: Title, Username & Quick Actions
    const top = document.createElement('div');
    top.className = 'login-top';

    const titleBox = document.createElement('div');
    titleBox.className = 'login-title-box';

    const titleEl = document.createElement('span');
    titleEl.className = 'login-title';
    titleEl.textContent = item.title || item.domain || 'Untitled';

    const userEl = document.createElement('span');
    userEl.className = 'login-user';
    userEl.textContent = item.username || 'No username';

    titleBox.append(titleEl, userEl);

    const actions = document.createElement('div');
    actions.className = 'login-actions';

    const btnFav = document.createElement('button');
    btnFav.type = 'button';
    btnFav.className = 'icon-btn';
    btnFav.textContent = item.favorite ? '★' : '☆';
    btnFav.title = 'Favorite';
    btnFav.style.color = item.favorite ? '#e3b341' : 'var(--ht-text-dim)';
    btnFav.onclick = async () => {
      await sendMessage('HP_SAVE_LOGIN', { ...item, favorite: !item.favorite });
      if (isThisSite) loadThisSiteLogins();
      else loadAllLogins();
    };

    const btnEdit = document.createElement('button');
    btnEdit.type = 'button';
    btnEdit.className = 'icon-btn';
    btnEdit.textContent = '✎';
    btnEdit.title = 'Edit';
    btnEdit.onclick = () => openEditModal(item);

    const btnDelete = document.createElement('button');
    btnDelete.type = 'button';
    btnDelete.className = 'icon-btn';
    btnDelete.textContent = '🗑';
    btnDelete.title = 'Delete';
    btnDelete.onclick = async () => {
      if (confirm(`Delete login for "${item.title || item.domain}"?`)) {
        await sendMessage('HP_DELETE_LOGIN', { id: item.id });
        showToast('Login removed.');
        if (isThisSite) loadThisSiteLogins();
        else loadAllLogins();
      }
    };

    actions.append(btnFav, btnEdit, btnDelete);
    top.append(titleBox, actions);

    // Password Row
    const passRow = document.createElement('div');
    passRow.className = 'login-pass-row';

    const passSpan = document.createElement('span');
    passSpan.className = 'pass-text';
    passSpan.textContent = '••••••••••••';
    let revealed = false;

    const passActions = document.createElement('div');
    passActions.style.display = 'flex';
    passActions.style.gap = '4px';

    const btnReveal = document.createElement('button');
    btnReveal.type = 'button';
    btnReveal.className = 'icon-btn';
    btnReveal.textContent = '👁';
    btnReveal.title = 'Reveal password';
    btnReveal.onclick = () => {
      revealed = !revealed;
      passSpan.textContent = revealed ? item.password : '••••••••••••';
    };

    const btnCopyPass = document.createElement('button');
    btnCopyPass.type = 'button';
    btnCopyPass.className = 'icon-btn';
    btnCopyPass.textContent = '📋';
    btnCopyPass.title = 'Copy Password';
    btnCopyPass.onclick = () => copyToClipboard(item.password, 'Password copied!');

    passActions.append(btnReveal, btnCopyPass);
    passRow.append(passSpan, passActions);

    // Bottom Action Buttons
    const cardBtns = document.createElement('div');
    cardBtns.className = 'card-btns';

    if (item.username) {
      const btnCopyUser = document.createElement('button');
      btnCopyUser.type = 'button';
      btnCopyUser.className = 'btn small';
      btnCopyUser.textContent = 'Copy User';
      btnCopyUser.onclick = () => copyToClipboard(item.username, 'Username copied!');
      cardBtns.appendChild(btnCopyUser);
    }

    const btnAutofill = document.createElement('button');
    btnAutofill.type = 'button';
    btnAutofill.className = 'btn small primary';
    btnAutofill.textContent = '⚡ Autofill';
    btnAutofill.onclick = async () => {
      const tabId = Number(new URLSearchParams(window.location.search).get('tabId')) || undefined;
      await sendMessage('HP_AUTOFILL_ACTIVE_TAB', {
        username: item.username,
        password: item.password,
        tabId,
      });
      showToast('Autofilled active tab!');
      if (window.hinterlandExtension?.closePopup) {
        setTimeout(() => window.hinterlandExtension.closePopup(), 300);
      }
    };
    cardBtns.appendChild(btnAutofill);

    card.append(top, passRow, cardBtns);
    return card;
  }

  function createEmptyState(icon, text, actionFn = null, actionText = '') {
    const wrap = document.createElement('div');
    wrap.className = 'empty-state';

    const iconEl = document.createElement('div');
    iconEl.className = 'empty-state-icon';
    iconEl.textContent = icon;

    const textEl = document.createElement('div');
    textEl.textContent = text;
    wrap.append(iconEl, textEl);

    if (actionFn && actionText) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn primary small';
      btn.style.marginTop = '10px';
      btn.textContent = actionText;
      btn.onclick = actionFn;
      wrap.appendChild(btn);
    }

    return wrap;
  }

  /* --------------------------------------------------- Tab 3: Generator */

  function updateGeneratorPassword() {
    const options = {
      length: Number(genLengthSlider.value),
      uppercase: genUpper.checked,
      lowercase: genLower.checked,
      numbers: genNumbers.checked,
      symbols: genSymbols.checked,
      avoidAmbiguous: genAvoidAmbiguous.checked,
    };

    const password = generatePassword(options);
    genPasswordDisplay.textContent = password;

    const strength = calculateStrength(password);
    genStrengthBar.style.width = `${Math.min(100, Math.max(15, strength.score))}%`;
    genStrengthBar.style.backgroundColor = strength.color;
    genStrengthLabel.textContent = strength.label;
    genStrengthLabel.style.color = strength.color;
    genEntropyLabel.textContent = `${strength.entropy} bits entropy`;
  }

  genLengthSlider.addEventListener('input', () => {
    genLengthVal.textContent = genLengthSlider.value;
    updateGeneratorPassword();
  });

  [genUpper, genLower, genNumbers, genSymbols, genAvoidAmbiguous].forEach((el) => {
    el.addEventListener('change', updateGeneratorPassword);
  });

  btnRegenerate.addEventListener('click', updateGeneratorPassword);

  btnCopyGenerated.addEventListener('click', () => {
    copyToClipboard(genPasswordDisplay.textContent, 'Strong password copied!');
  });

  btnFillGenerated.addEventListener('click', async () => {
    const pwd = genPasswordDisplay.textContent;
    const tabId = Number(new URLSearchParams(window.location.search).get('tabId')) || undefined;
    await sendMessage('HP_AUTOFILL_ACTIVE_TAB', { password: pwd, tabId });
    showToast('Filled into active tab!');
    if (window.hinterlandExtension?.closePopup) {
      setTimeout(() => window.hinterlandExtension.closePopup(), 300);
    }
  });

  /* ---------------------------------------------------- Tab 4: Settings */

  selectAutoLock.addEventListener('change', async () => {
    const minutes = Number(selectAutoLock.value);
    await sendMessage('HP_UPDATE_SETTINGS', { autoLockMinutes: minutes });
    showToast(`Auto-lock set to ${selectAutoLock.options[selectAutoLock.selectedIndex].text}`);
  });

  btnExportVault.addEventListener('click', async () => {
    const res = await sendMessage('HP_EXPORT_VAULT');
    if (res?.ok && res.data) {
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hinterland-pass-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Vault exported!');
    } else {
      showToast('Export failed.');
    }
  });

  btnTriggerImport.addEventListener('click', () => {
    importFileInput.value = '';
    importFileInput.click();
  });

  importFileInput.addEventListener('change', async () => {
    const file = importFileInput.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const items = Array.isArray(parsed) ? parsed : parsed.items;
      if (!Array.isArray(items)) {
        showToast('Invalid backup file format.');
        return;
      }

      const res = await sendMessage('HP_IMPORT_VAULT', { items });
      if (res?.ok) {
        showToast(`Imported ${res.importedCount} logins successfully!`);
        loadThisSiteLogins();
        loadAllLogins();
      } else {
        showToast(res?.error || 'Import failed.');
      }
    } catch (err) {
      showToast('Error reading import file.');
    }
  });

  /* ------------------------------------------------ Modal: Add/Edit Login */

  function openEditModal(item = null, defaultDomain = '') {
    modalEditLogin.hidden = false;
    if (item) {
      modalTitle.textContent = 'Edit Login';
      editItemId.value = item.id;
      editTitle.value = item.title || '';
      editDomain.value = item.domain || '';
      editUsername.value = item.username || '';
      editPassword.value = item.password || '';
      editNotes.value = item.notes || '';
    } else {
      modalTitle.textContent = 'Add Login';
      editItemId.value = '';
      editTitle.value = defaultDomain || '';
      editDomain.value = defaultDomain || '';
      editUsername.value = '';
      editPassword.value = '';
      editNotes.value = '';
    }
    setTimeout(() => editTitle.focus(), 50);
  }

  function closeEditModal() {
    modalEditLogin.hidden = true;
  }

  btnCloseModal.addEventListener('click', closeEditModal);
  btnCancelEdit.addEventListener('click', closeEditModal);

  btnModalGenPassword.addEventListener('click', () => {
    editPassword.value = generatePassword({ length: 20 });
    editPassword.type = 'text';
    showToast('Generated strong password!');
  });

  formEditLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      id: editItemId.value || undefined,
      title: editTitle.value.trim(),
      domain: normalizeDomain(editDomain.value),
      url: editDomain.value.trim(),
      username: editUsername.value.trim(),
      password: editPassword.value,
      notes: editNotes.value.trim(),
    };

    const res = await sendMessage('HP_SAVE_LOGIN', payload);
    if (res?.ok) {
      showToast('Login saved!');
      closeEditModal();
      loadThisSiteLogins();
      loadAllLogins();
    } else {
      showToast(res?.error || 'Failed to save login.');
    }
  });

  /* ------------------------------------- Modal: Change Master Password */

  btnOpenChangePassword.addEventListener('click', () => {
    modalChangePassword.hidden = false;
    changeCurrentPassword.value = '';
    changeNewPassword.value = '';
    changeConfirmPassword.value = '';
    setTimeout(() => changeCurrentPassword.focus(), 50);
  });

  function closeChangePassModal() {
    modalChangePassword.hidden = true;
  }

  btnCloseChangePass.addEventListener('click', closeChangePassModal);
  btnCancelChangePass.addEventListener('click', closeChangePassModal);

  formChangePassword.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (changeNewPassword.value !== changeConfirmPassword.value) {
      showToast('New passwords do not match.');
      return;
    }

    const res = await sendMessage('HP_CHANGE_MASTER_PASSWORD', {
      currentPassword: changeCurrentPassword.value,
      newPassword: changeNewPassword.value,
    });

    if (res?.ok) {
      showToast('Master password updated!');
      closeChangePassModal();
    } else {
      showToast(res?.error || 'Failed to update master password.');
    }
  });

  // Initial check
  await refreshState();
});
