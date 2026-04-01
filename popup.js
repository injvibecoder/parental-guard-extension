/**
 * popup.js — ParentalGuard Admin Dashboard
 * Handles all UI logic for the extension popup.
 */

'use strict';

// ─── Utility ──────────────────────────────────────────────────────────────────

function $(id) { return document.getElementById(id); }

function sendBg(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) resolve(null);
      else resolve(response);
    });
  });
}

function showScreen(id) {
  ['lock-screen', 'setup-screen', 'main-screen'].forEach(s => {
    const el = $(s);
    if (el) el.classList.add('hidden');
  });
  const target = $(id);
  if (target) target.classList.remove('hidden');
}

function setError(id, msg) {
  const el = $(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3000);
}

function setSuccess(id, msg) {
  const el = $(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 2500);
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) +
    ' ' + d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function sanitize(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ─── State ────────────────────────────────────────────────────────────────────

let isUnlocked = false;
let currentTab = 'filters';

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  // Retry up to 3 times in case the service worker is cold-starting
  let check = null;
  for (let i = 0; i < 3; i++) {
    check = await sendBg({ type: 'IS_PASSWORD_SET' });
    if (check !== null) break;
    await new Promise(r => setTimeout(r, 300));
  }

  if (!check) {
    // Service worker still not responding — show setup as safe fallback
    showScreen('setup-screen');
    bindSetupScreen();
    return;
  }

  if (!check.isSet) {
    // No password configured yet — show first-run setup screen
    showScreen('setup-screen');
    bindSetupScreen();
  } else {
    // Password exists — require it to unlock
    showScreen('lock-screen');
    bindLockScreen();
  }
}

// ─── Setup screen ─────────────────────────────────────────────────────────────

function bindSetupScreen() {
  $('setup-submit').addEventListener('click', async () => {
    const pw = $('setup-password').value;
    const confirm = $('setup-password-confirm').value;

    if (!pw || pw.length < 4) {
      setError('setup-error', 'Password must be at least 4 characters');
      return;
    }
    if (pw !== confirm) {
      setError('setup-error', 'Passwords do not match');
      return;
    }

    // Show loading state on button
    const btn = $('setup-submit');
    btn.textContent = 'Activating…';
    btn.disabled = true;

    try {
      const res = await sendBg({ type: 'SET_PASSWORD', password: pw });
      if (res?.success) {
        isUnlocked = true;
        await loadMainDashboard();
        showScreen('main-screen');
      } else {
        setError('setup-error', 'Failed to save password. Please try again.');
        btn.textContent = 'Activate Protection';
        btn.disabled = false;
      }
    } catch (e) {
      setError('setup-error', 'Unexpected error. Reload and try again.');
      btn.textContent = 'Activate Protection';
      btn.disabled = false;
    }
  });

  $('setup-skip').addEventListener('click', async () => {
    isUnlocked = true;
    await loadMainDashboard();
    showScreen('main-screen');
  });

  // Enter key support
  $('setup-password-confirm').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('setup-submit').click();
  });
}

// ─── Lock screen ──────────────────────────────────────────────────────────────

function bindLockScreen() {
  $('lock-submit').addEventListener('click', async () => {
    const pw = $('lock-password').value;
    if (!pw) { setError('lock-error', 'Enter your password'); return; }

    const btn = $('lock-submit');
    btn.textContent = 'Unlocking…';
    btn.disabled = true;

    const res = await sendBg({ type: 'CHECK_PASSWORD', password: pw });

    if (res?.valid) {
      isUnlocked = true;
      await loadMainDashboard();
      showScreen('main-screen');
    } else {
      setError('lock-error', res === null ? 'Extension not responding. Try again.' : 'Incorrect password');
      $('lock-password').value = '';
      $('lock-password').focus();
      btn.textContent = 'Unlock Settings';
      btn.disabled = false;
    }
  });

  $('lock-password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('lock-submit').click();
  });

  $('lock-password').focus();
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

