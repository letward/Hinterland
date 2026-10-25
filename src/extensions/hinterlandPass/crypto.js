/**
 * @fileoverview Hinterland Pass - Cryptography & Password Toolkit
 * End-to-end zero-knowledge encryption using Web Crypto API (PBKDF2 + AES-GCM 256-bit).
 */

const VERIFICATION_MAGIC = 'HINTERLAND_PASS_VALID_V1';
const PBKDF2_ITERATIONS = 100000;

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Derives a 256-bit AES-GCM key from a master passphrase and salt.
 *
 * @param {string} passphrase - User master password
 * @param {Uint8Array} salt - 16-byte random salt
 * @returns {Promise<CryptoKey>}
 */
export async function deriveKey(passphrase, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypts a plaintext payload using AES-GCM.
 *
 * @param {string|object} data - Data to encrypt
 * @param {string} masterPassword - Master passphrase
 * @returns {Promise<{ salt: string, iv: string, ciphertext: string, verification: string }>}
 */
export async function encryptVault(data, masterPassword) {
  const enc = new TextEncoder();
  const plaintext = typeof data === 'string' ? data : JSON.stringify(data);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(masterPassword, salt);

  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext),
  );

  // Create verification token for fast master password validation
  const verIv = crypto.getRandomValues(new Uint8Array(12));
  const verificationBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: verIv },
    key,
    enc.encode(VERIFICATION_MAGIC),
  );

  return {
    salt: bufferToBase64(salt),
    iv: bufferToBase64(iv),
    ciphertext: bufferToBase64(ciphertextBuffer),
    verificationIv: bufferToBase64(verIv),
    verification: bufferToBase64(verificationBuffer),
    updatedAt: Date.now(),
  };
}

/**
 * Decrypts an encrypted vault package using the master passphrase.
 *
 * @param {object} pkg - Stored encrypted package
 * @param {string} masterPassword - User master passphrase
 * @returns {Promise<any>} Decrypted data
 */
export async function decryptVault(pkg, masterPassword) {
  if (!pkg || !pkg.salt || !pkg.iv || !pkg.ciphertext) {
    throw new Error('Invalid vault package.');
  }

  const salt = base64ToBuffer(pkg.salt);
  const iv = base64ToBuffer(pkg.iv);
  const ciphertext = base64ToBuffer(pkg.ciphertext);

  const key = await deriveKey(masterPassword, salt);
  const dec = new TextDecoder();

  try {
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext,
    );
    const text = dec.decode(decryptedBuffer);
    return JSON.parse(text);
  } catch (err) {
    throw new Error('Decryption failed: Incorrect master password or corrupted vault.');
  }
}

/**
 * Verifies if a given master password is correct using the stored verification token.
 *
 * @param {object} pkg - Stored encrypted package
 * @param {string} masterPassword - Master passphrase
 * @returns {Promise<boolean>} True if master password is valid
 */
export async function verifyMasterPassword(pkg, masterPassword) {
  if (!pkg?.salt || !pkg?.verification || !pkg?.verificationIv) {
    return false;
  }

  try {
    const salt = base64ToBuffer(pkg.salt);
    const verIv = base64ToBuffer(pkg.verificationIv);
    const verification = base64ToBuffer(pkg.verification);

    const key = await deriveKey(masterPassword, salt);
    const dec = new TextDecoder();

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: verIv },
      key,
      verification,
    );
    return dec.decode(decrypted) === VERIFICATION_MAGIC;
  } catch {
    return false;
  }
}

/**
 * Generates a cryptographically secure random password based on configurable options.
 *
 * @param {object} [options]
 * @param {number} [options.length=20]
 * @param {boolean} [options.uppercase=true]
 * @param {boolean} [options.lowercase=true]
 * @param {boolean} [options.numbers=true]
 * @param {boolean} [options.symbols=true]
 * @param {boolean} [options.avoidAmbiguous=false]
 * @returns {string}
 */
