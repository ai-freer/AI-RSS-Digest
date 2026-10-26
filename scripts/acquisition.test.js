const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { parseFeed, extractContent, prepareCandidates } = require('./rss-fetcher');
const { prepare, select, evaluate } = require('./editorial');
const { supplement } = require('./supplement-candidates');
const { enrichArticle } = require('./full-content-fetcher');
const { coverageDiagnostics } = require('./candidate-readiness');
const { articleId } = require('./article-identity');
const policy = require('../editorial-policy.json');
const now = '2026-10-21T12:00:00Z';
const article = (n, extra = {}) => ({ title: `文章${n}`, link: `https://example.com/${n}`, source: 'A', content: '', pubDate: now, hasValidPubDate: true, ...extra });

test('Atom attributes, namespaces, XHTML, entities and alternate links parse in Node', () => {
  const entries = Array.from({ length: 30 }, (_, i) => `<a:entry xml:lang="zh"><a:title>T${i}</a:title><a:link rel="self" href="https://example.com/feed/${i}"/><a:link rel="alternate" href="https://example.com/${i}"/><a:summary type="html">&lt;p&gt;正文 &amp;amp; 方法&lt;/p&gt;</a:summary></a:entry>`).join('');
  const rows = parseFeed(`<a:feed xmlns:a="http://www.w3.org/2005/Atom">${entries}</a:feed>`);
  assert.equal(rows.length, 30);
  assert.ok(rows.every(row => extractContent(row.description) === '正文 & 方法'));
  assert.equal(rows[0].link, 'https://example.com/0');
  const [xhtml] = parseFeed('<feed xmlns="http://www.w3.org/2005/Atom"><entry><summary>短摘要</summary><content type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml"><p>第一段</p><p>第二段</p></div></content></entry></feed>');
  assert.equal(extractContent(xhtml.description), '第一段 第二段');
});

test('RSS attributes, namespaced full content and CDATA work; bad XML is an error', () => {
  const [row] = parseFeed('<rss xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><item data-id="1"><description>短摘要</description><content:encoded><![CDATA[<p>完整正文 &amp; 证据</p><script>bad()</script>]]></content:encoded></item></channel></rss>');
  assert.equal(extractContent(row.description), '完整正文 & 证据');
  assert.throws(() => parseFeed('<feed><entry></feed>'), /Invalid RSS\/Atom XML/);
  assert.throws(() => parseFeed('<html>error</html>'), /Unsupported feed root/);
  assert.deepEqual(parseFeed('<rss><channel/></rss>'), []);
});

test('219 invalid candidates stay accountable without model reviews or fake scores', () => {
  const candidates = prepareCandidates(Array.from({ length: 219 }, (_, i) => article(i, { pubDate: null })), 24);
  const packet = prepare({ candidates }, policy, 'prompt', undefined, now);
  assert.equal(packet.candidateCount, 219);
  assert.equal(packet.candidates.length, 0);
  assert.equal(packet.localDecisions.length, 219);
  const selected = select(packet, { packetId: packet.packetId, reviewer: 'local-prefilter', reviewedAt: now, reviews: [] });
  assert.equal(selected.editorial.decisions.length, 219);
  assert.equal(selected.editorial.counts.pending, 219);
  assert.equal(selected.outcome, 'pending-input');
  assert.ok(selected.editorial.decisions.every(d => d.editorialScore === null && !d.review));
  assert.equal(evaluate([{ id: candidates[0].id || articleId(candidates[0]), label: 'select' }], selected).coverage, 0);
  assert.equal(packet.diagnostics.status, 'low-body-coverage');
});

test('body supplements are bounded, fair across sources and skip AIHOT and undated entries', async () => {
  const candidates = [article(1), article(2), article(3, { source: 'B' }), article(4, { source: 'AIHOT' }), article(5, { link: 'https://aihot.virxact.com/item' }), article(6, { pubDate: null, hasValidPubDate: false }), article(7, { content: '已有正文' })];
  const calls = [];
  const output = await supplement({ candidates }, 2, async a => {
    calls.push(a.link);
    return { ...a, fullContent: '已获取网页正文证据', fullContentMeta: { fetchedFrom: 'web', charCount: 10 } };
  }, now);
  assert.deepEqual(calls, [candidates[0].link, candidates[2].link]);
  assert.equal(output.supplementation.attempted, 2);
  assert.equal(output.supplementation.recovered, 2);
  assert.equal(output.supplementation.deferred, 1);
  assert.equal(output.candidates[3].supplementation.status, 'rss-only');
  assert.equal(output.candidates[4].supplementation.status, 'rss-only');
  assert.equal(output.candidates[5].supplementation, undefined);
  assert.equal(candidates[0].content, '');
  assert.equal(articleId(output.candidates[0]), articleId(candidates[0]));
  const packet = prepare(output, policy, 'prompt', undefined, now);
  assert.equal(packet.candidates.length + packet.localDecisions.length, 7);
  assert.equal(packet.candidates.length, 3);
  assert.equal((await enrichArticle(packet.candidates[0])).fullContent, '已获取网页正文证据');
});

