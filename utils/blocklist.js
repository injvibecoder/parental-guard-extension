/**
 * utils/blocklist.js
 * Keyword and domain lists for ParentalGuard content filtering.
 * Categories: adult, gambling, drugs, violence, extremism
 */

// ─── URL / Domain keyword fragments ────────────────────────────────────────
export const BLOCKED_KEYWORDS = {
  adult: [
    'porn', 'xxx', 'sex', 'nude', 'naked', 'erotic', 'adult', 'hentai',
    'nsfw', 'onlyfans', 'camgirl', 'webcam-sex', 'milf', 'fetish',
    'escort', 'stripper', 'redtube', 'xvideos', 'xnxx', 'pornhub',
    'youporn', 'xhamster', 'tube8', 'chaturbate', 'livejasmin', 'stripchat',
    'brazzers', 'bangbros', 'naughty', 'slutty', 'boobs', 'penis',
    'vagina', 'genitals', 'orgasm', 'masturbat', 'dildo', 'vibrator'
  ],
  gambling: [
    'casino', 'poker', 'blackjack', 'roulette', 'slots', 'bet365',
    'draftkings', 'fanduel', 'pokerstars', 'gambling', 'sportsbetting',
    'sportsbook', 'lottery', 'wager', 'jackpot', 'betway', 'unibet',
    '888casino', 'partypoker', 'bovada', 'betmgm', 'caesarsbet'
  ],
  drugs: [
    'cocaine', 'heroin', 'methamphetamine', 'crystal-meth', 'fentanyl',
    'buy-drugs', 'drug-dealer', 'drug-store-online', 'illegal-drugs',
    'psychedelics-buy', 'mdma-buy', 'lsd-buy', 'weed-buy-online',
    'darkweb-drugs', 'silkroad', 'erowid'
  ],
  violence: [
    'bestgore', 'liveleak', 'goregrish', 'beheading', 'execution-video',
    'murder-video', 'torture-video', 'snuff', 'gore-site'
  ],
  extremism: [
    'jihad', 'isis.com', 'al-qaeda', 'terrorist-recruit', 'bomb-making',
    'white-supremac', 'neo-nazi', 'hate-group', 'kill-order'
  ]
};

// Flat merged list for quick URL scanning
export const ALL_BLOCKED_KEYWORDS = Object.values(BLOCKED_KEYWORDS).flat();

// ─── Hard-blocked domains (always blocked regardless of settings) ───────────
export const HARDCODED_BLOCKED_DOMAINS = [
  // Adult
  'pornhub.com', 'xvideos.com', 'xnxx.com', 'redtube.com', 'youporn.com',
  'tube8.com', 'xhamster.com', 'livejasmin.com', 'chaturbate.com',
  'onlyfans.com', 'stripchat.com', 'cam4.com', 'myfreecams.com',
  'brazzers.com', 'bangbros.com', 'realitykings.com', 'nubiles.net',
  'spankbang.com', 'tnaflix.com', 'drtuber.com', 'nudevista.com',
  'fapdu.com', 'eporner.com', 'hclips.com', 'txxx.com', 'vxxx.com',
  // Gambling
  'bet365.com', 'draftkings.com', 'fanduel.com', 'pokerstars.com',
  'casino.com', '888casino.com', 'betway.com', 'unibet.com',
  'partypoker.com', 'bovada.lv', 'betmgm.com',
  // Gore / Violence
  'bestgore.com', 'liveleak.com', 'goregrish.com', 'kaotic.com',
  // Extremism
  'stormfront.org', 'dailystormer.su'
];

// ─── Safe Search enforcement ─────────────────────────────────────────────────
export const SAFE_SEARCH_RULES = [
  {
    name: 'Google Safe Search',
    urlPattern: /^https?:\/\/(www\.)?google\./,
    // Redirect to safe.google.com or force &safe=active parameter
    enforceParam: { key: 'safe', value: 'active' },
    blockParam: 'safe=images'   // parameter that indicates unsafe search
  },
  {
    name: 'Bing Safe Search',
    urlPattern: /^https?:\/\/(www\.)?bing\.com\/search/,
    enforceParam: { key: 'adlt', value: 'strict' }
  },
  {
    name: 'YouTube Restricted Mode',
    urlPattern: /^https?:\/\/(www\.)?youtube\.com/,
    enforceHeader: { name: 'YouTube-Restrict', value: 'Strict' }
  }
];

// ─── YouTube harmful keyword list ────────────────────────────────────────────
export const YOUTUBE_HARMFUL_KEYWORDS = [
  'porn', 'xxx', 'sex tape', 'nude', 'naked challenge', 'only fans',
  'hot girls', 'strip', '18+', 'adult only', 'explicit', 'nsfw',
  'hentai', 'gore', 'beheading', 'suicide how to', 'self harm',
  'drug tutorial', 'how to make drugs', 'how to make bomb'
];

// ─── Category labels for UI display ──────────────────────────────────────────
export const CATEGORY_LABELS = {
  adult: { label: 'Adult Content', icon: '🔞', color: '#ef4444' },
  gambling: { label: 'Gambling', icon: '🎰', color: '#f97316' },
  drugs: { label: 'Drugs', icon: '💊', color: '#a855f7' },
  violence: { label: 'Violence & Gore', icon: '⚠️', color: '#dc2626' },
  extremism: { label: 'Extremism', icon: '🚫', color: '#1d4ed8' }
};

/**
 * Detect if a URL matches any blocked category.
 * Returns { blocked: true, category, matchedKeyword } or { blocked: false }
 */
export function detectBlockedURL(url) {
  if (!url) return { blocked: false };

  const urlLower = url.toLowerCase();

  // Check hardcoded domains first (fastest path)
  try {
    const hostname = new URL(url).hostname.replace('www.', '');
    for (const domain of HARDCODED_BLOCKED_DOMAINS) {
      if (hostname === domain || hostname.endsWith('.' + domain)) {
        const cat = getDomainCategory(domain);
        return { blocked: true, category: cat, matchedKeyword: domain };
      }
    }
  } catch {
    // Invalid URL — skip domain check
  }

  // Keyword scan on full URL
  for (const [category, keywords] of Object.entries(BLOCKED_KEYWORDS)) {
    for (const kw of keywords) {
      if (urlLower.includes(kw)) {
        return { blocked: true, category, matchedKeyword: kw };
      }
    }
  }

  return { blocked: false };
}

function getDomainCategory(domain) {
  const adultDomains = ['pornhub', 'xvideos', 'xnxx', 'redtube', 'youporn',
    'tube8', 'xhamster', 'livejasmin', 'chaturbate', 'onlyfans', 'stripchat',
    'cam4', 'myfreecams', 'brazzers', 'bangbros', 'spankbang'];
  const gamblingDomains = ['bet365', 'draftkings', 'fanduel', 'pokerstars',
    'casino', '888casino', 'betway', 'unibet', 'partypoker', 'bovada', 'betmgm'];
  const violenceDomains = ['bestgore', 'liveleak', 'goregrish', 'kaotic'];
  const extremismDomains = ['stormfront', 'dailystormer'];

  if (adultDomains.some(d => domain.includes(d))) return 'adult';
  if (gamblingDomains.some(d => domain.includes(d))) return 'gambling';
  if (violenceDomains.some(d => domain.includes(d))) return 'violence';
  if (extremismDomains.some(d => domain.includes(d))) return 'extremism';
  return 'adult'; // default
}