export function generatePassword(options = {}) {
  const length = Math.max(8, Math.min(64, options.length || 20));
  const useUpper = options.uppercase !== false;
  const useLower = options.lowercase !== false;
  const useNumbers = options.numbers !== false;
  const useSymbols = options.symbols !== false;
  const avoidAmbiguous = Boolean(options.avoidAmbiguous);

  let upperChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let lowerChars = 'abcdefghijklmnopqrstuvwxyz';
  let numberChars = '0123456789';
  let symbolChars = '!@#$%^&*()_+-=[]{}|;:,.<>?';

  if (avoidAmbiguous) {
    upperChars = upperChars.replace(/[OI]/g, '');
    lowerChars = lowerChars.replace(/[lo]/g, '');
    numberChars = numberChars.replace(/[01]/g, '');
    symbolChars = symbolChars.replace(/[|:;]/g, '');
  }

  const pools = [];
  const requiredChars = [];

  if (useUpper) {
    pools.push(upperChars);
    requiredChars.push(getRandomChar(upperChars));
  }
  if (useLower) {
    pools.push(lowerChars);
    requiredChars.push(getRandomChar(lowerChars));
  }
  if (useNumbers) {
    pools.push(numberChars);
    requiredChars.push(getRandomChar(numberChars));
  }
  if (useSymbols) {
    pools.push(symbolChars);
    requiredChars.push(getRandomChar(symbolChars));
  }

  if (pools.length === 0) {
    pools.push(lowerChars, upperChars, numberChars);
  }

  const combined = pools.join('');
  const passwordChars = [...requiredChars];

  while (passwordChars.length < length) {
    passwordChars.push(getRandomChar(combined));
  }

  // Cryptographically shuffle array (Fisher-Yates)
  const randomValues = new Uint32Array(passwordChars.length);
  crypto.getRandomValues(randomValues);

  for (let i = passwordChars.length - 1; i > 0; i--) {
    const j = randomValues[i] % (i + 1);
    [passwordChars[i], passwordChars[j]] = [passwordChars[j], passwordChars[i]];
  }

  return passwordChars.join('');
}

function getRandomChar(charset) {
  const randomBuffer = new Uint32Array(1);
  crypto.getRandomValues(randomBuffer);
  return charset[randomBuffer[0] % charset.length];
}

/**
 * Calculates the security strength and entropy of a password.
 *
 * @param {string} password
 * @returns {{ score: number, label: string, entropy: number, color: string }}
 */
export function calculateStrength(password) {
  if (!password || typeof password !== 'string') {
    return { score: 0, label: 'Empty', entropy: 0, color: '#8b949e' };
  }

  let poolSize = 0;
  if (/[a-z]/.test(password)) poolSize += 26;
  if (/[A-Z]/.test(password)) poolSize += 26;
  if (/[0-9]/.test(password)) poolSize += 10;
  if (/[^a-zA-Z0-9]/.test(password)) poolSize += 33;

  if (poolSize === 0) poolSize = 10;

  // Shannon entropy E = L * log2(poolSize)
  const entropy = Math.round(password.length * Math.log2(poolSize));

  let label = 'Weak';
  let color = '#f85149'; // red
  let score = 20;

  if (entropy >= 80) {
    label = 'Excellent';
    color = '#2ea043'; // rich green
    score = 100;
  } else if (entropy >= 60) {
    label = 'Strong';
    color = '#3fb950'; // green
    score = 80;
  } else if (entropy >= 45) {
    label = 'Good';
    color = '#d29922'; // gold
    score = 60;
  } else if (entropy >= 30) {
    label = 'Fair';
    color = '#db6d28'; // orange
    score = 40;
  }

  return { score, label, entropy, color };
}

/**
 * Normalizes a URL or hostname down to its base domain (e.g. "github.com").
 *
 * @param {string} input - URL or host string
 * @returns {string}
 */
export function normalizeDomain(input) {
  if (!input || typeof input !== 'string') return '';
  let str = input.trim().toLowerCase();

  try {
    if (!str.startsWith('http://') && !str.startsWith('https://')) {
      str = `https://${str}`;
    }
    const parsed = new URL(str);
    let host = parsed.hostname;
    if (host.startsWith('www.')) host = host.slice(4);
    return host;
  } catch {
    return str.replace(/^https?:\/\//i, '').split('/')[0].split(':')[0].replace(/^www\./i, '');
  }
}
