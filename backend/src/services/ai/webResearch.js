import { logger } from '../../lib/logger.js';

/**
 * WEB RESEARCH ENGINE
 *
 * Claude-Code-style search-then-fetch against the open web. The provider
 * seam keeps this swappable (DuckDuckGo today; Tavily/Brave/Exa later by
 * replacing `searchWeb`).
 *
 * Design constraints:
 * - Free: DuckDuckGo HTML endpoint, no API key.
 * - Rate-limit-friendly: browser User-Agent + 15-min cache + small delay.
 * - Fail-open: any error returns []/null so the AI pipeline never breaks.
 * - SSRF-safe: fetch blocks localhost / private IPs.
 */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const cache = new Map(); // key -> { at, data }
const TTL = 15 * 60 * 1000; // 15 minutes
const CACHE_SIZE = 200;

function cached(key, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  return fn().then((data) => {
    if (cache.size >= CACHE_SIZE) {
      const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      cache.delete(oldest?.[0]);
    }
    cache.set(key, { at: Date.now(), data });
    return data;
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Decode DuckDuckGo's obfuscated result URLs (/l/?uddg=...). */
function decodeDdgUrl(href) {
  try {
    const m = href.match(/uddg=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : href;
  } catch {
    return href;
  }
}

/** Decode common named + numeric HTML entities. */
function decodeEntities(text) {
  return String(text)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ''; }
    })
    .replace(/&#(\d+);/g, (_, d) => {
      try { return String.fromCodePoint(Number(d)); } catch { return ''; }
    })
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '…')
    .replace(/&rsquo;/g, '’')
    .replace(/&lsquo;/g, '‘')
    .replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”');
}

/** Strip HTML tags to readable text. */
function htmlToText(html) {
  return decodeEntities(
    String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
      .replace(/<header[\s\S]*?<\/header>/gi, ' ')
      .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
  ).trim();
}

/** Only allow http(s), block localhost / private IPs (SSRF guard). */
export function sanitizeUrl(url) {
  try {
    const u = new URL(String(url).trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    const host = u.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local')) return null;
    // Private ranges
    if (/^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(host)) return null;
    if (host === '[::1]') return null;
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Search the web via DuckDuckGo's HTML endpoint.
 * Returns up to 6 { title, url, snippet } results, or [] on failure.
 */
export async function searchWeb(query) {
  const q = String(query || '').trim();
  if (!q || q.length < 3) return [];
  const key = `q:${q.toLowerCase()}`;

  return cached(key, async () => {
    try {
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': UA,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) {
        logger.warn(`[web] search failed HTTP ${res.status} for "${q}"`);
        return [];
      }
      const html = await res.text();

      // Parse result blocks: <a class="result__a" href="...">Title</a> + <a class="result__snippet">...</a>
      const blocks = [...html.matchAll(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
      const snippets = [...html.matchAll(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)];
      const results = blocks.slice(0, 8).map((m, i) => ({
        title: htmlToText(m[2]).slice(0, 120),
        url: sanitizeUrl(decodeDdgUrl(m[1])) || '',
        snippet: htmlToText(snippets[i]?.[1] || '').slice(0, 250),
      }));
      return results.filter((r) => r.url && r.title).slice(0, 6);
    } catch (e) {
      logger.warn(`[web] search failed for "${q}": ${e.message}`);
      return [];
    }
  });
}

/**
 * Fetch a specific page and return readable text.
 * Returns { url, title, text } or null on failure.
 */
export async function fetchPage(url) {
  const safe = sanitizeUrl(url);
  if (!safe) return null;
  const key = `p:${safe}`;

  return cached(key, async () => {
    try {
      const res = await fetch(safe, {
        headers: {
          'User-Agent': UA,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        logger.warn(`[web] fetch failed HTTP ${res.status} for ${safe}`);
        return null;
      }
      const html = await res.text();
      if (html.length > 1_000_000) {
        logger.warn(`[web] page too large (${html.length}b) — truncated for ${safe}`);
      }
      const text = htmlToText(html).replace(/\s+/g, ' ').slice(0, 5000);
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      return {
        url: safe,
        title: titleMatch ? htmlToText(titleMatch[1]).slice(0, 120) : safe,
        text,
      };
    } catch (e) {
      logger.warn(`[web] fetch failed for ${safe}: ${e.message}`);
      return null;
    }
  });
}

/** Small inter-request delay to stay under DuckDuckGo's rate limits. */
export function webDelay() {
  return sleep(600 + Math.random() * 400);
}
