const { test } = require('node:test');
const assert = require('node:assert/strict');
const { main, enrichArticle } = require('./full-content-fetcher');
const { buildDeepReadPrompt, ensureSummaryShape } = require('./summary-utils');
const { main: assemble } = require('./assemble-summary');
const base = { source: 'AIHOT', title: '报道', link: 'https://aihot.news/items/test', content: 'RSS 摘要', origin: { url: 'https://publisher.example/article', evidence: 'rss-read-original-link' } };
const html = `<html><head><title>Original</title></head><body><article><h1>Original</h1>${'<p>Original article evidence and detailed examples about a new model and its limitations.</p>'.repeat(20)}</article></body></html>`;
const summary = '第一句。第二句。第三句。第四句。第五句。';

test('only reviewed Tier1 requests explicit original once; cache and Tier2 never fetch', async t => {
  const previous = global.fetch, calls = [];
  global.fetch = async (url, options) => { calls.push({ url, options }); return { ok: true, text: async () => html }; };
  t.after(() => { global.fetch = previous; });
  await enrichArticle(base); assert.equal(calls.length, 0);
  await assert.rejects(main({ params: { fetchData: { editorialStatus: 'unreviewed', topArticles: [base] } } }), /reviewed/);
  const data = { editorialStatus: 'reviewed', topArticles: [base], otherTopArticles: [{ ...base, link: 'https://aihot.news/items/tier2' }] };
  const { result } = await main({ params: { fetchData: data } });
  assert.equal(calls.length, 1); assert.equal(calls[0].url, base.origin.url); assert.equal(calls[0].options.redirect, 'error');
  assert.equal(result.otherTopArticles, data.otherTopArticles);
  assert.equal(result.topArticles[0].content, base.content);
  assert.equal(result.topArticles[0].link, base.link);
  assert.equal(result.topArticles[0].fullContentMeta.fetchedFrom, 'original-web');
  assert.equal(result.metadata.fullContent.fetchedFromOriginal, 1);
  await main({ params: { fetchData: result } }); assert.equal(calls.length, 1);
  const prompt = buildDeepReadPrompt('{{fullContent}}', result.topArticles[0], 'daily');
  assert.match(prompt, /Original article evidence/); assert.match(prompt, /返回评审复核/); assert.match(prompt, /publisher.example/);
  const assembled = assemble({ params: { fetchData: result, deepReadData: [{ ...base, summary, keyPoints: ['甲', '乙', '丙'] }], tier2Data: {} } }).result;
  assert.equal(assembled.tier1[0].fullContentMeta.originalUrl, base.origin.url);
  assert.ok(!assembled.tier1[0].title.includes('仅基于摘要'));
});

test('missing/ambiguous/non-web/AIHOT origins never fetch and receive visible fallback labels', async t => {
  const previous = global.fetch; let calls = 0;
  global.fetch = async () => { calls++; throw new Error('must not fetch'); };
  t.after(() => { global.fetch = previous; });
  for (const origin of [null, { url: base.origin.url }, { evidence: 'rss-read-original-link', url: 'file:///etc/hosts' }, { evidence: 'rss-read-original-link', url: 'https://www.aihot.news/item' }, { evidence: 'rss-read-original-link', url: 'https://aihot.virxact.com/item' }]) {
    const article = await enrichArticle({ ...base, origin }, { selectedTier1: true });
    assert.equal(article.fullContent, base.content); assert.equal(article.fullContentMeta.summaryOnly, true);
    assert.match(buildDeepReadPrompt('{{fullContent}}', article, 'daily'), /仅基于摘要/);
    const fetchData = { topArticles: [article], otherTopArticles: [] };
    const normalized = ensureSummaryShape({ tier1: [{ ...base, summary, keyPoints: ['甲','乙','丙'], sourceType: 'deep-read' }], tier2: [] }, fetchData);
    assert.ok(!normalized.tier1[0].title.startsWith('【仅基于摘要】')); assert.equal(normalized.tier1[0].fullContentMeta.summaryOnly,true);
    const again = ensureSummaryShape(normalized, fetchData);
    assert.equal(again.tier1[0].title, normalized.tier1[0].title);
  }
  assert.equal(calls, 0);
});

