const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const graphemes = text => Array.from(segmenter.segment(String(text)), part => part.segment);
function excerpt(text, limit) {
  const parts = graphemes(text);
  return parts.length > limit ? parts.slice(0, limit).join('') + '…' : String(text);
}
function linkIssue(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return 'invalid-article-url';
    const host = url.hostname.toLowerCase();
    if (['example.com','example.org','example.net'].some(h => host === h || host.endsWith('.' + h))) return 'placeholder-article-url';
    const segments = decodeURIComponent(url.pathname).split('/');
    const values = [...segments, ...url.searchParams.values()];
    if (values.some(v => /^(?:xxx|undefined|null|\{[^{}]+\})$/i.test(v))) return 'placeholder-article-url';
    return null;
  } catch { return 'invalid-article-url'; }
}
function assertLinks(rows) {
  for (const row of rows) {
    const issue = linkIssue(row.link);
    if (issue) throw new Error(`${issue}: ${row.link || '(missing)'}; correct the source link before publication`);
  }
}
function unmark(row) {
  if (!row.fullContentMeta?.summaryOnly) return row;
  return { ...row, title: String(row.title || '').replace(/^【仅基于摘要】/, ''),
    risk: String(row.risk || '').replace(/^仅基于摘要，未取得原文。/, '') };
}
module.exports = { graphemes, excerpt, linkIssue, assertLinks, unmark };
