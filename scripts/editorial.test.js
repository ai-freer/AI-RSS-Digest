const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { prepare, select, recordEdition, evaluate, EMPTY_LEDGER } = require('./editorial');
const { canonicalUrl, fingerprint } = require('./article-identity');
const { prepareCandidates } = require('./rss-fetcher');
const { main: deepRead } = require('./prepare-deep-read');
const policy = require('../editorial-policy.json');
const now = '2026-10-14T10:00:00.000Z';

function article(n, extra = {}) {
  return { title: `文章${n}`, link: `https://source-${extra.source || n}.example/?id=${n}`, source: `来源${n}`, content: '我们发布了可复现的方法。测试代码和条件如下。新测试证实内存降低一半。', pubDate: now, hasValidPubDate: true, ...extra };
}
function packet(articles = [article(1)], ledger = EMPTY_LEDGER, customPolicy = policy) {
  return prepare({ candidates: articles }, customPolicy, 'editorial prompt', ledger, now);
}
function reviews(p, overrides = []) {
  return { packetId: p.packetId, reviewer: 'test fixture (not model evaluation)', reviewedAt: now, reviews: p.candidates.map((a, i) => ({
    id: a.id, relevance: 'pass', material: 'sufficient', type: 'tutorial',
    scores: { significance: 4, novelty: 4, evidence: 4, relevance: 4, utility: 4 },
    cap: 'none', reason: '有可复现方法', evidence: ['测试代码和条件如下'],
    eventId: `event-${i}`, storyId: `story-${i}`, eventSummary: '发布方法', novelty: 'new', provenance: 'secondary', ...overrides[i]
  })) };
}
function summary(s) {
  return { tier1: s.topArticles.map(a => ({ link: a.link })), tier2: s.otherTopArticles.map(a => ({ link: a.link })), metadata: { qualityGates: { applied: true } } };
}

test('identity preserves article query IDs, meaningful fragments and Chinese', () => {
  assert.notEqual(canonicalUrl('https://a.test/?id=1'), canonicalUrl('https://a.test/?id=2'));
  assert.equal(canonicalUrl('https://a.test/?utm_source=r&id=1'), 'https://a.test/?id=1');
  assert.notEqual(canonicalUrl('https://a.test/log#v1'), canonicalUrl('https://a.test/log#v2'));
  assert.notEqual(fingerprint('中文模型发布'), fingerprint('中文工具更新'));
  const rows = prepareCandidates([article(1, { pubDate: null }), article(2, { pubDate: null })]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].pubDate, null);
  assert.equal(rows[0].hasValidPubDate, false);
});

test('review scores replace length and source reputation proxies', () => {
  const p = packet([article(1, { score: 99, weight: 2, sourceTier: 'A' }), article(2, { content: '测试代码和条件如下' })]);
  assert.equal(p.candidates[0].score, undefined);
  assert.equal(p.candidates[0].sourceTier, undefined);
  const s = select(p, reviews(p));
  assert.equal(s.topArticles.length, 2);
  assert.equal(s.topArticles[0].editorialScore, 80);
});

test('partial, duplicate, stale and invented reviews fail closed', () => {
  const p = packet([article(1), article(2)]);
  const r = reviews(p);
  assert.throws(() => select(p, { ...r, reviews: r.reviews.slice(0, 1) }), /every candidate/);
  assert.throws(() => select(p, { ...r, reviews: [r.reviews[0], r.reviews[0]] }), /Duplicate/);
  assert.throws(() => select(p, { ...r, packetId: 'old' }), /different packet/);
  assert.throws(() => select({ ...p, date: 'changed' }, r), /Packet changed/);
  assert.throws(() => select(p, reviews(p, [{ evidence: ['不存在的证据'] }])), /Evidence/);
  assert.throws(() => select(p, reviews(p, [{ scores: { significance: '5' } }])), /integers/);
});

test('unknown body, undated and future items remain pending; promotion is capped', () => {
  const p = packet([article(1, { content: '' }), article(2, { pubDate: null, hasValidPubDate: false }), article(3), article(4, { pubDate: '2026-10-15T00:00:00Z' })]);
  assert.equal(p.candidates.length, 1);
  assert.equal(p.localDecisions.length, 3);
  const s = select(p, reviews(p, [{ cap: 'promotion' }]));
  assert.equal(s.editorial.counts.pending, 3);
  assert.equal(s.editorial.counts.rejected, 1);
  assert.equal(s.topArticles.length, 0);
});

