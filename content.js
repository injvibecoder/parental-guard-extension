/**
 * content.js — ParentalGuard Content Script
 *
 * Runs at document_start in all frames.
 * Responsibilities:
 * - Keyword scanning of page content (title, meta, visible text)
 * - YouTube protection (age-restricted / harmful content detection)
 * - Incognito / DevTools detection warnings
 * - Safe search parameter enforcement on search pages
 */

(function () {
  'use strict';

  // Prevent double-injection
  if (window.__parentalGuardLoaded) return;
  window.__parentalGuardLoaded = true;

  const BLOCKED_PAGE_URL = chrome.runtime.getURL('blocked.html');

  // ─── Utility ────────────────────────────────────────────────────────────────

  function sendBg(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) resolve(null);
          else resolve(response);
        });
      } catch {
        resolve(null);
      }
    });
  }

  function redirectToBlocked(reason, keyword) {
    const url = encodeURIComponent(window.location.href);
    const kw = encodeURIComponent(keyword || '');
    window.stop(); // Stop any further loading
    window.location.replace(
      `${BLOCKED_PAGE_URL}?reason=${encodeURIComponent(reason)}&url=${url}&kw=${kw}`
    );
  }

  // ─── Adult keyword list (trimmed for content scanning) ──────────────────────
  const CONTENT_KEYWORDS = [
    'pornography', 'nude photos', 'naked videos', 'sex videos',
    'adult content', 'explicit content', 'xxx', 'erotic',
    'hentai', 'age-restricted', 'mature content', '18+ only',
    'adults only', 'nude', 'nudity'
  ];

  const GAMBLING_KEYWORDS = [
    'online casino', 'sports betting', 'place your bets', 'bet now',
    'live casino', 'poker tournament', 'slots machine', 'jackpot winner'
  ];

  const DRUGS_KEYWORDS = [
    'buy cocaine', 'buy heroin', 'buy methamphetamine', 'order drugs online',
    'drug marketplace', 'drug vendor', 'how to make meth', 'how to make drugs'
  ];

  // ─── YouTube-specific protection ─────────────────────────────────────────────

  const YOUTUBE_HARMFUL = [
    'porn', 'sex tape', 'nude', 'naked challenge', 'onlyfans',
    'explicit', 'nsfw', '18+', 'adult only', 'gore', 'self harm',
    'suicide how', 'drug tutorial', 'bomb making', 'hentai'
  ];

  function isYouTube() {
    return window.location.hostname.includes('youtube.com');
  }

  async function handleYouTube() {
    const status = await sendBg({ type: 'YOUTUBE_CHECK' });
    if (!status || !status.ytRestrict) return;

    // Check page title and video metadata for harmful keywords
    function checkYouTubeContent() {
      const title = document.title || '';
      const titleLower = title.toLowerCase();

      for (const kw of YOUTUBE_HARMFUL) {
        if (titleLower.includes(kw)) {
          redirectToBlocked('adult', kw);
          return;
        }
      }

      // Check video description if present
      const descEl = document.querySelector('#description-text, .ytd-text-inline-expander');
      if (descEl) {
        const desc = (descEl.textContent || '').toLowerCase();
        for (const kw of YOUTUBE_HARMFUL) {
          if (desc.includes(kw)) {
            redirectToBlocked('adult', kw);
            return;
          }
        }
      }

      // Check for age-restricted interstitial
      const ageGate = document.querySelector(
        'ytd-player-error-message-renderer, #player-error-message-container, .ytd-player-error-message-renderer'
      );
      if (ageGate) {
        const gateText = (ageGate.textContent || '').toLowerCase();
        if (gateText.includes('age') || gateText.includes('restricted') || gateText.includes('sign in')) {
          redirectToBlocked('adult', 'age-restricted content');
          return;
        }
      }

      // Check for age-gate overlay
      const signInPrompt = document.querySelector('a[href*="accounts.google.com"]');
      if (signInPrompt) {
        const container = signInPrompt.closest('ytd-player-error-message-renderer');
        if (container) {
          redirectToBlocked('adult', 'age-restricted content');
        }
      }
    }

    // Check immediately and on DOM mutations
    checkYouTubeContent();

    const observer = new MutationObserver(() => {
      checkYouTubeContent();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    // Unobserve after 10 seconds to save resources (page is loaded by then)
    setTimeout(() => observer.disconnect(), 10000);
  }

  // ─── Generic page content scanning ───────────────────────────────────────────

  async function scanPageContent() {
    // Only scan once DOM is available
    const title = (document.title || '').toLowerCase();
    const metaDesc = (document.querySelector('meta[name="description"]')?.content || '').toLowerCase();
    const metaKeywords = (document.querySelector('meta[name="keywords"]')?.content || '').toLowerCase();
    const ogTitle = (document.querySelector('meta[property="og:title"]')?.content || '').toLowerCase();

    const haystack = [title, metaDesc, metaKeywords, ogTitle].join(' ');

    for (const kw of CONTENT_KEYWORDS) {
      if (haystack.includes(kw)) {
        redirectToBlocked('adult', kw);
        return;
      }
    }

    for (const kw of GAMBLING_KEYWORDS) {
      if (haystack.includes(kw)) {
        redirectToBlocked('gambling', kw);
        return;
      }
    }

    for (const kw of DRUGS_KEYWORDS) {
      if (haystack.includes(kw)) {
        redirectToBlocked('drugs', kw);
        return;
      }
    }
  }

  // ─── DevTools detection ───────────────────────────────────────────────────────
  // Warns (but does not block) when DevTools might be open.
  // A real attacker can bypass this, but it discourages casual attempts.

  function setupDevToolsDetection() {
    let devToolsOpen = false;

    const threshold = 160;

    setInterval(() => {
      const widthDiff = window.outerWidth - window.innerWidth;
      const heightDiff = window.outerHeight - window.innerHeight;

      if ((widthDiff > threshold || heightDiff > threshold) && !devToolsOpen) {
        devToolsOpen = true;
        sendBg({ type: 'DEVTOOLS_OPEN', url: window.location.href });
        console.warn('[ParentalGuard] Developer tools may be open.');
      } else if (widthDiff <= threshold && heightDiff <= threshold) {
        devToolsOpen = false;
      }
    }, 1000);
  }

  // ─── Safe search parameter check ─────────────────────────────────────────────

  function enforceSafeSearchParams() {
    const host = window.location.hostname;
    const url = new URL(window.location.href);

    // Google
    if (/google\.(com|co\.|ca)/.test(host) && url.pathname.includes('/search')) {
      if (url.searchParams.get('safe') !== 'active') {
        url.searchParams.set('safe', 'active');
        window.location.replace(url.toString());
      }
    }

    // Bing
    if (host.includes('bing.com') && url.pathname.includes('/search')) {
      if (url.searchParams.get('adlt') !== 'strict') {
        url.searchParams.set('adlt', 'strict');
        window.location.replace(url.toString());
      }
    }

    // DuckDuckGo
    if (host.includes('duckduckgo.com')) {
      if (url.searchParams.get('kp') !== '1') {
        url.searchParams.set('kp', '1');
        window.location.replace(url.toString());
      }
    }
  }

  // ─── Initialization ───────────────────────────────────────────────────────────

  async function init() {
    // Don't run on the blocked page itself
    if (window.location.href.startsWith(BLOCKED_PAGE_URL)) return;

    // Check if protection is enabled
    const status = await sendBg({ type: 'GET_STATUS' });
    if (!status || !status.enabled) return;

    // YouTube-specific handling
    if (isYouTube()) {
      handleYouTube();
    }

    // Safe search params
    enforceSafeSearchParams();

    // Scan page content once DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', scanPageContent, { once: true });
    } else {
      scanPageContent();
    }

    // DevTools detection (only in main frame)
    if (window === window.top) {
      setupDevToolsDetection();
    }
  }

  // Run init
  init();

})();
