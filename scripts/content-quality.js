// Conservative failure detection, not a guarantee of complete or truthful content.
function contentFailure(text, url, html = '') {
  const compact = String(text || '').replace(/\s+/g, ' ').trim();
  if (compact.length < 1200 && (
    (/正在进行安全检测/.test(compact) && /系统正在检测当前网络环境|为保障您的访问安全/.test(compact)) ||
    /^(?:Just a moment[.!…]*\s*)?(?:Checking your browser|Verify you are human|Checking if the site connection is secure)/i.test(compact)
  )) return { code: 'challenge-page', message: 'Security challenge page is not article content' };
  let host;
  try { host = new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return null; }
  if (['x.com', 'twitter.com', 'mobile.twitter.com'].includes(host)) {
    // A clipped excerpt can end in an unfinished clause even without ellipsis.
    const danglingClause = compact.length > 100 && /\b(?:the|a|an|to|of|with|and|because|that|which)\s*$/i.test(compact);
    const ellipsis = /(?:…|\.{3})\s*$/.test(compact);
    // Only inspect explicit tweet expansion controls, not generic navigation.
    const expansion = /data-testid=["']tweet-text-show-more-link["']/i.test(html);
    if (danglingClause || ellipsis || expansion) return { code: 'x-truncated', message: 'X post has explicit truncation indicators; complete original unavailable' };
  }
  return null;
}

function assertUsableContent(text, url, html) {
  const failure = contentFailure(text, url, html);
  if (failure) { const error = new Error(failure.message); error.code = failure.code; throw error; }
  return text;
}
module.exports = { contentFailure, assertUsableContent };
