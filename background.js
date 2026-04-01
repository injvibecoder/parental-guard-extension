/**
 * background.js — ParentalGuard Service Worker
 *
 * Responsibilities:
 * - Real-time URL interception via webNavigation
 * - Safe search enforcement via declarativeNetRequest
 * - Dynamic rule management (user blacklist/whitelist)
 * - Activity logging
 * - Message handling from popup and content scripts
 */

import { detectBlockedURL, HARDCODED_BLOCKED_DOMAINS, SAFE_SEARCH_RULES } from './utils/blocklist.js';
import { getSetting, getSettings, saveSettings, appendLog, initializeDefaults, STORAGE_KEYS } from './utils/storage.js';
import { hashPassword, generateSalt, verifyPassword } from './utils/crypto.js';

// ─── Extension lifecycle ──────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[ParentalGuard] Installed/Updated:', details.reason);
  await initializeDefaults();
  await rebuildDynamicRules();

  if (details.reason === 'install') {
    // Open a welcome/setup page
    chrome.tabs.create({ url: chrome.runtime.getURL('blocked.html?welcome=1') });
  }
});

chrome.runtime.onStartup.addListener(async () => {
  console.log('[ParentalGuard] Browser started — reloading rules');
  await rebuildDynamicRules();
});

// ─── webNavigation: intercept BEFORE page loads ───────────────────────────────

chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  // Only check main frame and sub-frames
  if (details.frameType !== 'outermost_frame' && details.frameType !== 'fenced_frame'
    && details.frameId !== 0) {
    // frameId 0 = main frame (compatible with older Chrome)
    if (details.frameId !== 0) return;
  }

  const url = details.url;
  if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://')) return;

  const protectionEnabled = await getSetting(STORAGE_KEYS.PROTECTION_ENABLED);
  if (!protectionEnabled) return;

  // Check whitelist mode first
  const whitelistMode = await getSetting(STORAGE_KEYS.WHITELIST_MODE);
  if (whitelistMode) {
    const whitelist = await getSetting(STORAGE_KEYS.WHITELIST);
    const isWhitelisted = isUrlWhitelisted(url, whitelist);
    if (!isWhitelisted) {
      await blockTab(details.tabId, url, 'whitelist_mode', 'Whitelist Mode Active');
      return;
    }
    return; // Allowed
  }

  // Check if URL is whitelisted (skip blocking)
  const whitelist = await getSetting(STORAGE_KEYS.WHITELIST);
  if (isUrlWhitelisted(url, whitelist)) return;

  // Check custom blacklist
  const customBlacklist = await getSetting(STORAGE_KEYS.CUSTOM_BLACKLIST);
  for (const blockedDomain of customBlacklist) {
    if (urlMatchesDomain(url, blockedDomain)) {
      await blockTab(details.tabId, url, 'custom', 'Custom Blacklist');
      return;
    }
  }

  // Check categories and keywords
  const categories = await getSetting(STORAGE_KEYS.CATEGORIES);
  const detection = detectBlockedURL(url);

  if (detection.blocked && categories[detection.category]) {
    await blockTab(details.tabId, url, detection.category, detection.matchedKeyword);
    return;
  }

  // Enforce safe search on search engines
  const safeSearchEnabled = await getSetting(STORAGE_KEYS.SAFE_SEARCH);
  if (safeSearchEnabled) {
    await enforceSafeSearch(details.tabId, url);
  }
});

// ─── Safe search enforcement ──────────────────────────────────────────────────

async function enforceSafeSearch(tabId, url) {
  try {
    const urlObj = new URL(url);

    // Google Safe Search
    if (/google\.(com|co\.|ca|co\.uk|com\.au)/.test(urlObj.hostname) &&
      urlObj.pathname.includes('/search')) {
      const safe = urlObj.searchParams.get('safe');
      if (safe !== 'active') {
        urlObj.searchParams.set('safe', 'active');
        chrome.tabs.update(tabId, { url: urlObj.toString() });
      }
    }

    // Bing Safe Search
    if (urlObj.hostname.includes('bing.com') && urlObj.pathname.includes('/search')) {
      const adlt = urlObj.searchParams.get('adlt');
      if (adlt !== 'strict') {
        urlObj.searchParams.set('adlt', 'strict');
        chrome.tabs.update(tabId, { url: urlObj.toString() });
      }
    }

    // DuckDuckGo Safe Search
    if (urlObj.hostname.includes('duckduckgo.com')) {
      const kp = urlObj.searchParams.get('kp');
      if (kp !== '1') {
        urlObj.searchParams.set('kp', '1'); // strict safe search
        chrome.tabs.update(tabId, { url: urlObj.toString() });
      }
    }

  } catch {
    // Invalid URL — ignore
  }
}