test('same occurrence has one representative, preferring evidenced primary', () => {
  const p = packet([article(1), article(2)]);
  const s = select(p, reviews(p, [{}, { eventId: 'event-0', storyId: 'story-0', provenance: 'primary', provenanceEvidence: '我们发布了可复现的方法' }]));
  assert.equal(s.topArticles.length, 1);
  assert.equal(s.topArticles[0].link, article(2).link);
  assert.equal(s.editorial.counts.suppressed, 1);
});

test('same company different occurrence stays separate; roundup cannot bridge', () => {
  const p = packet([article(1), article(2), article(3)]);
  const s = select(p, reviews(p, [{ storyId: 'same-story' }, { storyId: 'same-story' }, { novelty: 'roundup' }]));
  assert.equal(s.topArticles.length, 2);
});

test('source cap and edition capacity do not refill with rejected items', () => {
  const p = packet([article(1, { source: 'A' }), article(2, { source: 'A' }), article(3)], EMPTY_LEDGER, { ...policy, maxPerSource: 1, topN: 1, otherTopN: 1 });
  const s = select(p, reviews(p));
  assert.equal(s.topArticles.length, 1);
  assert.equal(s.otherTopArticles.length, 1);
  assert.equal(s.editorial.counts.deferred, 1);
});

test('history suppresses repeats and reused URLs but admits evidenced updates', () => {
  const p = packet();
  const s = select(p, reviews(p));
  const ledger = recordEdition(EMPTY_LEDGER, s, summary(s), now);
  const next = packet([article(1), article(2), article(3)], ledger);
  const out = select(next, reviews(next, [{}, { eventId: 'update-1', storyId: 'story-0', novelty: 'update', previousEventId: 'event-0', newInformation: '新的独立实测降低内存', noveltyEvidence: '新测试证实内存降低一半' }, { eventId: 'event-0', storyId: 'story-0' }]));
  assert.equal(out.topArticles.length, 1);
  assert.equal(out.topArticles[0].link, article(2).link);
  assert.equal(out.editorial.counts.suppressed, 2);
  assert.throws(() => select(next, reviews(next, [{}, { storyId: 'story-0' }])), /Known story/);
  assert.throws(() => select(next, reviews(next, [{}, { novelty: 'update', previousEventId: 'not-real' }])), /recorded event/);
});

test('history window expires by real elapsed time, not arbitrary file count', () => {
  const s = select(packet(), reviews(packet()));
  const ledger = recordEdition(EMPTY_LEDGER, s, summary(s), '2026-10-01T10:00:00Z');
  assert.equal(packet([article(1)], ledger).history.length, 0);
});

test('record is idempotent; rejects wrong tiers, unvalidated output and concurrent history changes', () => {
  const p = packet(); const s = select(p, reviews(p)); const out = summary(s);
  const ledger = recordEdition(EMPTY_LEDGER, s, out, now);
  assert.equal(recordEdition(ledger, s, out, now), ledger);
  assert.throws(() => recordEdition(EMPTY_LEDGER, s, { ...out, tier1: [] }, now), /preserve/);
  assert.throws(() => recordEdition(EMPTY_LEDGER, s, { ...out, metadata: {} }, now), /Validate/);
  const p2 = packet([article(2)]); const s2 = select(p2, reviews(p2));
  assert.throws(() => recordEdition(ledger, s2, summary(s2), now), /History changed/);
  assert.throws(() => recordEdition(ledger, s, { ...out, extra: true }, now), /different summary/);
});

test('evaluation reports unresolved cases in coverage and full denominator accuracy', () => {
  const p = packet(); const s = select(p, reviews(p));
  const result = evaluate([{ id: p.candidates[0].id, label: 'select' }, { id: 'missing', label: 'select' }, { id: 'ambiguous', label: 'either' }], s);
  assert.equal(result.precision, 1);
  assert.equal(result.coverage, 0.5);
  assert.equal(result.fullDenominatorAccuracy, 0.5);
  assert.equal(result.failures, 1);
  assert.throws(() => evaluate([{ id: 'x', label: 'select' }, { id: 'x', label: 'reject' }], s), /Duplicate/);
});

test('v4 raw fetch cannot bypass editorial gate for deep reading', () => {
  assert.throws(() => deepRead({ params: { fetchData: { editorialStatus: 'unreviewed' } } }), /editorial/);
});

