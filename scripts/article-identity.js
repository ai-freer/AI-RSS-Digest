const crypto = require('crypto');

function canonicalUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_/i.test(key) || /^(fbclid|gclid|mc_cid|mc_eid)$/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    // Query IDs and changelog fragments can identify distinct articles.
    return url.href;
  } catch (_) {
    return '';
  }
}

function fingerprint(text) {
  return String(text || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function articleId(article) {
  return hash(canonicalUrl(article.link) || `${article.source || ''}:${article.guid || fingerprint(article.title + (article.content || ''))}`).slice(0, 24);
}

module.exports = { canonicalUrl, fingerprint, hash, articleId };