test('failed fetch, zero budget and invalid budget are explicit and do not lose candidates', async () => {
  const input = { candidates: [article(1), article(2)] };
  const output = await supplement(input, 1, async () => { throw new Error('timeout'); }, now);
  assert.equal(output.supplementation.failed, 1);
  assert.equal(output.supplementation.deferred, 1);
  assert.equal(output.candidates.length, 2);
  const zero = await supplement(input, 0, () => assert.fail('must not fetch'), now);
  assert.equal(zero.supplementation.attempted, 0);
  await assert.rejects(supplement(input, -1), /bodyBudget/);
  await assert.rejects(supplement(input, 1.5), /bodyBudget/);
  assert.equal(coverageDiagnostics([]).status, 'no-candidates');
  assert.equal(coverageDiagnostics([article(1, { content: '短正文' })]).bodyCoverage, 1);
});

test('CLI omits local rows from prompt, permits local-only selection and supports offline supplement', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rss-acquisition-'));
  const file = name => path.join(dir, name);
  function cli(...args) {
    const result = spawnSync(process.execPath, [path.join(__dirname, 'editorial-cli.js'), ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
  try {
    fs.writeFileSync(file('raw.json'), JSON.stringify({ candidates: [article(1, { title: 'LOCAL_ONLY_MARKER', hasValidPubDate: false })] }));
    cli('supplement', '--fetchFile', file('raw.json'), '--bodyBudget', '0', '--outFile', file('ready.json'));
    cli('prepare', '--fetchFile', file('ready.json'), '--ledgerFile', file('history.json'), '--outFile', file('packet.json'), '--promptFile', file('prompt.md'));
    assert.ok(!fs.readFileSync(file('prompt.md'), 'utf8').includes('LOCAL_ONLY_MARKER'));
    assert.ok(fs.readFileSync(file('packet.json'), 'utf8').includes('LOCAL_ONLY_MARKER'));
    cli('select', '--packetFile', file('packet.json'), '--outFile', file('selected.json'));
    const selected = JSON.parse(fs.readFileSync(file('selected.json')));
    assert.equal(selected.editorial.counts.pending, 1);
    assert.match(selected.editorial.reviewer, /no Agent review/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('disabled Paul Graham stays auditable and never fetches in daily or health mode', async () => {
  const { main, buildFeedList, BASE_RSS_FEEDS, RSS_FEEDS } = require('./rss-fetcher');
  const pg = BASE_RSS_FEEDS.find(f => f.name === 'paulgraham.com');
  assert.equal(pg.enabled, false);
  assert.match(pg.disabledReason, /219/);
  assert.ok(buildFeedList({ includeDisabled: true }).includes(pg));
  for (const feeds of [RSS_FEEDS, buildFeedList({ includeCN: false }), buildFeedList({ cnTier: 'ALL' })]) {
    assert.ok(!feeds.includes(pg));
  }
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async url => {
    calls.push(url);
    return { ok: true, text: async () => '<rss><channel/></rss>' };
  };
  try {
    for (const healthCheck of [false, true]) {
      const { result } = await main({ params: { tagFilter: 'YC', healthCheck, includePaulGraham: false } });
      assert.deepEqual(result.skippedFeeds, [{ feed: pg.name, url: pg.url, reason: pg.disabledReason }]);
      assert.equal(result.stats.disabledFeeds, 1);
    }
    assert.ok(!calls.includes(pg.url));
    const { result } = await main({ params: { languageFilter: 'zh', healthCheck: true } });
    assert.equal(result.stats.disabledFeeds, 0);
    assert.deepEqual(result.skippedFeeds, []);
    assert.ok(calls.length > 0, 'active feeds still fetch');
  } finally {
    global.fetch = originalFetch;
  }
});

test('RSS timeout remains active after headers until response body is read', async t => {
  const { fetchFeedOnce } = require('./rss-fetcher');
  const original = global.fetch;
  t.after(() => {global.fetch=original;});
  global.fetch = async (_url,{signal}) => ({ok:true,text:() => new Promise((resolve,reject) => {
    const safety = setTimeout(()=>resolve('<rss><channel/></rss>'),500);
    signal.addEventListener('abort',()=>{clearTimeout(safety);reject(new Error('body read aborted'));},{once:true});
  })});
  const result = await fetchFeedOnce({name:'slow-body',url:'https://example.com/feed'},20);
  assert.equal(result.success,false);
  assert.match(result.error,/body read aborted/);
  global.fetch = async () => ({ok:true,text:async()=>'<rss><channel/></rss>'});
  assert.equal((await fetchFeedOnce({name:'fast',url:'https://example.com/feed'},100)).success,true);
});
