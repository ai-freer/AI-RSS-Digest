const { test } = require('node:test');
const assert = require('node:assert/strict');
const { contentFailure } = require('./content-quality');
const { enrichArticle } = require('./full-content-fetcher');
const { ensureSummaryShape, buildDeepReadPrompt } = require('./summary-utils');
const { normalizeSummaryData, formatMarkdown } = require('./output-formatter');
const { samples } = require('./fixtures/content-quality-2026-10-25.json');
const html = text => `<html><head><title>Test wrapper</title></head><body><article><p>${text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p></article></body></html>`;

test('real extracted challenge and X truncation samples are rejected; valid short post is accepted', () => {
  for (const a of samples) assert.equal(contentFailure(a.extracted, a.url)?.code || null, a.expectedFailure);
  assert.equal(contentFailure('A brief useful announcement without terminal punctuation', 'https://x.com/user/status/1'), null);
  assert.equal(contentFailure('Discussing "正在进行安全检测" as a UI label.', 'https://fixtures.test'), null);
  assert.equal(contentFailure('This complete post has text.', 'https://x.com/user/status/1', '<button data-testid="tweet-text-show-more-link">Show more</button>').code, 'x-truncated');
  assert.equal(contentFailure('An article that happens to end with the', 'https://fixtures.test'), null);
});

test('real samples automatically preserve RSS and propagate fallback labels through final Markdown', async t => {
  const originalFetch = global.fetch; t.after(() => { global.fetch = originalFetch; });
  for (const a of samples) {
    let requests = 0;
    global.fetch = async () => { requests++; return { ok: true, text: async () => html(a.extracted) }; };
    const source = { title:a.title, source:a.source, link:a.link, origin:a.origin, content:a.rss };
    const enriched = await enrichArticle(source, { selectedTier1:true });
    assert.equal(requests, 1); assert.equal(enriched.content, a.rss);
    if (a.expectedFailure) {
      assert.equal(enriched.fullContent, a.rss);
      assert.equal(enriched.fullContentMeta.failureCode, a.expectedFailure);
      assert.equal(enriched.fullContentMeta.summaryOnly, true);
      assert.match(buildDeepReadPrompt('{{fullContent}}', enriched, 'daily'), /仅基于摘要/);
      const input = { tier1:[{...source, sourceType:'deep-read',summary:'第一句。第二句。第三句。第四句。第五句。', keyPoints:['甲','乙','丙'],risk:'核验限制'}],tier2:[] };
      const fetchData = { topArticles:[enriched],otherTopArticles:[] };
      const summary = ensureSummaryShape(input,fetchData);
      assert.equal(summary.tier1[0].fullContentMeta.failureCode,a.expectedFailure);
      assert.ok(!summary.tier1[0].title.startsWith('【仅基于摘要】'));
      assert.equal(summary.tier1[0].fullContentMeta.summaryOnly,true);
      assert.match(formatMarkdown(normalizeSummaryData(summary)),/仅基于摘要/);
      assert.equal(ensureSummaryShape(summary,fetchData).tier1[0].title, summary.tier1[0].title);
    } else {
      assert.equal(enriched.fullContentMeta.fetchedFrom,'original-web');
      assert.equal(enriched.fullContentMeta.summaryOnly,false);
    }
  }
});

test('old AIHOT successful cache is rechecked without issuing a second request', async t => {
  const a = samples.find(s => s.expectedFailure === 'x-truncated');
  const originalFetch = global.fetch; t.after(() => { global.fetch = originalFetch; });
  global.fetch = async () => { throw new Error('unexpected fetch'); };
  const result = await enrichArticle({ source:a.source,link:a.link,origin:a.origin,content:a.rss,fullContent:a.extracted,
    fullContentMeta:{ fetchedFrom:'original-web',originalUrl:a.url,summaryOnly:false } }, { selectedTier1:true });
  assert.equal(result.fullContentMeta.failureCode,'x-truncated'); assert.equal(result.fullContent,a.rss);
});
