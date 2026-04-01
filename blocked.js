    // Parse URL parameters
    const params = new URLSearchParams(window.location.search);
    const reason = params.get('reason') || 'adult';
    const blockedUrl = params.get('url') || '';
    const keyword = params.get('kw') || '';
    const isWelcome = params.get('welcome') === '1';

    const card = document.getElementById('main-card');

    if (isWelcome) {
      // Welcome / Installation success screen
      card.classList.add('welcome-card');
      card.innerHTML = `
        <div class="shield-wrap">
          <span class="shield-icon">🛡️</span>
        </div>
        <h1 class="blocked-title">ParentalGuard Installed!</h1>
        <p class="blocked-subtitle">
          Your browser is now protected. Configure your settings by clicking the extension icon.
        </p>
        <ul class="setup-steps">
          <li><span class="step-num">1</span>Click the 🛡️ icon in your toolbar</li>
          <li><span class="step-num">2</span>Set a secure admin password</li>
          <li><span class="step-num">3</span>Customize which categories to block</li>
          <li><span class="step-num">4</span>Add any custom sites to whitelist/blacklist</li>
        </ul>
        <div class="actions">
          <a href="https://www.google.com" class="btn btn-home">🏠 Go to Homepage</a>
        </div>
        <div class="brand">🛡️ ParentalGuard — Safe Browsing Protection</div>
      `;
    } else {
      // Blocked page
      const REASONS = {
        adult: { icon: '🔞', label: 'Adult Content', msg: 'This website contains adult or explicit content that is not appropriate.' },
        gambling: { icon: '🎰', label: 'Gambling', msg: 'This website involves gambling, betting, or casino activities.' },
        drugs: { icon: '💊', label: 'Drugs', msg: 'This website contains information about illegal drugs or substances.' },
        violence: { icon: '⚠️', label: 'Violence & Gore', msg: 'This website contains graphic violence or disturbing content.' },
        extremism: { icon: '🚫', label: 'Extremism', msg: 'This website has been flagged for extremist or dangerous content.' },
        custom: { icon: '🚫', label: 'Blocked Site', msg: 'This website has been blocked by the administrator.' },
        whitelist_mode: { icon: '🔒', label: 'Not Whitelisted', msg: 'Whitelist mode is active. Only approved websites are accessible.' }
      };

      const info = REASONS[reason] || REASONS.adult;
      const displayUrl = blockedUrl ? decodeURIComponent(blockedUrl).substring(0, 80) : 'Unknown URL';

      card.innerHTML = `
        <div class="shield-wrap">
          <span class="shield-icon">🛡️</span>
        </div>
        <h1 class="blocked-title">Access Blocked</h1>
        <p class="blocked-subtitle">${info.msg}</p>
        <div class="reason-badge ${reason}">
          ${info.icon} ${info.label}
        </div>
        ${blockedUrl ? `
        <div class="blocked-url">
          <span class="url-label">Attempted URL</span>
          ${displayUrl.replace(/</g,'&lt;').replace(/>/g,'&gt;')}${blockedUrl.length > 80 ? '…' : ''}
        </div>
        ` : ''}
        <div class="actions">
          <button class="btn btn-back" onclick="history.back()">← Go Back</button>
          <a href="https://www.google.com" class="btn btn-home">🏠 Home</a>
        </div>
        <div class="brand">🛡️ ParentalGuard — Safe Browsing Protection</div>
      `;
    }