test('HTTP error, timeout, redirect and empty extraction fall back without a second request', async t => {
  const previous = global.fetch; t.after(() => { global.fetch = previous; });
  for (const mode of ['http', 'timeout', 'redirect', 'empty']) {
    let calls = 0;
    global.fetch = async () => {
      calls++;
      if (mode === 'timeout' || mode === 'redirect') throw new Error(mode);
      return { ok: mode !== 'http', status: 403, text: async () => '<html><body></body></html>' };
    };
    const article = await enrichArticle(base, { selectedTier1: true });
    assert.equal(calls, 1); assert.equal(article.fullContent, base.content);
    assert.equal(article.fullContentMeta.fetchedFrom, 'rss-fallback'); assert.ok(article.fullContentMeta.error);
    await enrichArticle(article, { selectedTier1: true }); assert.equal(calls, 1);
  }
});

test('environment host skips issue no requests, preserve RSS and can be removed', async t => {
  const previous = global.fetch, env = process.env.AI_RSS_SKIP_ORIGIN_HOSTS;
  let calls = 0;
  global.fetch = async () => { calls++; return { ok: true, text: async () => html }; };
  t.after(() => { global.fetch = previous; if (env === undefined) delete process.env.AI_RSS_SKIP_ORIGIN_HOSTS; else process.env.AI_RSS_SKIP_ORIGIN_HOSTS = env; });
  process.env.AI_RSS_SKIP_ORIGIN_HOSTS = ' X.COM, twitter.com, marktechpost.com ';
  const articles = ['https://x.com/a/status/1','https://twitter.com/a/status/1','https://www.marktechpost.com/article'].map(url => ({ ...base, origin: { ...base.origin, url } }));
  const { result } = await main({ params: { fetchData: { editorialStatus:'reviewed', topArticles:articles } } });
  assert.equal(calls,0); assert.equal(result.metadata.fullContent.skippedRequests,3);
  for (const a of result.topArticles) {
    assert.equal(a.fullContent,base.content); assert.equal(a.fullContentMeta.failureCode,'origin-host-skipped');
    assert.equal(a.fullContentMeta.summaryOnly,true);
    assert.match(buildDeepReadPrompt('{{fullContent}}',a,'daily'),/仅基于摘要/);
  }
  const ordinary = await enrichArticle({ source:'Other',link:'https://x.com/test',content:'RSS' });
  assert.equal(ordinary.fullContentMeta.requestStatus,'skipped'); assert.equal(calls,0);
  await enrichArticle({ ...base, origin:{ ...base.origin,url:'https://notx.com/article' } },{selectedTier1:true});
  assert.equal(calls,1);
  delete process.env.AI_RSS_SKIP_ORIGIN_HOSTS;
  const restored = await enrichArticle(result.topArticles[0],{selectedTier1:true});
  assert.equal(calls,2); assert.equal(restored.fullContentMeta.fetchedFrom,'original-web');
});

test('only known string business codes survive error normalization', async t => {
  const previous = global.fetch; t.after(() => { global.fetch = previous; });
  for (const code of [20, {}, '', 'ETIMEDOUT', undefined, 'challenge-page', 'x-truncated']) {
    global.fetch = async () => { throw { code, message:'test failure' }; };
    const known = ['challenge-page','x-truncated'].includes(code);
    const a = await enrichArticle(base,{selectedTier1:true});
    const b = await enrichArticle({source:'Other',link:'https://publisher.example/a',content:'RSS'});
    assert.equal(a.fullContentMeta.failureCode,known ? code : 'original-fetch-failed');
    assert.equal(b.fullContentMeta.failureCode,known ? code : 'web-fetch-failed');
  }
  global.fetch = async () => { throw null; };
  assert.equal((await enrichArticle(base,{selectedTier1:true})).fullContentMeta.failureCode,'original-fetch-failed');
});
