/**
 * Feed Quality Monitor
 *
 * 独立质检脚本：持续观察源可达性与更新活跃度，不做自动删源。
 * 输出：
 * 1) latest JSON 报告
 * 2) history JSONL（每次运行追加一行）
 */

const fs = require('fs');
const path = require('path');
const {
  BASE_RSS_FEEDS,
  buildFeedList,
  checkFeedsHealth,
  CONFIG
} = require('./rss-fetcher');

function parseArgs(argv) {
  const options = {
    includeCN: true,
    cnTier: 'A',
    timeoutMs: 6000,
    concurrency: CONFIG.CONCURRENCY,
    lowItemThreshold: 1,
    latestFile: path.join('tmp', 'feed-quality-latest.json'),
    historyFile: path.join('tmp', 'feed-quality-history.jsonl')
  };

  for (const arg of argv) {
    if (arg === '--include-cn') {
      options.includeCN = true;
      continue;
    }
    if (arg === '--exclude-cn') {
      options.includeCN = false;
      continue;
    }
    if (arg.startsWith('--cn-tier=')) {
      options.cnTier = arg.split('=')[1] || options.cnTier;
      continue;
    }
    if (arg.startsWith('--timeout-ms=')) {
      const n = Number(arg.split('=')[1]);
      if (Number.isFinite(n) && n > 0) options.timeoutMs = n;
      continue;
    }
    if (arg.startsWith('--concurrency=')) {
      const n = Number(arg.split('=')[1]);
      if (Number.isFinite(n) && n > 0) options.concurrency = n;
      continue;
    }
    if (arg.startsWith('--low-item-threshold=')) {
      const n = Number(arg.split('=')[1]);
      if (Number.isFinite(n) && n >= 0) options.lowItemThreshold = n;
      continue;
    }
    if (arg.startsWith('--latest-file=')) {
      options.latestFile = arg.split('=')[1] || options.latestFile;
      continue;
    }
    if (arg.startsWith('--history-file=')) {
      options.historyFile = arg.split('=')[1] || options.historyFile;
      continue;
    }
  }

  return options;
}

function classifyFailure(error = '') {
  const msg = String(error).toLowerCase();
  if (msg.includes('429')) return 'rate_limited';
  if (msg.includes('aborted') || msg.includes('timeout')) return 'timeout_or_slow';
  if (msg.includes('401') || msg.includes('403')) return 'auth_or_blocked';
  if (msg.includes('404')) return 'not_found';
  if (msg.includes('fetch failed')) return 'network_or_tls';
  return 'unknown';
}

function timeoutSignal(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, timer };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 6000) {
  const { controller, timer } = timeoutSignal(timeoutMs);
  try {
    const resp = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'RSS-Digest-QualityMonitor/1.0',
        ...(options.headers || {})
      }
    });
    clearTimeout(timer);
    return resp;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

function candidateFeedUrlsFromOrigins(origins) {
  const list = [];
  const suffixes = ['/feed.xml', '/rss.xml', '/atom.xml', '/index.xml'];
  for (const origin of origins) {
    for (const suffix of suffixes) {
      list.push(`${origin}${suffix}`);
    }
  }
  return [...new Set(list)];
}

function looksLikeFeed(contentType = '', body = '') {
  const ct = String(contentType).toLowerCase();
  if (ct.includes('application/rss+xml') || ct.includes('application/atom+xml')) return true;
  if (ct.includes('xml')) return true;
  const text = String(body);
  return text.includes('<rss') || text.includes('<feed') || text.includes('<rdf:RDF');
}

