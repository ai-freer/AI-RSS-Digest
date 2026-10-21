const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { collect, indexLinks, INDEX_URL } = require('./paul-graham');
const { main } = require('./rss-fetcher');
const { prepare, select } = require('./editorial');
const { enrichArticle } = require('./full-content-fetcher');
const { buildDeepReadPrompt, buildPromptArticles, ensureSummaryShape } = require('./summary-utils');
const policy = require('../editorial-policy.json');
const now = new Date().toISOString();
const index = names => `<table>${names.map(n => `<tr valign="top"><td width="435"><font><a href="${n}.html">${n}</a></font></td></tr>`).join('')}</table>`;
const body = `<html><head><title>A useful essay</title></head><body><article><h1>A useful essay</h1><p>September 2026</p>${'<p>Useful evidence about startups and building better products. Concrete examples and arguments for founders.</p>'.repeat(20)}</article></body></html>`;
function temp(t) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-test-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return path.join(dir, 'state.json'); }

test('first baseline fetches only index; new bodies are bounded, cached, and retried without losing discovery time', async t => {
  const stateFile = temp(t), calls = [];
  let names = ['old'], fail = true;
  const fetchHtml = async url => { calls.push(url); if (url === INDEX_URL) return index(names); if (url.endsWith('/new.html') && fail) throw new Error('temporary'); return body; };
  const first = await collect({ stateFile, now, fetchHtml });
  assert.equal(first.status, 'baseline-created'); assert.equal(first.articles.length, 0); assert.deepEqual(calls, [INDEX_URL]);
  names = ['new', 'second', 'old'];
  const failed = await collect({ stateFile, now, fetchHtml, budget: 1 });
  assert.equal(failed.pending, 2); assert.equal(failed.errors.length, 1);
  const second = await collect({ stateFile, now, fetchHtml, budget: 1 });
  assert.equal(second.articles.length, 1); assert.match(second.articles[0].link, /second/);
  fail = false;
  const recovered = await collect({ stateFile, now, fetchHtml });
  assert.equal(recovered.pending, 0); assert.equal(recovered.articles.length, 2);
  assert.equal(recovered.articles[1].discoveredAt, now);
  assert.equal(recovered.articles[1].pubDate, null);
  assert.equal(recovered.articles[1].publicationDateText, 'September 2026');
  const count = calls.length;
  const cached = await collect({ stateFile, now, fetchHtml });
  assert.equal(calls.length, count + 1); assert.equal(cached.articles.length, 2);
  const later = await collect({ stateFile, now: new Date(Date.parse(now) + 2 * 86400000).toISOString(), fetchHtml });
  assert.equal(later.articles.length, 0);
});

test('broken index, corrupt state and concurrent lock never reset baseline', async t => {
  const stateFile = temp(t);
  await collect({ stateFile, now, fetchHtml: async () => index(['old', 'two', 'three']) });
  const previous = fs.readFileSync(stateFile, 'utf8');
  await assert.rejects(collect({ stateFile, fetchHtml: async () => '<html>error page</html>' }), /structure/);
  await assert.rejects(collect({ stateFile, fetchHtml: async () => index(['old']) }), /shrank/);
  assert.equal(fs.readFileSync(stateFile, 'utf8'), previous);
  fs.writeFileSync(`${stateFile}.lock`, '');
  await assert.rejects(collect({ stateFile }), /EEXIST/);
  fs.unlinkSync(`${stateFile}.lock`); fs.writeFileSync(stateFile, '{}');
  await assert.rejects(collect({ stateFile }), /Invalid Paul Graham state/);
  assert.equal(fs.readFileSync(stateFile, 'utf8'), '{}');
  assert.throws(() => indexLinks(index(['https://evil.test/x'])), /structure/);
});

test('daily collection through review and summary preserves discovery semantics and reuses body', async t => {
  const stateFile = temp(t);
  const originalFetch = global.fetch;
  let names = ['old']; const calls = [];
  global.fetch = async url => { calls.push(url); return { ok: true, url, text: async () => url === INDEX_URL ? index(names) : body }; };
  t.after(() => { global.fetch = originalFetch; });
  const params = { tagFilter: 'YC', paulGrahamStateFile: stateFile };
  assert.equal((await main({ params })).result.candidates.length, 0);
  names = ['new', 'old'];
  const fetched = (await main({ params })).result;
  assert.equal(fetched.candidates.length, 1); assert.equal(fetched.paulGraham.newLinks, 1);
  assert.ok(!calls.some(url => url.includes('aaronsw')));
  const article = fetched.candidates[0];
  const p = prepare(fetched, policy, 'test');
  assert.equal(p.candidates.length, 1); assert.equal(p.localDecisions.length, 0);
  const review = { packetId: p.packetId, reviewer: 'test fixture', reviewedAt: new Date().toISOString(), reviews: [{
    id: p.candidates[0].id, relevance: 'pass', material: 'sufficient', type: 'analysis',
    scores: { significance: 4, novelty: 4, evidence: 4, relevance: 4, utility: 4 }, cap: 'none', reason: 'useful argument',
    evidence: ['Useful evidence'], eventId: 'pg-new', storyId: 'pg-new', eventSummary: 'An essay', novelty: 'new', provenance: 'unknown'
  }] };
  const selected = select(p, review);
  assert.equal(selected.topArticles.length, 1); assert.equal(selected.topArticles[0].pubDate, null);
  assert.throws(() => select(p, { ...review, reviews: [{ ...review.reviews[0], type: 'release' }] }), /never daily news/);
  const count = calls.length;
  const enriched = await enrichArticle(selected.topArticles[0]); assert.equal(calls.length, count); assert.ok(enriched.fullContent.length);
  assert.match(buildDeepReadPrompt('{{fullContent}}', enriched, 'daily'), /新发现长文/);
  assert.match(buildPromptArticles(selected)[0].timeNote, /不等于发表时间/);
  const normalized = ensureSummaryShape({ tier1: [{ title: 'An essay', link: article.link, source: article.source, summary: 'A'.repeat(200) }], tier2: [] }, selected);
  assert.match(normalized.tier1[0].title, /新发现长文/);
  for (const extra of [{ source: 'other' }, { acquisitionKind: null }, { acquiredAt: '2099-01-01' }]) {
    assert.equal(prepare({ candidates: [{ ...article, ...extra }] }, policy, 'test').candidates.length, 0);
  }
  const oldCalls = calls.length;
  await main({ params: { ...params, includePaulGraham: false } });
  await main({ params: { ...params, healthCheck: true } });
  assert.equal(calls.length, oldCalls);
});
