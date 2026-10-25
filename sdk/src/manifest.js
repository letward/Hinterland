/**
 * @fileoverview Hinterland Extension SDK - Manifest Builder & Security Validator
 * Enforces Manifest V3 compliance and security policies for Hinterland extensions.
 */

export const PERMISSION_LEVELS = {
  SAFE: [
    'storage',
    'activeTab',
    'alarms',
    'scripting',
    'contextMenus',
    'action',
    'declarativeNetRequest',
    'unlimitedStorage',
  ],
  SENSITIVE: [
    'cookies',
    'tabs',
    'history',
    'bookmarks',
    'downloads',
    'webRequest',
    '<all_urls>',
    'http://*/*',
    'https://*/*',
  ],
  FORBIDDEN: [
    'debugger',
    'nativeMessaging',
    'management',
    'privacy',
    'proxy',
    'vpnProvider',
  ],
};

const DEFAULT_CSP = "script-src 'self'; object-src 'none'; base-uri 'none';";

/**
 * Validates a Hinterland extension manifest against security rules and MV3 specs.
 *
 * @param {object} manifest - The manifest object to validate
 * @param {object} [options] - Validation options
 * @param {boolean} [options.strict=false] - Treat warnings as errors
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function validateManifest(manifest, options = {}) {
  const errors = [];
  const warnings = [];

  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { valid: false, errors: ['Manifest must be a non-null object.'], warnings: [] };
  }

  // 1. Manifest version
  if (manifest.manifest_version !== 3) {
    errors.push(`Invalid manifest_version: ${manifest.manifest_version}. Hinterland requires Manifest V3 (manifest_version: 3).`);
  }

  // 2. Name & Version
  if (!manifest.name || typeof manifest.name !== 'string' || !manifest.name.trim()) {
    errors.push('Manifest "name" is required and must be a non-empty string.');
  }

  if (!manifest.version || typeof manifest.version !== 'string' || !/^\d+(\.\d+)*$/.test(manifest.version)) {
    errors.push('Manifest "version" must be a valid dotted-numeric string (e.g., "1.0.0").');
  }

  if (manifest.description && typeof manifest.description !== 'string') {
    errors.push('Manifest "description" must be a string if provided.');
  }

  // 3. Permissions auditing
  const permissions = Array.isArray(manifest.permissions) ? manifest.permissions : [];
  const forbiddenSet = new Set(PERMISSION_LEVELS.FORBIDDEN);
  const sensitiveSet = new Set(PERMISSION_LEVELS.SENSITIVE);
  const safeSet = new Set(PERMISSION_LEVELS.SAFE);

  for (const perm of permissions) {
    if (typeof perm !== 'string') {
      errors.push(`Permission entries must be strings; received ${typeof perm}.`);
      continue;
    }
    if (forbiddenSet.has(perm)) {
      errors.push(`Security violation: Forbidden permission "${perm}". Hinterland prohibits this permission to protect user system and browser integrity.`);
    } else if (sensitiveSet.has(perm)) {
      warnings.push(`Sensitive permission "${perm}" requested. Ensure least privilege and clear user consent.`);
    } else if (!safeSet.has(perm) && !perm.includes('://')) {
      warnings.push(`Unrecognized or non-standard permission "${perm}".`);
    }
  }

  // 4. Host permissions auditing
  const hostPermissions = Array.isArray(manifest.host_permissions) ? manifest.host_permissions : [];
  for (const host of hostPermissions) {
    if (host === '<all_urls>' || host === '*://*/*' || host === 'http://*/*' || host === 'https://*/*') {
      warnings.push(`Broad host permission "${host}" requested. Prefer scoped origins or "activeTab" to protect user privacy.`);
    }
  }

  // 5. Background script (MV3 Service Worker)
  if (manifest.background) {
    if (manifest.background.scripts) {
      errors.push('Manifest V3 does not support "background.scripts". Use "background.service_worker" instead.');
    }
    if (manifest.background.service_worker) {
      if (typeof manifest.background.service_worker !== 'string') {
        errors.push('"background.service_worker" must be a relative script file path string.');
      } else if (manifest.background.service_worker.startsWith('/') || manifest.background.service_worker.includes('..')) {
        errors.push('"background.service_worker" must be a relative path and must not escape the extension directory.');
      }
    }
    if (manifest.background.type !== undefined && manifest.background.type !== 'module') {
      errors.push('"background.type" if specified must be "module".');
    }
  }

  // 6. Content scripts
  if (manifest.content_scripts) {
    if (!Array.isArray(manifest.content_scripts)) {
      errors.push('"content_scripts" must be an array of content script definitions.');
    } else {
      manifest.content_scripts.forEach((cs, idx) => {
        if (!cs || typeof cs !== 'object') {
          errors.push(`content_scripts[${idx}] must be an object.`);
          return;
        }
        if (!Array.isArray(cs.matches) || cs.matches.length === 0) {
          errors.push(`content_scripts[${idx}] must define at least one "matches" pattern.`);
        }
        if (cs.js && (!Array.isArray(cs.js) || cs.js.some((f) => typeof f !== 'string' || f.includes('..')))) {
          errors.push(`content_scripts[${idx}].js must be an array of safe relative paths.`);
        }
        if (cs.css && (!Array.isArray(cs.css) || cs.css.some((f) => typeof f !== 'string' || f.includes('..')))) {
          errors.push(`content_scripts[${idx}].css must be an array of safe relative paths.`);
        }
      });
    }
  }

  // 7. Action / Popup
  if (manifest.action) {
    if (typeof manifest.action !== 'object') {
      errors.push('"action" must be an object.');
    } else if (manifest.action.default_popup) {
      if (typeof manifest.action.default_popup !== 'string' || manifest.action.default_popup.includes('..')) {
        errors.push('"action.default_popup" must be a safe relative path.');
      }
    }
  }

  // 8. Content Security Policy
  if (manifest.content_security_policy) {
    const csp = manifest.content_security_policy.extension_pages || manifest.content_security_policy;
    if (typeof csp === 'string') {
      if (csp.includes("'unsafe-eval'")) {
        errors.push("Security violation: CSP contains 'unsafe-eval', which is strictly forbidden in Hinterland extensions.");
      }
      if (/http:\/\/[^l]/i.test(csp)) {
        errors.push('Security violation: CSP contains unencrypted HTTP source. All remote connections must use HTTPS.');
      }
    }
  }

  const valid = errors.length === 0 && (!options.strict || warnings.length === 0);
  return { valid, errors, warnings };
}

/**
 * Defines and builds a strictly validated Hinterland extension manifest.
 *
 * @param {object} config - Manifest definition
 * @returns {object} The compliant, validated manifest
 * @throws {Error} If the manifest violates security rules or MV3 specs
 */
export function defineManifest(config) {
  const manifest = {
    manifest_version: 3,
    ...config,
  };

  // Enforce secure default CSP if not provided
  if (!manifest.content_security_policy) {
    manifest.content_security_policy = {
      extension_pages: DEFAULT_CSP,
    };
  }

  const result = validateManifest(manifest);
  if (!result.valid) {
    throw new Error(`[Hinterland Extension SDK] Invalid manifest:\n - ${result.errors.join('\n - ')}`);
  }

  return manifest;
}