function toAbsoluteUrl(href, baseUrl) {
  if (!href) return null;
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function uniqueNonEmpty(items) {
  return [...new Set(items.filter(Boolean))];
}

function extractHomePageCandidates(feed, origins) {
  const pages = [];
  for (const origin of origins) {
    pages.push(`${origin}/`);
  }

  try {
    const u = new URL(feed.url);
    pages.push(`${u.origin}/`);
    const pathParts = u.pathname.split('/').filter(Boolean);
    if (pathParts.length > 0) {
      const dir = `/${pathParts.slice(0, -1).join('/')}/`;
      pages.push(`${u.origin}${dir}`);
    }
  } catch {
    // ignore malformed url
  }

  // 兼容 name 直接是域名（如 example.com 或 example.com/path）
  if (feed.name && !String(feed.name).includes(' ')) {
    const fromName = toAbsoluteUrl(`https://${feed.name}`, 'https://example.com');
    if (fromName) {
      try {
        const n = new URL(fromName);
        pages.push(`${n.origin}/`);
      } catch {
        // ignore
      }
    }
  }

  return uniqueNonEmpty(pages);
}

function extractFeedCandidatesFromHtml(html, baseUrl) {
  const candidates = [];
  const text = String(html || '');

  // 1) <link rel="alternate" type="application/rss+xml|application/atom+xml" href="...">
  const linkTagRegex = /<link\b[^>]*>/gi;
  let match;
  while ((match = linkTagRegex.exec(text)) !== null) {
    const tag = match[0];
    const rel = (tag.match(/\brel\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
    const type = (tag.match(/\btype\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
    const href = (tag.match(/\bhref\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
    const relOk = rel.toLowerCase().includes('alternate');
    const typeOk = /(rss|atom|xml)/i.test(type);
    const hrefLooksFeed = /(rss|atom|feed|xml)/i.test(href);
    if ((relOk && typeOk) || (relOk && hrefLooksFeed)) {
      const abs = toAbsoluteUrl(href, baseUrl);
      if (abs) candidates.push(abs);
    }
  }

  // 2) 兜底：页面中出现的 href 包含 feed/rss/atom/xml
  const hrefRegex = /\bhref\s*=\s*["']([^"']+)["']/gi;
  while ((match = hrefRegex.exec(text)) !== null) {
    const href = match[1] || '';
    if (!/(rss|atom|feed|xml)/i.test(href)) continue;
    const abs = toAbsoluteUrl(href, baseUrl);
    if (abs) candidates.push(abs);
  }

  return uniqueNonEmpty(candidates);
}

async function validateFeedCandidate(candidate, timeoutMs = 6000) {
  try {
    const resp = await fetchWithTimeout(candidate, { method: 'GET', redirect: 'follow' }, timeoutMs);
    if (!resp.ok) return null;
    const contentType = resp.headers.get('content-type') || '';
    const body = await resp.text();
    if (!looksLikeFeed(contentType, body)) return null;
    return candidate;
  } catch {
    return null;
  }
}

async function traceRedirectOrigins(url, maxHops = 8, timeoutMs = 6000) {
  const origins = new Set();
  let current = url;

  for (let i = 0; i < maxHops; i++) {
    let parsed;
    try {
      parsed = new URL(current);
      origins.add(parsed.origin);
    } catch {
      break;
    }

    let resp;
    try {
      resp = await fetchWithTimeout(current, { method: 'GET', redirect: 'manual' }, timeoutMs);
    } catch {
      break;
    }

    const isRedirect = resp.status >= 300 && resp.status < 400;
    const location = resp.headers.get('location');
    if (!isRedirect || !location) break;

    try {
      current = new URL(location, current).toString();
    } catch {
      break;
    }
  }

  return [...origins];
}

async function detectReplacementFeed(feed, timeoutMs = 6000) {
  const origins = await traceRedirectOrigins(feed.url, 8, timeoutMs);
  if (origins.length === 0) {
    try {
      const original = new URL(feed.url);
      origins.push(original.origin);
    } catch {
      return null;
    }
  }

  const currentUrl = String(feed.url || '');

  // 第一阶段：基于 origin + 常见后缀探测
  const candidates = candidateFeedUrlsFromOrigins(origins);
  for (const candidate of candidates) {
    if (candidate === currentUrl) continue;
    const ok = await validateFeedCandidate(candidate, timeoutMs);
    if (ok) {
      return {
        suggestedUrl: ok,
        reason: 'origin_suffix_probe'
      };
    }
  }

  // 第二阶段：抓主页解析 rel=alternate 与 feed 链接
  const homePages = extractHomePageCandidates(feed, origins);
  for (const homeUrl of homePages) {
    let resp;
    try {
      resp = await fetchWithTimeout(homeUrl, { method: 'GET', redirect: 'follow' }, timeoutMs);
    } catch {
      continue;
    }
    if (!resp.ok) continue;

    const contentType = (resp.headers.get('content-type') || '').toLowerCase();
    if (!(contentType.includes('text/html') || contentType.includes('application/xhtml+xml') || contentType === '')) {
      continue;
    }

    const html = await resp.text();
    const discovered = extractFeedCandidatesFromHtml(html, homeUrl);
    for (const candidate of discovered) {
      if (candidate === currentUrl) continue;
      const ok = await validateFeedCandidate(candidate, timeoutMs);
      if (ok) {
        return {
          suggestedUrl: ok,
          reason: 'homepage_alternate_probe'
        };
      }
    }
  }

  return null;
}

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function writeLatest(filePath, report) {
  ensureDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf8');
}

function appendHistory(filePath, report) {
  ensureDir(filePath);
  const snapshot = {
    generatedAt: report.generatedAt,
    scope: report.scope,
    stats: report.stats,
    unstable: report.flags.unhealthy.map(x => ({
      feed: x.feed,
      error: x.error,
      failureType: x.failureType,
      suggestion: x.suggestion || null
    }))
  };
  fs.appendFileSync(filePath, `${JSON.stringify(snapshot)}\n`, 'utf8');
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const feeds = options.includeCN
    ? buildFeedList({ includeCN: true, cnTier: options.cnTier })
    : [...BASE_RSS_FEEDS];

  const health = await checkFeedsHealth(feeds, options.concurrency, options.timeoutMs);
  const checks = health.checks || [];
  const byName = new Map(feeds.map(f => [f.name, f]));

  const unhealthy = [];
  for (const item of checks.filter(c => !c.healthy)) {
    const feedDef = byName.get(item.feed);
    const failureType = classifyFailure(item.error);
    let suggestion = null;
    if (feedDef) {
      suggestion = await detectReplacementFeed(feedDef, options.timeoutMs);
    }
    unhealthy.push({
      feed: item.feed,
      url: item.url,
      error: item.error,
      failureType,
      latencyMs: item.latencyMs,
      suggestion
    });
  }

  const lowActivity = checks
    .filter(c => c.healthy && (c.itemCount || 0) <= options.lowItemThreshold)
    .map(c => ({
      feed: c.feed,
      url: c.url,
      itemCount: c.itemCount || 0,
      latencyMs: c.latencyMs,
      note: 'low_activity_observe_only'
    }));

  const rateLimited = unhealthy.filter(x => x.failureType === 'rate_limited');
  const healthy = checks.filter(c => c.healthy).length;
  const availability = checks.length > 0 ? healthy / checks.length : 0;

  const report = {
    generatedAt: new Date().toISOString(),
    scope: {
      includeCN: options.includeCN,
      cnTier: options.includeCN ? options.cnTier : 'DISABLED'
    },
    stats: {
      totalFeeds: checks.length,
      healthyFeeds: healthy,
      unhealthyFeeds: checks.length - healthy,
      availabilityRate: Number((availability * 100).toFixed(2)),
      lowActivityFeeds: lowActivity.length,
      rateLimitedFeeds: rateLimited.length
    },
    policy: {
      autoDeleteFeeds: false,
      action: 'observe_and_suggest_updates_only'
    },
    flags: {
      unhealthy,
      lowActivity,
      rateLimited
    }
  };

  writeLatest(options.latestFile, report);
  appendHistory(options.historyFile, report);

  console.log(JSON.stringify({
    ok: true,
    latestFile: options.latestFile,
    historyFile: options.historyFile,
    stats: report.stats,
    unstableTop: report.flags.unhealthy.slice(0, 10).map(x => ({
      feed: x.feed,
      failureType: x.failureType,
      suggestion: x.suggestion ? x.suggestion.suggestedUrl : null
    }))
  }, null, 2));
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    run,
    parseArgs,
    classifyFailure,
    looksLikeFeed,
    extractFeedCandidatesFromHtml,
    candidateFeedUrlsFromOrigins
  };
}

if (require.main === module) {
  run().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
