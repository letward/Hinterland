/**
 * @fileoverview Hinterland Pass - In-Page Content Script
 * Detects login forms, provides in-field autofill badges, and displays isolated save-password banners.
 */

(function initHinterlandPass() {
  if (window.__hinterlandPassActive) return;
  window.__hinterlandPassActive = true;

  const currentHostname = location.hostname.toLowerCase().replace(/^www\./, '');
  let activeDropdownHost = null;
  let activeBannerHost = null;

  // Track discovered input elements
  const processedInputs = new WeakSet();

  /**
   * Helper to safely create an element with attributes and children.
   */
  function createElement(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    for (const [key, val] of Object.entries(attrs)) {
      if (key === 'style' && typeof val === 'object') {
        Object.assign(el.style, val);
      } else if (key.startsWith('on') && typeof val === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), val);
      } else if (key === 'text') {
        el.textContent = val;
      } else {
        el.setAttribute(key, val);
      }
    }
    for (const child of children) {
      if (typeof child === 'string') {
        el.appendChild(document.createTextNode(child));
      } else if (child instanceof Node) {
        el.appendChild(child);
      }
    }
    return el;
  }

  /**
   * Dispatches synthetic events to notify frameworks (React, Vue, Angular) of value changes.
   */
  function setInputValue(input, value) {
    if (!input) return;
    input.focus();

    const proto = Object.getPrototypeOf(input);
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set ||
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

    if (nativeSetter) {
      nativeSetter.call(input, value);
    } else {
      input.value = value;
    }

    input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));
  }

  /**
   * Finds the best associated username input for a given password field.
   */
  function findAssociatedUsername(passwordInput) {
    const form = passwordInput.form;
    const candidates = [];

    const isUsernameField = (input) => {
      if (input === passwordInput) return false;
      if (input.type !== 'text' && input.type !== 'email' && input.type !== 'tel') return false;
      const attr = `${input.name} ${input.id} ${input.autocomplete || ''} ${input.placeholder || ''}`.toLowerCase();
      return /user|email|login|account|identifier|usr|name/i.test(attr) || input.type === 'email';
    };

    if (form) {
      const inputs = [...form.querySelectorAll('input')];
      for (const input of inputs) {
        if (isUsernameField(input)) candidates.push(input);
      }
      if (candidates.length === 0) {
        // Fallback: any text or email input before the password field
        const pIndex = inputs.indexOf(passwordInput);
        for (let i = pIndex - 1; i >= 0; i--) {
          const inp = inputs[i];
          if (inp.type === 'text' || inp.type === 'email') return inp;
        }
      }
    } else {
      // Inputs without form
      const allInputs = [...document.querySelectorAll('input')];
      const pIndex = allInputs.indexOf(passwordInput);
      for (let i = pIndex - 1; i >= Math.max(0, pIndex - 4); i--) {
        const inp = allInputs[i];
        if (isUsernameField(inp)) return inp;
      }
      for (let i = pIndex - 1; i >= Math.max(0, pIndex - 4); i--) {
        const inp = allInputs[i];
        if (inp.type === 'text' || inp.type === 'email') return inp;
      }
    }

    return candidates[0] || null;
  }

  /**
   * Attaches an in-field Hinterland Pass badge to an input.
   */
  function attachFieldBadge(input, isPassword = false) {
    if (processedInputs.has(input)) return;
    processedInputs.add(input);

    const badgeHost = document.createElement('div');
    badgeHost.className = 'hinterland-pass-host';
    const shadow = badgeHost.attachShadow({ mode: 'closed' });

    const badge = createElement('button', {
      type: 'button',
      tabindex: '-1',
      title: 'Hinterland Pass',
      'aria-label': 'Hinterland Pass Autofill',
      style: {
        width: '20px',
        height: '20px',
        padding: '0',
        border: 'none',
        borderRadius: '4px',
        background: '#161b22',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'transform 0.15s ease, background 0.15s ease',
        outline: 'none',
      },
      onclick: (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleDropdown(input, isPassword);
      },
    });

    badge.addEventListener('mouseenter', () => {
      badge.style.transform = 'scale(1.15)';
      badge.style.background = '#1f242c';
    });
    badge.addEventListener('mouseleave', () => {
      badge.style.transform = 'scale(1)';
      badge.style.background = '#161b22';
    });

    // SVG Shield Icon
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '13');
    svg.setAttribute('height', '13');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', '#388bfd');
    svg.setAttribute('stroke-width', '2.2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');

    const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path1.setAttribute('d', 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z');
    const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    path2.setAttribute('cx', '12');
    path2.setAttribute('cy', '10');
    path2.setAttribute('r', '2');
    const path3 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path3.setAttribute('d', 'M12 12v3');

    svg.append(path1, path2, path3);
    badge.appendChild(svg);
    shadow.appendChild(badge);
    document.body.appendChild(badgeHost);

    function positionBadge() {
      if (!input.isConnected || input.offsetParent === null) {
        badgeHost.style.display = 'none';
        return;
      }
      const rect = input.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        badgeHost.style.display = 'none';
        return;
      }

      badgeHost.style.display = 'block';
      const rightPadding = 6;
      badgeHost.style.top = `${window.scrollY + rect.top + (rect.height - 20) / 2}px`;
      badgeHost.style.left = `${window.scrollX + rect.right - 20 - rightPadding}px`;
    }

    positionBadge();

    window.addEventListener('resize', positionBadge, { passive: true });
    window.addEventListener('scroll', positionBadge, { passive: true });

    // Re-check visibility periodically
    const interval = setInterval(() => {
      if (!input.isConnected) {
        clearInterval(interval);
        badgeHost.remove();
      } else {
        positionBadge();
      }
    }, 1500);
  }

  /**
   * Toggles the autofill / password generator dropdown next to an input.
   */
  async function toggleDropdown(input, isPassword) {
    if (activeDropdownHost) {
      activeDropdownHost.remove();
      activeDropdownHost = null;
      return;
    }

    const host = document.createElement('div');
    host.className = 'hinterland-pass-host';
    const shadow = host.attachShadow({ mode: 'closed' });
    activeDropdownHost = host;

    // Fetch logins for current URL
    let logins = [];
    let isLocked = false;

    try {
      const res = await chrome.runtime.sendMessage({
        type: 'HP_GET_LOGINS_FOR_URL',
        domain: currentHostname,
      });
      if (res?.ok) {
        logins = res.logins || [];
        isLocked = Boolean(res.locked);
      }
    } catch {
      isLocked = true;
    }

    const menu = createElement('div', {
      style: {
        width: '260px',
        background: '#161b22',
        border: '1px solid #30363d',
        borderRadius: '8px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        color: '#e6edf3',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: '12px',
        overflow: 'hidden',
        userSelect: 'none',
      },
    });

    // Header
    const header = createElement('div', {
      style: {
        padding: '8px 12px',
        background: '#0d1117',
        borderBottom: '1px solid #21262d',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '11px',
        fontWeight: '600',
        color: '#8b949e',
      },
    }, [
      createElement('span', { text: 'HINTERLAND PASS' }),
      createElement('span', { text: currentHostname, style: { color: '#58a6ff' } }),
    ]);
    menu.appendChild(header);

    const list = createElement('div', { style: { maxHeight: '200px', overflowY: 'auto' } });

    if (isLocked) {
      const lockedRow = createElement('div', {
        style: {
          padding: '12px',
          textAlign: 'center',
          color: '#d29922',
        },
      }, [
        createElement('div', { text: '🔒 Vault is locked' }),
        createElement('div', { text: 'Unlock via toolbar icon to autofill', style: { fontSize: '10px', color: '#8b949e', marginTop: '4px' } }),
      ]);
      list.appendChild(lockedRow);
    } else if (logins.length === 0) {
      const emptyRow = createElement('div', {
        style: {
          padding: '12px',
          textAlign: 'center',
          color: '#8b949e',
        },
        text: 'No saved logins for this site.',
      });
      list.appendChild(emptyRow);
    } else {
      for (const item of logins) {
        const itemRow = createElement('div', {
          style: {
            padding: '8px 12px',
            cursor: 'pointer',
            borderBottom: '1px solid #21262d',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            transition: 'background 0.15s ease',
          },
          onclick: () => {
            const usernameInput = isPassword ? findAssociatedUsername(input) : input;
            const passwordInput = isPassword ? input : document.querySelector('input[type="password"]');

            if (usernameInput && item.username) {
              setInputValue(usernameInput, item.username);
            }
            if (passwordInput && item.password) {
              setInputValue(passwordInput, item.password);
            }

            host.remove();
            activeDropdownHost = null;
          },
        });

        itemRow.addEventListener('mouseenter', () => { itemRow.style.background = '#21262d'; });
        itemRow.addEventListener('mouseleave', () => { itemRow.style.background = 'transparent'; });

        const titleSpan = createElement('div', {
          text: item.title || item.username,
          style: { fontWeight: '600', color: '#f0f6fc' },
        });
        const userSpan = createElement('div', {
          text: item.username,
          style: { fontSize: '11px', color: '#8b949e' },
        });

        itemRow.append(titleSpan, userSpan);
        list.appendChild(itemRow);
      }
    }
    menu.appendChild(list);

    // Generator action button
    const footer = createElement('div', {
      style: {
        padding: '8px 12px',
        background: '#0d1117',
        borderTop: '1px solid #21262d',
      },
    });

    const genBtn = createElement('button', {
      type: 'button',
      text: '⚡ Generate Strong Password',
      style: {
        width: '100%',
        padding: '6px 10px',
        background: '#238636',
        color: '#ffffff',
        border: 'none',
        borderRadius: '6px',
        fontSize: '11px',
        fontWeight: '500',
        cursor: 'pointer',
      },
      onclick: async () => {
        try {
          const res = await chrome.runtime.sendMessage({
            type: 'HP_GENERATE_PASSWORD',
            payload: { length: 20 },
          });
          if (res?.ok && res.password) {
            const pwdField = isPassword ? input : document.querySelector('input[type="password"]');
            if (pwdField) {
              setInputValue(pwdField, res.password);
            }
            // Prompt to save
            const userField = isPassword ? findAssociatedUsername(input) : input;
            showSaveBanner(userField?.value || '', res.password);
          }
        } catch (err) {
          console.warn('[Hinterland Pass] Could not generate password:', err);
        }
        host.remove();
        activeDropdownHost = null;
      },
    });

    footer.appendChild(genBtn);
    menu.appendChild(footer);
    shadow.appendChild(menu);
    document.body.appendChild(host);

    // Position menu below input
    const rect = input.getBoundingClientRect();
    host.style.top = `${window.scrollY + rect.bottom + 4}px`;
    host.style.left = `${window.scrollX + Math.max(8, rect.left)}px`;

    // Close on outside click
    const handleOutsideClick = (event) => {
      if (host && !host.contains(event.target) && event.target !== input) {
        host.remove();
        activeDropdownHost = null;
        document.removeEventListener('click', handleOutsideClick);
      }
    };
    setTimeout(() => document.addEventListener('click', handleOutsideClick), 10);
  }

  /**
   * Displays the native "Save password for site?" floating banner.
   */
  function showSaveBanner(username, password) {
    if (activeBannerHost) activeBannerHost.remove();

    const host = document.createElement('div');
    host.className = 'hinterland-pass-banner-host';
    const shadow = host.attachShadow({ mode: 'closed' });
    activeBannerHost = host;

    const banner = createElement('div', {
      style: {
        width: '320px',
        background: '#161b22',
        border: '1px solid #388bfd',
        borderRadius: '10px',
        boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
        color: '#e6edf3',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: '12px',
        padding: '16px',
        boxSizing: 'border-box',
      },
    });

    // Top Row: Logo & Close
    const topRow = createElement('div', {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '10px',
      },
    }, [
      createElement('div', {
        style: { display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '600', color: '#58a6ff' },
      }, [
        createElement('span', { text: '🛡️' }),
        createElement('span', { text: 'Hinterland Pass' }),
      ]),
      createElement('button', {
        type: 'button',
        text: '✕',
        style: {
          background: 'none',
          border: 'none',
          color: '#8b949e',
          cursor: 'pointer',
          fontSize: '14px',
          padding: '2px 6px',
        },
        onclick: () => {
          host.remove();
          activeBannerHost = null;
        },
      }),
    ]);

    const titleEl = createElement('div', {
      style: { marginBottom: '12px', fontSize: '13px', fontWeight: '500' },
    }, [
      createElement('span', { text: 'Save password for ' }),
      createElement('strong', { text: currentHostname }),
      createElement('span', { text: '?' }),
    ]);

    // Username Input
    const userField = createElement('input', {
      type: 'text',
      value: username,
      placeholder: 'Username or Email',
      style: {
        width: '100%',
        boxSizing: 'border-box',
        padding: '8px 10px',
        background: '#0d1117',
        border: '1px solid #30363d',
        borderRadius: '6px',
        color: '#e6edf3',
        fontSize: '12px',
        marginBottom: '8px',
        outline: 'none',
      },
    });

    // Password Input Row
    const passRow = createElement('div', {
      style: { position: 'relative', marginBottom: '14px' },
    });
    const passField = createElement('input', {
      type: 'password',
      value: password,
      placeholder: 'Password',
      style: {
        width: '100%',
        boxSizing: 'border-box',
        padding: '8px 32px 8px 10px',
        background: '#0d1117',
        border: '1px solid #30363d',
        borderRadius: '6px',
        color: '#e6edf3',
        fontSize: '12px',
        outline: 'none',
      },
    });
    const toggleEye = createElement('button', {
      type: 'button',
      text: '👁',
      style: {
        position: 'absolute',
        right: '6px',
        top: '6px',
        background: 'none',
        border: 'none',
        color: '#8b949e',
        cursor: 'pointer',
        fontSize: '12px',
      },
      onclick: () => {
        passField.type = passField.type === 'password' ? 'text' : 'password';
      },
    });
    passRow.append(passField, toggleEye);

    // Actions Row
    const actionsRow = createElement('div', {
      style: { display: 'flex', gap: '8px' },
    });

    const saveBtn = createElement('button', {
      type: 'button',
      text: 'Save Password',
      style: {
        flex: '1',
        padding: '8px 12px',
        background: '#238636',
        color: '#ffffff',
        border: 'none',
        borderRadius: '6px',
        fontWeight: '600',
        cursor: 'pointer',
      },
      onclick: async () => {
        try {
          await chrome.runtime.sendMessage({
            type: 'HP_SAVE_LOGIN',
            payload: {
              domain: currentHostname,
              url: location.href,
              username: userField.value.trim(),
              password: passField.value,
              title: currentHostname,
            },
          });
        } catch (err) {
          console.warn('[Hinterland Pass] Save failed:', err);
        }
        host.remove();
        activeBannerHost = null;
      },
    });

    const neverBtn = createElement('button', {
      type: 'button',
      text: 'Never for this site',
      style: {
        padding: '8px 10px',
        background: '#21262d',
        color: '#8b949e',
        border: '1px solid #30363d',
        borderRadius: '6px',
        cursor: 'pointer',
        fontSize: '11px',
      },
      onclick: async () => {
        try {
          await chrome.runtime.sendMessage({
            type: 'HP_NEVER_SAVE_DOMAIN',
            payload: { domain: currentHostname },
          });
        } catch (err) {
          console.warn('[Hinterland Pass] Never save failed:', err);
        }
        host.remove();
        activeBannerHost = null;
      },
    });

    actionsRow.append(saveBtn, neverBtn);
    banner.append(topRow, titleEl, userField, passRow, actionsRow);
    shadow.appendChild(banner);
    document.body.appendChild(host);

    // Auto-dismiss after 25 seconds
    setTimeout(() => {
      if (activeBannerHost === host) {
        host.remove();
        activeBannerHost = null;
      }
    }, 25000);
  }

  /**
   * Scans document for login forms and attaches in-field badges.
   */
  function scanForForms() {
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    for (const pInput of passwordInputs) {
      attachFieldBadge(pInput, true);
      const uInput = findAssociatedUsername(pInput);
      if (uInput) attachFieldBadge(uInput, false);
    }
  }

  /**
   * Handles form submission to prompt saving newly entered credentials.
   */
  function handleFormSubmission(formOrInput) {
    const pInputs = formOrInput instanceof HTMLFormElement
      ? formOrInput.querySelectorAll('input[type="password"]')
      : formOrInput.form?.querySelectorAll('input[type="password"]') || [formOrInput];

    for (const pInp of pInputs) {
      if (pInp.type === 'password' && pInp.value && pInp.value.length >= 4) {
        const uInp = findAssociatedUsername(pInp);
        const username = uInp?.value || '';
        const password = pInp.value;

        // Verify with background if this is new or not on neverDomains
        chrome.runtime.sendMessage({
          type: 'HP_GET_LOGINS_FOR_URL',
          domain: currentHostname,
        }).then((res) => {
          if (!res?.ok) return;
          const logins = res.logins || [];
          const exists = logins.some((it) => it.username === username && it.password === password);
          if (!exists) {
            showSaveBanner(username, password);
          }
        }).catch(() => {});
        break;
      }
    }
  }

  // Event Listeners for Form Submissions
  document.addEventListener('submit', (event) => {
    if (event.target instanceof HTMLFormElement) {
      handleFormSubmission(event.target);
    }
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.target instanceof HTMLInputElement && event.target.type === 'password') {
      handleFormSubmission(event.target);
    }
  }, true);

  // Background message listener (Autofill trigger)
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'HP_DO_AUTOFILL') {
      const { username, password } = message.payload || {};
      const pInput = document.querySelector('input[type="password"]');
      if (pInput) {
        if (password) setInputValue(pInput, password);
        const uInput = findAssociatedUsername(pInput);
        if (uInput && username) setInputValue(uInput, username);
        sendResponse({ ok: true });
        return true;
      }
    }
    return false;
  });

  // Initial scan and continuous DOM observation
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scanForForms, { once: true });
  } else {
    scanForForms();
  }

  const observer = new MutationObserver(() => scanForForms());
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
