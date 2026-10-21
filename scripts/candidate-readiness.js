const { canonicalUrl } = require('./article-identity');

function hasBody(article) {
  return typeof article.content === 'string' && /[\p{L}\p{N}]/u.test(article.content);
}

function isDiscoveredLongform(article, now = new Date().toISOString()) {
  return article.source === 'paulgraham.com' &&
    /^https:\/\/paulgraham\.com\/[a-z0-9-]+\.html$/.test(article.link || '') &&
    article.acquisitionKind === 'official-index-incremental' && article.readingClass === 'newly-discovered-longform' &&
    article.pubDate === null && article.hasValidPubDate === false &&
    Number.isFinite(Date.parse(article.discoveredAt)) && Number.isFinite(Date.parse(article.acquiredAt)) &&
    Date.parse(article.discoveredAt) <= Date.parse(article.acquiredAt) && Date.parse(article.acquiredAt) <= Date.parse(now);
}

function localReason(article, now) {
  if (!isDiscoveredLongform(article, now) && (!article.hasValidPubDate || !Number.isFinite(Date.parse(article.pubDate)) || Date.parse(article.pubDate) > Date.parse(now))) return 'unverified-publication-time';
  if (!canonicalUrl(article.link)) return 'missing-article-url';
  if (!hasBody(article)) return 'missing-body';
  return null;
}

function coverageDiagnostics(articles) {
  const withBody = articles.filter(hasBody).length;
  const ratio = articles.length ? withBody / articles.length : null;
  const degraded = articles.length >= 10 && ratio < 0.2;
  return {
    total: articles.length, withBody, withoutBody: articles.length - withBody, bodyCoverage: ratio,
    status: degraded ? 'low-body-coverage' : articles.length === 0 ? 'no-candidates' : 'ok',
    warning: degraded ? '正文覆盖率低于 20%（至少 10 条候选）；需检查源内容或解析，不可解释为今日无优质内容。' : null
  };
}

module.exports = { isDiscoveredLongform, hasBody, localReason, coverageDiagnostics };
