const { canonicalUrl } = require('./article-identity');

function hasBody(article) {
  return typeof article.content === 'string' && /[\p{L}\p{N}]/u.test(article.content);
}

function localReason(article, now) {
  if (!article.hasValidPubDate || !Number.isFinite(Date.parse(article.pubDate)) || Date.parse(article.pubDate) > Date.parse(now)) return 'unverified-publication-time';
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

module.exports = { hasBody, localReason, coverageDiagnostics };