// ─── Tab blocking ─────────────────────────────────────────────────────────────

async function blockTab(tabId, url, category, matchedKeyword) {
  if (tabId < 0) return; // Background request

  // Log the blocked attempt
  try {
    const hostname = new URL(url).hostname;
    await appendLog({
      url,
      hostname,
      category,
      matchedKeyword,
      tabId
    });
  } catch {
    await appendLog({ url, category, matchedKeyword, tabId });
  }

  // Redirect to blocked page
  const blockedUrl = chrome.runtime.getURL(
    `blocked.html?reason=${encodeURIComponent(category)}&url=${encodeURIComponent(url)}&kw=${encodeURIComponent(matchedKeyword || '')}`
  );

  try {
    await chrome.tabs.update(tabId, { url: blockedUrl });
  } catch (err) {
    console.warn('[ParentalGuard] Could not redirect tab:', err.message);
  }
}

// ─── Dynamic declarativeNetRequest rules ─────────────────────────────────────
// These handle the custom user blacklist with high performance

const DYNAMIC_RULE_OFFSET = 10000; // Offset to avoid collision with static rules

async function rebuildDynamicRules() {
  try {
    const customBlacklist = await getSetting(STORAGE_KEYS.CUSTOM_BLACKLIST);

    // Remove all existing dynamic rules
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const existingIds = existing.map(r => r.id);
    if (existingIds.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: existingIds });
    }

    // Add new rules for custom blacklist
    const newRules = customBlacklist.map((domain, index) => ({
      id: DYNAMIC_RULE_OFFSET + index + 1,
      priority: 2, // Higher priority than static rules
      action: {
        type: 'redirect',
        redirect: { extensionPath: `/blocked.html?reason=custom&kw=${encodeURIComponent(domain)}` }
      },
      condition: {
        urlFilter: `||${domain}`,
        resourceTypes: ['main_frame', 'sub_frame']
      }
    }));

    if (newRules.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({ addRules: newRules });
    }

    console.log(`[ParentalGuard] Dynamic rules: ${newRules.length} custom domains`);
  } catch (err) {
    console.error('[ParentalGuard] Failed to rebuild dynamic rules:', err);
  }
}

// ─── Helper: URL whitelist check ──────────────────────────────────────────────

function isUrlWhitelisted(url, whitelist) {
  if (!whitelist || whitelist.length === 0) return false;
  try {
    const hostname = new URL(url).hostname.replace('www.', '');
    return whitelist.some(domain => {
      const d = domain.replace('www.', '');
      return hostname === d || hostname.endsWith('.' + d);
    });
  } catch {
    return false;
  }
}

function urlMatchesDomain(url, domain) {
  try {
    const hostname = new URL(url).hostname.replace('www.', '');
    const d = domain.replace('www.', '');
    return hostname === d || hostname.endsWith('.' + d);
  } catch {
    return false;
  }
}

// ─── Message handling from popup.js and content.js ───────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch(err => {
    sendResponse({ error: err.message });
  });
  return true; // Keep channel open for async response
});