async function loadMainDashboard() {
  bindTabNav();
  await Promise.all([
    loadStatus(),
    loadSitesList(),
    loadLogs()
  ]);
  bindAllToggles();
  bindSitesTab();
  bindSettingsTab();
  bindLockButton();
}

async function loadStatus() {
  const status = await sendBg({ type: 'GET_STATUS' });
  if (!status) return;

  // Main protection toggle
  const protToggle = $('protection-toggle');
  protToggle.checked = status.enabled;
  updateProtectionUI(status.enabled);

  // Category toggles
  document.querySelectorAll('.category-toggle').forEach(toggle => {
    const cat = toggle.dataset.category;
    toggle.checked = status.categories?.[cat] !== false;
  });

  // Safe search & YouTube
  $('safe-search-toggle').checked = status.safeSearch !== false;
  $('youtube-toggle').checked = status.ytRestrict !== false;
  $('whitelist-mode-toggle').checked = status.whitelistMode === true;
}

function updateProtectionUI(enabled) {
  const icon = $('protection-icon');
  const label = $('protection-label');
  const body = document.body;

  if (enabled) {
    icon.textContent = '✅';
    label.textContent = 'Protection Active';
    body.classList.remove('protection-off');
  } else {
    icon.textContent = '🔴';
    label.textContent = 'Protection Disabled';
    body.classList.add('protection-off');
  }
}

// ─── Tab navigation ───────────────────────────────────────────────────────────

function bindTabNav() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      switchTab(tab);
    });
  });
}

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.querySelectorAll('.tab-content').forEach(el => {
    el.classList.toggle('active', el.id === `tab-${tab}`);
  });
  if (tab === 'logs') loadLogs();
}

// ─── Toggles ──────────────────────────────────────────────────────────────────

function bindAllToggles() {
  // Main protection toggle
  $('protection-toggle').addEventListener('change', async (e) => {
    const enabled = e.target.checked;
    await sendBg({ type: 'SET_PROTECTION', enabled });
    updateProtectionUI(enabled);
  });

  // Category toggles
  document.querySelectorAll('.category-toggle').forEach(toggle => {
    toggle.addEventListener('change', async (e) => {
      const category = e.target.dataset.category;
      const enabled = e.target.checked;
      await sendBg({ type: 'SET_CATEGORY', category, enabled });
    });
  });

  // Safe search
  $('safe-search-toggle').addEventListener('change', async (e) => {
    await sendBg({ type: 'SET_SAFE_SEARCH', enabled: e.target.checked });
  });

  // YouTube
  $('youtube-toggle').addEventListener('change', async (e) => {
    await sendBg({ type: 'SET_YOUTUBE_RESTRICT', enabled: e.target.checked });
  });

  // Whitelist mode
  $('whitelist-mode-toggle').addEventListener('change', async (e) => {
    await sendBg({ type: 'SET_WHITELIST_MODE', enabled: e.target.checked });
  });
}

// ─── Sites tab ────────────────────────────────────────────────────────────────

async function loadSitesList() {
  const [wlRes, blRes] = await Promise.all([
    sendBg({ type: 'GET_WHITELIST' }),
    sendBg({ type: 'GET_BLACKLIST' })
  ]);

  renderDomainList('whitelist-list', wlRes?.whitelist || [], 'whitelist');
  renderDomainList('blacklist-list', blRes?.blacklist || [], 'blacklist');
}

function renderDomainList(containerId, domains, type) {
  const container = $(containerId);
  if (!container) return;

  if (domains.length === 0) {
    container.innerHTML = '<div class="empty-state">No entries yet</div>';
    return;
  }

  container.innerHTML = domains.map(domain => `
    <div class="domain-chip">
      <span class="domain-text">${sanitize(domain)}</span>
      <button class="remove-btn" data-domain="${sanitize(domain)}" data-type="${type}" title="Remove">✕</button>
    </div>
  `).join('');

  container.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const domain = btn.dataset.domain;
      const t = btn.dataset.type;
      if (t === 'whitelist') {
        await sendBg({ type: 'REMOVE_WHITELIST', domain });
      } else {
        await sendBg({ type: 'REMOVE_BLACKLIST', domain });
      }
      await loadSitesList();
    });
  });
}

