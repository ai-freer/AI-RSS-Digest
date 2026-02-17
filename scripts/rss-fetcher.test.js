const assert = require('assert');
const {
  parseFeed,
  scoreAndSort,
  selectRankedArticles,
  normalizeLanguageFilter
} = require('./rss-fetcher');

function testParseFeedRss() {
  const xml = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <item>
      <title>RSS item</title>
      <link>https://example.com/rss-item</link>
      <description><![CDATA[<p>Hello RSS</p>]]></description>
      <pubDate>Tue, 17 Feb 2026 09:00:00 GMT</pubDate>
      <guid>rss-1</guid>
    </item>
  </channel>
</rss>`;
  const items = parseFeed(xml);
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].title, 'RSS item');
  assert.strictEqual(items[0].link, 'https://example.com/rss-item');
}

function testParseFeedAtom() {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Atom entry</title>
    <id>atom-1</id>
    <updated>2026-02-17T09:00:00Z</updated>
    <summary>Atom summary</summary>
    <link rel="alternate" href="https://example.com/atom-entry" />
  </entry>
</feed>`;
  const items = parseFeed(xml);
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].title, 'Atom entry');
  assert.strictEqual(items[0].link, 'https://example.com/atom-entry');
}

function testScoreAndSort() {
  const nowIso = new Date().toISOString();
  const oldIso = new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString();
  const ranked = scoreAndSort([
    { title: 'new', source: 'A', weight: 1.0, pubDate: nowIso, content: 'x'.repeat(500), hasValidPubDate: true },
    { title: 'old', source: 'A', weight: 1.0, pubDate: oldIso, content: 'x'.repeat(500), hasValidPubDate: true }
  ]);
  assert.strictEqual(ranked.length, 2);
  assert.strictEqual(ranked[0].title, 'new');
  assert.ok(ranked[0].score >= ranked[1].score);
}

function testSelectRankedArticles() {
  const rows = [
    { title: 'a1', source: 'A' },
    { title: 'a2', source: 'A' },
    { title: 'a3', source: 'A' },
    { title: 'b1', source: 'B' },
    { title: 'c1', source: 'C' }
  ];
  const { selected, quotaSkipped } = selectRankedArticles(rows, 3, 1, 1, false);
  assert.strictEqual(selected.length, 3);
  assert.ok(quotaSkipped >= 1);
  const sourceSet = new Set(selected.map(item => item.source));
  assert.strictEqual(sourceSet.size, 3);
}

function testLanguageFilter() {
  assert.strictEqual(normalizeLanguageFilter('cn'), 'zh');
  assert.strictEqual(normalizeLanguageFilter('GLOBAL'), 'global');
  assert.strictEqual(normalizeLanguageFilter('unknown'), 'all');
}

function run() {
  testParseFeedRss();
  testParseFeedAtom();
  testScoreAndSort();
  testSelectRankedArticles();
  testLanguageFilter();
  console.log('rss fetcher tests passed');
}

run();