async function handleMessage(message, sender) {
  switch (message.type) {

    case 'GET_STATUS': {
      const [enabled, categories, safeSearch, ytRestrict, whitelistMode] = await Promise.all([
        getSetting(STORAGE_KEYS.PROTECTION_ENABLED),
        getSetting(STORAGE_KEYS.CATEGORIES),
        getSetting(STORAGE_KEYS.SAFE_SEARCH),
        getSetting(STORAGE_KEYS.YOUTUBE_RESTRICT),
        getSetting(STORAGE_KEYS.WHITELIST_MODE)
      ]);
      return { enabled, categories, safeSearch, ytRestrict, whitelistMode };
    }

    case 'SET_PROTECTION': {
      await saveSettings({ [STORAGE_KEYS.PROTECTION_ENABLED]: message.enabled });
      return { success: true };
    }

    case 'SET_CATEGORY': {
      const categories = await getSetting(STORAGE_KEYS.CATEGORIES);
      categories[message.category] = message.enabled;
      await saveSettings({ [STORAGE_KEYS.CATEGORIES]: categories });
      return { success: true };
    }

    case 'SET_SAFE_SEARCH': {
      await saveSettings({ [STORAGE_KEYS.SAFE_SEARCH]: message.enabled });
      return { success: true };
    }

    case 'SET_YOUTUBE_RESTRICT': {
      await saveSettings({ [STORAGE_KEYS.YOUTUBE_RESTRICT]: message.enabled });
      return { success: true };
    }

    case 'SET_WHITELIST_MODE': {
      await saveSettings({ [STORAGE_KEYS.WHITELIST_MODE]: message.enabled });
      return { success: true };
    }

    case 'GET_WHITELIST': {
      const whitelist = await getSetting(STORAGE_KEYS.WHITELIST);
      return { whitelist };
    }

    case 'ADD_WHITELIST': {
      const whitelist = await getSetting(STORAGE_KEYS.WHITELIST);
      const domain = normalizeDomain(message.domain);
      if (domain && !whitelist.includes(domain)) {
        whitelist.push(domain);
        await saveSettings({ [STORAGE_KEYS.WHITELIST]: whitelist });
      }
      return { success: true, whitelist };
    }

    case 'REMOVE_WHITELIST': {
      let whitelist = await getSetting(STORAGE_KEYS.WHITELIST);
      whitelist = whitelist.filter(d => d !== message.domain);
      await saveSettings({ [STORAGE_KEYS.WHITELIST]: whitelist });
      return { success: true, whitelist };
    }

    case 'GET_BLACKLIST': {
      const list = await getSetting(STORAGE_KEYS.CUSTOM_BLACKLIST);
      return { blacklist: list };
    }

    case 'ADD_BLACKLIST': {
      const list = await getSetting(STORAGE_KEYS.CUSTOM_BLACKLIST);
      const domain = normalizeDomain(message.domain);
      if (domain && !list.includes(domain)) {
        list.push(domain);
        await saveSettings({ [STORAGE_KEYS.CUSTOM_BLACKLIST]: list });
        await rebuildDynamicRules();
      }
      return { success: true, blacklist: list };
    }

    case 'REMOVE_BLACKLIST': {
      let list = await getSetting(STORAGE_KEYS.CUSTOM_BLACKLIST);
      list = list.filter(d => d !== message.domain);
      await saveSettings({ [STORAGE_KEYS.CUSTOM_BLACKLIST]: list });
      await rebuildDynamicRules();
      return { success: true, blacklist: list };
    }

    case 'GET_LOGS': {
      const logs = await getSetting(STORAGE_KEYS.ACTIVITY_LOG);
      return { logs };
    }

    case 'CLEAR_LOGS': {
      await saveSettings({ [STORAGE_KEYS.ACTIVITY_LOG]: [] });
      return { success: true };
    }

    case 'IS_PASSWORD_SET': {
      const isSet = await getSetting(STORAGE_KEYS.PASSWORD_SET);
      return { isSet: isSet === true };
    }

    case 'CHECK_PASSWORD': {
      const [hash, salt, isSet] = await Promise.all([
        getSetting(STORAGE_KEYS.PASSWORD_HASH),
        getSetting(STORAGE_KEYS.PASSWORD_SALT),
        getSetting(STORAGE_KEYS.PASSWORD_SET)
      ]);
      if (!isSet) return { valid: false, notSet: true };
      if (!message.password) return { valid: false };
      const valid = await verifyPassword(message.password, hash, salt);
      return { valid };
    }

    case 'SET_PASSWORD': {
      const salt = generateSalt();
      const hash = await hashPassword(message.password, salt);
      await saveSettings({
        [STORAGE_KEYS.PASSWORD_HASH]: hash,
        [STORAGE_KEYS.PASSWORD_SALT]: salt,
        [STORAGE_KEYS.PASSWORD_SET]: true
      });
      return { success: true };
    }

    case 'YOUTUBE_CHECK': {
      // Called by content script on YouTube pages
      const ytRestrict = await getSetting(STORAGE_KEYS.YOUTUBE_RESTRICT);
      const categories = await getSetting(STORAGE_KEYS.CATEGORIES);
      return { ytRestrict, adultEnabled: categories.adult };
    }

    default:
      return { error: 'Unknown message type' };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeDomain(input) {
  if (!input) return null;
  let d = input.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  return d || null;
}

// ─── Alarm: periodic rule refresh ────────────────────────────────────────────

chrome.alarms.create('rule_refresh', { periodInMinutes: 60 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'rule_refresh') {
    await rebuildDynamicRules();
  }
});

console.log('[ParentalGuard] Service worker initialized');