function bindSitesTab() {
  // Whitelist add
  $('whitelist-add').addEventListener('click', async () => {
    const input = $('whitelist-input');
    const domain = input.value.trim();
    if (!domain) return;
    const res = await sendBg({ type: 'ADD_WHITELIST', domain });
    if (res?.success) {
      input.value = '';
      renderDomainList('whitelist-list', res.whitelist, 'whitelist');
    }
  });

  $('whitelist-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('whitelist-add').click();
  });

  // Blacklist add
  $('blacklist-add').addEventListener('click', async () => {
    const input = $('blacklist-input');
    const domain = input.value.trim();
    if (!domain) return;
    const res = await sendBg({ type: 'ADD_BLACKLIST', domain });
    if (res?.success) {
      input.value = '';
      renderDomainList('blacklist-list', res.blacklist, 'blacklist');
    }
  });

  $('blacklist-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('blacklist-add').click();
  });
}

// ─── Logs tab ─────────────────────────────────────────────────────────────────

async function loadLogs() {
  const res = await sendBg({ type: 'GET_LOGS' });
  const logs = res?.logs || [];

  // Update badge
  const badge = $('log-badge');
  if (logs.length > 0) {
    badge.textContent = logs.length > 99 ? '99+' : logs.length;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }

  const list = $('log-list');
  if (!list) return;

  if (logs.length === 0) {
    list.innerHTML = '<div class="empty-state">No blocked attempts yet</div>';
    return;
  }

  const CATEGORY_COLORS = {
    adult: '', gambling: 'gambling', drugs: 'drugs',
    violence: 'violence', extremism: 'extremism',
    custom: 'custom', whitelist_mode: 'custom'
  };

  list.innerHTML = logs.slice(0, 100).map(entry => {
    const catClass = CATEGORY_COLORS[entry.category] || '';
    const displayUrl = entry.hostname || entry.url || 'Unknown';
    const time = formatTime(entry.timestamp);
    return `
      <div class="log-entry">
        <div class="log-entry-top">
          <span class="log-category ${catClass}">${sanitize(entry.category || 'blocked')}</span>
          <span class="log-time">${sanitize(time)}</span>
        </div>
        <div class="log-url" title="${sanitize(entry.url || '')}">
          ${sanitize(displayUrl)}
        </div>
      </div>
    `;
  }).join('');

  // Bind clear button
  const clearBtn = $('clear-logs-btn');
  if (clearBtn) {
    clearBtn.onclick = async () => {
      await sendBg({ type: 'CLEAR_LOGS' });
      await loadLogs();
    };
  }
}

// ─── Settings tab ─────────────────────────────────────────────────────────────

function bindSettingsTab() {
  $('change-password-btn').addEventListener('click', async () => {
    const newPw = $('new-password').value;
    const confirmPw = $('confirm-password').value;

    if (!newPw || newPw.length < 4) {
      setError('pw-error', 'Password must be at least 4 characters');
      return;
    }
    if (newPw !== confirmPw) {
      setError('pw-error', 'Passwords do not match');
      return;
    }

    const res = await sendBg({ type: 'SET_PASSWORD', password: newPw });
    if (res?.success) {
      $('new-password').value = '';
      $('confirm-password').value = '';
      setSuccess('pw-success', 'Password updated successfully!');
    }
  });
}

// ─── Lock button ──────────────────────────────────────────────────────────────

function bindLockButton() {
  $('lock-btn').addEventListener('click', () => {
    isUnlocked = false;
    showScreen('lock-screen');
    bindLockScreen();
    $('lock-password').value = '';
    setTimeout(() => $('lock-password').focus(), 100);
  });
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);
