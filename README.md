# 🛡️ ParentalGuard — Chrome Extension

A production-ready parental control and safe browsing Chrome extension for kids and teenagers.

---

## 📁 Folder Structure

```
parental-guard-extension/
├── manifest.json          # Chrome Extension Manifest V3
├── background.js          # Service worker — URL interception, rule engine
├── content.js             # Content script — page scanning, YouTube protection
├── popup.html             # Admin dashboard UI
├── popup.js               # Dashboard logic
├── popup.css              # Dashboard styles
├── blocked.html
├── blocked.js             # Custom "Access Blocked" page
├── rules/
│   └── blocklist.json     # Static declarativeNetRequest rules (hardcoded domains)
├── utils/
│   ├── blocklist.js       # Keyword lists, domain lists, detection logic
│   ├── crypto.js          # SHA-256 password hashing (Web Crypto API)
│   └── storage.js         # chrome.storage abstraction + defaults
└── icons/
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    └── icon128.png
```

---

## 🚀 Installation Steps

### 1. Load the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer Mode** (toggle in top-right corner)
3. Click **"Load unpacked"**
4. Select the `parental-guard-extension/` folder
5. The 🛡️ ParentalGuard icon should appear in your toolbar

### 2. Initial Setup

1. Click the 🛡️ icon in the Chrome toolbar
2. You'll see the **Welcome Setup** screen
3. Create a secure admin password (minimum 4 characters)
4. Click **"Activate Protection"**
5. Protection is now ACTIVE! ✅

---

## 🧪 Testing Steps

### Test 1: Verify blocking works
1. Visit `pornhub.com` → Should redirect to the "Access Blocked" page
2. Visit `bet365.com` → Should be blocked with "Gambling" reason
3. Visit `google.com` → Should load normally ✅

### Test 2: Verify safe search
1. Go to `google.com/search?q=hello`
2. Check the URL — it should contain `&safe=active`
3. Go to `bing.com/search?q=hello` — should have `&adlt=strict`

### Test 3: Admin dashboard
1. Click the toolbar icon
2. Enter your admin password to unlock
3. Toggle "Adult Content" OFF
4. Visit pornhub.com — it should now load (category disabled)
5. Toggle it back ON

### Test 4: Custom blacklist
1. Open dashboard → Sites tab
2. Add `reddit.com` to custom blocked list
3. Visit `reddit.com` → Should be blocked
4. Remove it from the list → Should work again

### Test 5: Whitelist mode
1. Open dashboard → Sites tab
2. Enable "Whitelist Mode"
3. Add `google.com` to whitelist
4. Visit `github.com` → Should be blocked (not whitelisted)
5. Visit `google.com` → Should work ✅

### Test 6: Activity logs
1. Try to visit a few blocked sites
2. Open dashboard → Logs tab
3. You should see entries for each blocked attempt

### Test 7: Lock/unlock
1. Open dashboard
2. Click 🔒 lock icon (top right)
3. Verify you can't access settings without password

---

## 🔐 Security Features

| Feature | Implementation |
|---|---|
| Password hashing | SHA-256 with salt + pepper via Web Crypto API |
| No plaintext passwords | Hashed before storage |
| Settings locked | Requires password to access/modify |
| Tamper resistance | Settings in chrome.storage (not easily editable) |
| XSS prevention | All DOM content sanitized before rendering |
| CSP headers | Strict Content Security Policy in manifest |
| Safe eval | Zero use of eval() or inline scripts |
| Least privilege | Only necessary permissions declared |

---

## 🛡️ Blocking Architecture

```
Request → webNavigation.onBeforeNavigate
              ↓
         Protection Enabled? → No → Allow
              ↓ Yes
         Whitelist Mode? → Yes → Whitelisted? → Yes → Allow
              ↓ No                              No → Block
         User Whitelisted? → Yes → Allow
              ↓ No
         Custom Blacklist? → Yes → Block
              ↓ No
         Keyword/Domain Detection → Match? → Yes → Block
              ↓ No
         Allow + Apply Safe Search
```

Additionally, `declarativeNetRequest` rules block at the network level (fastest, before navigation).

---

## ⚠️ Limitations & Notes

- **Incognito mode**: The extension splits in incognito — it still runs but user has separate state. 
  For full incognito blocking, enable "Allow in Incognito" in chrome://extensions/ manually.
- **HTTPS inspection**: The extension uses URL-level blocking, not deep packet inspection.
- **VPN bypass**: A VPN can route around URL-level blocking. For maximum protection, use OS-level filtering (e.g., Circle, OpenDNS) alongside this extension.
- **New adult sites**: The keyword engine catches most new sites, but hardcoded lists need periodic updates.

---

## 📋 Permissions Used

| Permission | Reason |
|---|---|
| `storage` | Save settings and logs |
| `declarativeNetRequest` | Fast domain-level blocking |
| `tabs` | Redirect blocked tabs |
| `webNavigation` | Intercept page navigations |
| `alarms` | Periodic rule refresh |
| `<all_urls>` | Monitor all navigation |

---

## 🔧 Customization

To add more blocked domains, edit `rules/blocklist.json` and add entries following the same pattern.

To add keyword categories, edit `utils/blocklist.js` in the `BLOCKED_KEYWORDS` object.

