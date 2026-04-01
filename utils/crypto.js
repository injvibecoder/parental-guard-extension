/**
 * utils/crypto.js
 * Cryptographic utilities for ParentalGuard.
 * Uses Web Crypto API (available in service workers and extension pages).
 */

/**
 * Hash a plaintext password using SHA-256 with a salt.
 * @param {string} password - The plaintext password
 * @param {string} salt - A random salt string
 * @returns {Promise<string>} - Hex-encoded hash
 */
export async function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const data = encoder.encode(salt + password + 'pg_secret_pepper_v1');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a random salt string.
 * @returns {string} - Random hex salt
 */
export function generateSalt() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verify a password against a stored hash and salt.
 * @param {string} password - The plaintext password to verify
 * @param {string} storedHash - The previously hashed password
 * @param {string} salt - The salt used when hashing
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password, storedHash, salt) {
  const hash = await hashPassword(password, salt);
  return hash === storedHash;
}

/**
 * Simple obfuscation for storing sensitive config keys.
 * NOT encryption — just prevents casual inspection via DevTools.
 * @param {string} str
 * @returns {string}
 */
export function obfuscate(str) {
  return btoa(encodeURIComponent(str));
}

/**
 * Deobfuscate a previously obfuscated string.
 * @param {string} str
 * @returns {string}
 */
export function deobfuscate(str) {
  try {
    return decodeURIComponent(atob(str));
  } catch {
    return '';
  }
}
