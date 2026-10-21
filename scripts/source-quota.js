const { JSDOM } = require('jsdom');
const { canonicalUrl } = require('./article-identity');

function publisherKey(link) {
  if (!canonicalUrl(link)) return null;
  const url = new URL(link);
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (['x.com', 'twitter.com', 'mobile.twitter.com'].includes(host)) {
    const match = url.pathname.match(/^\/([a-zA-Z0-9_]+)\/status\/\d+\/?$/);
    return match && !['i', 'intent', 'share'].includes(match[1].toLowerCase()) ? `account:x:${match[1].toLowerCase()}` : null;
  }
  return `host:${host}`;
}

function extractOrigin(source, html) {
  if (source !== 'AIHOT' || !html) return null;
  const fragment = JSDOM.fragment(html);
  const links = [...fragment.querySelectorAll('a[href]')]
    .filter(a => a.textContent.trim() === '阅读原文')
    .map(a => canonicalUrl(a.getAttribute('href'))).filter(Boolean);
  const unique = [...new Set(links)];
  if (unique.length !== 1) return null;
  const url = unique[0];
  if (['aihot.news', 'aihot.virxact.com'].includes(new URL(url).hostname.replace(/^www\./, ''))) return null;
  return { url, evidence: 'rss-read-original-link' };
}

function quotaIdentity(article, policy) {
  const config = Object.hasOwn(policy.aggregatorSources || {}, article.source) ? policy.aggregatorSources[article.source] : null;
  if (config) {
    const key = article.origin?.evidence === 'rss-read-original-link' ? publisherKey(article.origin.url) : null;
    return key
      ? { key, limit: policy.maxPerSource, basis: 'original-publisher' }
      : { key: `aggregator-unknown:${article.source}`, limit: config.unknownPublisherLimit, basis: 'unknown-original-publisher' };
  }
  return { key: publisherKey(article.link) || `source:${article.source}`, limit: policy.maxPerSource, basis: 'direct-publisher' };
}

module.exports = { publisherKey, extractOrigin, quotaIdentity };
