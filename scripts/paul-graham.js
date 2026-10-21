const fs = require('fs');
const path = require('path');
const os = require('os');
const { JSDOM } = require('jsdom');
const { extractReadableText } = require('./full-content-fetcher');
const { USER_AGENT } = require('./project-meta');
const INDEX_URL = 'https://paulgraham.com/articles.html';
const DEFAULT_STATE = path.join(os.homedir(), '.local/share/ai-rss-digest/paul-graham.json');

async function fetchPage(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  if (response.url && new URL(response.url).hostname.replace(/^www\./, '') !== 'paulgraham.com') throw new Error('Unexpected redirect outside Paul Graham');
  return response.text();
}

function indexLinks(html) {
  const dom = new JSDOM(html, { url: INDEX_URL });
  try {
    const links = new Map();
    for (const a of dom.window.document.querySelectorAll('tr[valign="top"] td[width="435"] font > a[href]')) {
      const url = new URL(a.href);
      if (!['paulgraham.com', 'www.paulgraham.com'].includes(url.hostname) || !/^\/[a-z0-9-]+\.html$/.test(url.pathname)) continue;
      url.protocol = 'https:'; url.hostname = 'paulgraham.com'; url.search = ''; url.hash = '';
      if (['/articles.html', '/index.html', '/rss.html'].includes(url.pathname)) continue;
      const title = a.textContent.trim();
      if (title) links.set(url.href, { link: url.href, title });
    }
    if (!links.size) throw new Error('Paul Graham index structure unrecognized; baseline unchanged');
    return [...links.values()];
  } finally { dom.window.close(); }
}

// Keep the original month/year as text. Never invent a day or publication timestamp.
function publicationLabel(text) {
  return text.match(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/)?.[0] || null;
}

async function collect({ stateFile = DEFAULT_STATE, now = new Date().toISOString(), fetchHtml = fetchPage, budget = 3, hours = 24 } = {}) {
  if (!Number.isFinite(Date.parse(now)) || !Number.isInteger(budget) || budget < 0 || budget > 20 || !Number.isFinite(hours) || hours <= 0) throw new Error('Invalid Paul Graham acquisition options');
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  const lock = `${stateFile}.lock`;
  const fd = fs.openSync(lock, 'wx');
  const temp = `${stateFile}.${process.pid}.tmp`;
  try {
    let state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : null;
    if (state && (state.version !== 1 || !Array.isArray(state.seen) || !Array.isArray(state.pending) || !Array.isArray(state.cache))) throw new Error('Invalid Paul Graham state; do not reset baseline');
    const links = indexLinks(await fetchHtml(INDEX_URL));
    const save = () => { fs.writeFileSync(temp, JSON.stringify(state, null, 2) + '\n'); fs.renameSync(temp, stateFile); };
    if (!state) {
      state = { version: 1, baselineAt: now, checkedAt: now, seen: links.map(a => a.link), pending: [], cache: [] };
      save();
      return { status: 'baseline-created', baselineCount: links.length, articles: [], attempted: 0, pending: 0, errors: [] };
    }
    if (links.length < state.seen.length / 2) throw new Error('Paul Graham index unexpectedly shrank; baseline unchanged');
    const seen = new Set(state.seen);
    const added = links.filter(a => !seen.has(a.link));
    state.pending.push(...added.map(a => ({ ...a, discoveredAt: now })));
    state.seen = [...new Set([...state.seen, ...links.map(a => a.link)])];
    state.checkedAt = now;
    save(); // Persist discoveries before any body fetch; failures remain retryable.
    const errors = [];
    const batch = state.pending.slice(0, budget);
    for (const item of batch) {
      try {
        const html = await fetchHtml(item.link);
        const content = extractReadableText(html, item.link);
        const dom = new JSDOM(html);
        let dateText = null;
        try {
          dom.window.document.querySelectorAll('script, style').forEach(node => node.remove());
          const walker = dom.window.document.createTreeWalker(dom.window.document.body, 4);
          let node; let count = 0;
          while ((node = walker.nextNode()) && count++ < 40) {
            const text = node.textContent.trim();
            if (text && publicationLabel(text) === text) { dateText = text; break; }
          }
        } finally { dom.window.close(); }
        state.cache.push({ ...item, source: 'paulgraham.com', sourceTags: ['创业', 'YC'], language: 'global',
          acquisitionKind: 'official-index-incremental', readingClass: 'newly-discovered-longform',
          publicationDateText: dateText, pubDate: null, hasValidPubDate: false, content,
          fullContent: content, fullContentMeta: { fetchedFrom: 'official-index', charCount: content.length },
          acquiredAt: now });
        state.pending = state.pending.filter(a => a.link !== item.link);
        save();
      } catch (error) { errors.push({ link: item.link, error: error.message }); }
    }
    // Retry failures fairly, retaining their original discovery timestamps.
    const attempted = new Set(batch.map(a => a.link));
    state.pending = [...state.pending.filter(a => !attempted.has(a.link)), ...state.pending.filter(a => attempted.has(a.link))];
    // Cache delivery across repeated runs; recency is acquisition, never publication.
    state.cache = state.cache.filter(a => Date.parse(a.acquiredAt) >= Date.parse(now) - 7 * 86400000);
    save();
    return { status: 'checked', newLinks: added.length, attempted: batch.length, pending: state.pending.length, errors,
      articles: state.cache.filter(a => Date.parse(a.acquiredAt) >= Date.parse(now) - hours * 3600000) };
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
    fs.closeSync(fd); fs.unlinkSync(lock);
  }
}
module.exports = { collect, indexLinks, publicationLabel, INDEX_URL, DEFAULT_STATE };
