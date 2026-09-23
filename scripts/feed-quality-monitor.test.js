const assert = require('assert');
const {
  classifyFailure,
  looksLikeFeed,
  extractFeedCandidatesFromHtml,
  candidateFeedUrlsFromOrigins,
  parseArgs
} = require('./feed-quality-monitor');

function testClassifyFailure() {
  assert.strictEqual(classifyFailure('HTTP 429 too many requests'), 'rate_limited');
  assert.strictEqual(classifyFailure('aborted by timeout'), 'timeout_or_slow');
  assert.strictEqual(classifyFailure('HTTP 403 forbidden'), 'auth_or_blocked');
}

function testLooksLikeFeed() {
  assert.strictEqual(looksLikeFeed('application/rss+xml', ''), true);
  assert.strictEqual(looksLikeFeed('text/plain', '<feed><entry></entry></feed>'), true);
  assert.strictEqual(looksLikeFeed('text/html', '<html></html>'), false);
}

function testExtractFeedCandidatesFromHtml() {
  const html = `
  <html><head>
    <link rel="alternate" type="application/rss+xml" href="/feed.xml">
  </head><body>
    <a href="/atom.xml">Atom</a>
  </body></html>`;
  const results = extractFeedCandidatesFromHtml(html, 'https://example.com/blog/');
  assert.ok(results.includes('https://example.com/feed.xml'));
  assert.ok(results.includes('https://example.com/atom.xml'));
}

function testCandidateFeedUrlsFromOrigins() {
  const urls = candidateFeedUrlsFromOrigins(['https://example.com']);
  assert.ok(urls.includes('https://example.com/feed.xml'));
  assert.ok(urls.includes('https://example.com/rss.xml'));
}

function testParseArgs() {
  assert.strictEqual(parseArgs([]).includeCN, true);
  const args = parseArgs([
    '--include-cn',
    '--cn-tier=B',
    '--timeout-ms=3000',
    '--concurrency=2'
  ]);
  assert.strictEqual(args.includeCN, true);
  assert.strictEqual(args.cnTier, 'B');
  assert.strictEqual(args.timeoutMs, 3000);
  assert.strictEqual(args.concurrency, 2);
  assert.strictEqual(parseArgs(['--exclude-cn']).includeCN, false);
}

function run() {
  testClassifyFailure();
  testLooksLikeFeed();
  testExtractFeedCandidatesFromHtml();
  testCandidateFeedUrlsFromOrigins();
  testParseArgs();
  console.log('feed quality monitor tests passed');
}

run();
