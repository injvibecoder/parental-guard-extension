/**
 * utils/storage.js
 * Abstraction layer over chrome.storage.local for ParentalGuard.
 * All settings are accessed through this module to ensure
 * consistent defaults and structure.
 */

export const STORAGE_KEYS = {
  PROTECTION_ENABLED: 'pg_protection_enabled',
  CATEGORIES: 'pg_categories',
  WHITELIST: 'pg_whitelist',
  CUSTOM_BLACKLIST: 'pg_custom_blacklist',
  ACTIVITY_LOG: 'pg_activity_log',
  PASSWORD_HASH: 'pg_password_hash',
  PASSWORD_SALT: 'pg_password_salt',
  PASSWORD_SET: 'pg_password_set',
  SAFE_SEARCH: 'pg_safe_search',
  YOUTUBE_RESTRICT: 'pg_youtube_restrict',
  WHITELIST_MODE: 'pg_whitelist_mode',
  INSTALLED_AT: 'pg_installed_at',
  LOG_MAX: 'pg_log_max'
};

export const DEFAULT_SETTINGS = {
  [STORAGE_KEYS.PROTECTION_ENABLED]: true,
  [STORAGE_KEYS.CATEGORIES]: {
    adult: true,
    gambling: true,
    drugs: true,
    violence: true,
    extremism: true
  },
  [STORAGE_KEYS.WHITELIST]: [],
  [STORAGE_KEYS.CUSTOM_BLACKLIST]: [],
  [STORAGE_KEYS.ACTIVITY_LOG]: [],
  [STORAGE_KEYS.PASSWORD_HASH]: null,
  [STORAGE_KEYS.PASSWORD_SALT]: null,
  [STORAGE_KEYS.PASSWORD_SET]: false,
  [STORAGE_KEYS.SAFE_SEARCH]: true,
  [STORAGE_KEYS.YOUTUBE_RESTRICT]: true,
  [STORAGE_KEYS.WHITELIST_MODE]: false,
  [STORAGE_KEYS.LOG_MAX]: 500
};

/**
 * Get one or more stored values. Missing keys return defaults.
 * @param {string|string[]} keys
 * @returns {Promise<object>}
 */
export async function getSettings(keys) {
  const keyArray = Array.isArray(keys) ? keys : [keys];
  const defaults = {};
  for (const k of keyArray) {
    if (DEFAULT_SETTINGS[k] !== undefined) defaults[k] = DEFAULT_SETTINGS[k];
  }
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keyArray, (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve({ ...defaults, ...result });
      }
    });
  });
}

/**
 * Get a single setting value.
 * @param {string} key
 * @returns {Promise<any>}
 */
export async function getSetting(key) {
  const result = await getSettings([key]);
  return result[key] !== undefined ? result[key] : DEFAULT_SETTINGS[key];
}

/**
 * Save one or more settings.
 * @param {object} data - key/value pairs to save
 * @returns {Promise<void>}
 */
export async function saveSettings(data) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(data, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Initialize storage with defaults if not already set.
 * Called on extension install/update.
 */
export async function initializeDefaults() {
  const allKeys = Object.values(STORAGE_KEYS);
  const existing = await getSettings(allKeys);
  const missing = {};

  for (const [key, defaultVal] of Object.entries(DEFAULT_SETTINGS)) {
    // For PASSWORD_SET: only write false if the key is completely absent from storage.
    // Never overwrite a true value with false.
    if (key === STORAGE_KEYS.PASSWORD_SET) {
      if (existing[key] === undefined) {
        missing[key] = false;
      }
      continue;
    }
    // For password hash/salt: never overwrite with null default
    if (key === STORAGE_KEYS.PASSWORD_HASH || key === STORAGE_KEYS.PASSWORD_SALT) {
      continue;
    }
    if (existing[key] === undefined) {
      missing[key] = defaultVal;
    }
  }

  if (!existing[STORAGE_KEYS.INSTALLED_AT]) {
    missing[STORAGE_KEYS.INSTALLED_AT] = Date.now();
  }

  if (Object.keys(missing).length > 0) {
    await saveSettings(missing);
  }
}

/**
 * Append a log entry (blocked attempt) and trim to max size.
 * @param {object} entry - { url, reason, category, timestamp }
 */
export async function appendLog(entry) {
  const result = await getSettings([STORAGE_KEYS.ACTIVITY_LOG, STORAGE_KEYS.LOG_MAX]);
  const log = result[STORAGE_KEYS.ACTIVITY_LOG] || [];
  const maxLog = result[STORAGE_KEYS.LOG_MAX] || 500;

  log.unshift({ ...entry, timestamp: Date.now() });

  // Trim excess entries
  if (log.length > maxLog) log.length = maxLog;

  await saveSettings({ [STORAGE_KEYS.ACTIVITY_LOG]: log });
}

/**
 * Clear all activity logs.
 */
export async function clearLog() {
  await saveSettings({ [STORAGE_KEYS.ACTIVITY_LOG]: [] });
}