test('CLI prepare/select/record/evaluate/retrospective runs offline', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-rss-editorial-'));
  const file = name => path.join(dir, name);
  const write = (name, value) => fs.writeFileSync(file(name), JSON.stringify(value));
  const cli = (...args) => {
    const result = spawnSync(process.execPath, [path.join(__dirname, 'editorial-cli.js'), ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  try {
    write('fetch.json', { candidates: [article(1, { pubDate: '2020-01-01T00:00:00Z' })] });
    cli('prepare', '--fetchFile', file('fetch.json'), '--ledgerFile', file('ledger.json'), '--outFile', file('packet.json'), '--promptFile', file('prompt.md'));
    const p = JSON.parse(fs.readFileSync(file('packet.json'))); write('review.json', reviews(p));
    cli('select', '--packetFile', file('packet.json'), '--reviewFile', file('review.json'), '--outFile', file('selection.json'));
    const s = JSON.parse(fs.readFileSync(file('selection.json'))); write('summary.json', summary(s));
    fs.writeFileSync(file('output.md'), '# Offline fixture');
    cli('record', '--selectionFile', file('selection.json'), '--summaryFile', file('summary.json'), '--outputFile', file('output.md'), '--ledgerFile', file('ledger.json'));
    write('gold.json', [{ id: p.candidates[0].id, label: 'select' }]);
    cli('evaluate', '--selectionFile', file('selection.json'), '--goldFile', file('gold.json'), '--outFile', file('metrics.json'));
    cli('retrospective', '--ledgerFile', file('ledger.json'), '--outFile', file('retrospective.md'));
    assert.match(fs.readFileSync(file('retrospective.md'), 'utf8'), /周期复盘/);
    const bad = spawnSync(process.execPath, [path.join(__dirname, 'editorial-cli.js'), 'prepare', '--typo', 'x']);
    assert.equal(bad.status, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('AIHOT six distinct publishers can occupy six Tier1 slots', () => {
  const rows = Array.from({ length: 6 }, (_, i) => article(i, { source: 'AIHOT', origin: { url: `https://publisher-${i}.example/news`, evidence: 'rss-read-original-link' } }));
  const p = packet(rows);
  const s = select(p, reviews(p));
  assert.equal(s.topArticles.length, 6);
  assert.ok(s.topArticles.every(a => a.sourceQuota.basis === 'original-publisher'));
});

test('aggregated and direct articles from one publisher share a quota', () => {
  const rows = Array.from({ length: 5 }, (_, i) => article(i, i < 4
    ? { source: 'AIHOT', origin: { url: `https://www.publisher.example/${i}`, evidence: 'rss-read-original-link' } }
    : { source: 'Publisher direct', link: `https://publisher.example/${i}` }));
  const p = packet(rows); const s = select(p, reviews(p));
  assert.equal(s.topArticles.length, 3);
  assert.equal(s.editorial.counts.deferred, 2);
  assert.ok(s.editorial.decisions.filter(d => d.status === 'deferred').every(d => d.reason === 'source-quota'));
});

test('unknown aggregate publishers have a bounded configurable quota and still dedupe events', () => {
  const rows = Array.from({ length: 8 }, (_, i) => article(i, { source: 'AIHOT' }));
  const p = packet(rows); const s = select(p, reviews(p));
  assert.equal(s.topArticles.length, 6);
  assert.equal(s.editorial.counts.deferred, 2);
  const r = reviews(p); r.reviews.forEach(row => { row.eventId = 'one-event'; row.storyId = 'one-story'; });
  assert.equal(select(p, r).topArticles.length, 1);
  const oldPolicy = { ...policy }; delete oldPolicy.aggregatorSources;
  const old = packet(rows, EMPTY_LEDGER, oldPolicy);
  assert.equal(select(old, reviews(old)).topArticles.length, 3);
});

test('origin extraction uses only one explicit RSS original link; social quotas are by account', () => {
  const { extractOrigin, publisherKey, quotaIdentity } = require('./source-quota');
  const html = '<a href="https://incidental.example/">提及</a><a href="https://x.com/TeamAI/status/123">阅读原文</a>';
  const origin = extractOrigin('AIHOT', html);
  assert.equal(origin.url, 'https://x.com/TeamAI/status/123');
  assert.equal(publisherKey(origin.url), publisherKey('https://twitter.com/teamai/status/456'));
  assert.notEqual(publisherKey(origin.url), publisherKey('https://x.com/another/status/456'));
  assert.equal(extractOrigin('Other', html), null);
  assert.equal(extractOrigin('AIHOT', '<a href="https://incidental.example">提及</a>'), null);
  assert.equal(extractOrigin('AIHOT', html + '<a href="https://other.example/">阅读原文</a>'), null);
  assert.equal(extractOrigin('AIHOT', '<a href="https://aihot.news/item">阅读原文</a>'), null);
  assert.equal(quotaIdentity({ source: 'AIHOT', origin: { url: 'https://x.com/i/status/123', evidence: 'rss-read-original-link' } }, policy).limit, 6);
});
