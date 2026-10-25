const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { spawnSync } = require('child_process');
const { parseCliArgs, ensureValue } = require('./cli-utils');
const { enforceTier1Quality, ensureSummaryShape } = require('./summary-utils');
const item = summary => ({ sourceType: 'deep-read', title: 'Test', link: 'https://example.com', summary, keyPoints: ['甲', '乙', '丙'], action: '阅读', risk: '核验' });

test('Chinese, mixed punctuation and quoted sentences preserve valid summaries; decimals and versions are not sentences', () => {
  for (const text of ['第一句。第二句！第三句？第四句。第五句。', '使用 K3.1。支持 v5.2.0。阈值是 3.14。第四句。第五句。', '他说：“第一句。”第二句！Third sentence. Fourth sentence? Fifth sentence.']) {
    assert.equal(enforceTier1Quality([item(text)]).tier1[0].summary, text);
  }
  assert.throws(() => enforceTier1Quality([item('Only K3.1 v5.2.0 and 3.14.')]), /at least 5 sentences/);
  assert.throws(() => enforceTier1Quality([item('一句。')]), /after rebuilding/);
  const rebuilt = enforceTier1Quality([{ ...item('短句。'), keyPoints: ['甲', '乙', '丙', '丁', '戊'] }]);
  assert.equal(rebuilt.tier1[0].summary, '甲。 乙。 丙。 丁。 戊。');
  const shaped = ensureSummaryShape({ tier1: rebuilt.tier1, tier2: [] });
  assert.equal(shaped.tier1[0].sourceType, 'deep-read');
  shaped.tier1[0].summary = '一句。两句。三句。'; shaped.tier1[0].keyPoints = ['甲', '乙', '丙'];
  assert.throws(() => ensureSummaryShape(shaped), /at least 5 sentences/);
});

test('shared CLI accepts both syntaxes and preserves embedded equals; required values reject flags and empty values', () => {
  const args = parseCliArgs(['node', 'cli', '--a=hello=world', '--b', '/tmp/a b', '--flag', '--empty=', '--zero=0', '--off=false']);
  assert.deepEqual(args, { a: 'hello=world', b: '/tmp/a b', flag: true, empty: '', zero: '0', off: 'false' });
  assert.throws(() => ensureValue(args.empty, 'empty'), /Missing/);
  assert.throws(() => ensureValue(args.flag, 'flag'), /Missing/);
});

test('ledger default stays persistent; diagnostics expose missing, loaded, explicit and corrupt histories', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rss-contracts-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const input = path.join(dir, 'input.json'), packet = path.join(dir, 'packet.json'), prompt = path.join(dir, 'prompt.md');
  fs.writeFileSync(input, JSON.stringify({ candidates: [] }));
  const cli = (...args) => spawnSync(process.execPath, [path.join(__dirname, 'editorial-cli.js'), ...args], { encoding: 'utf8', env: { ...process.env, HOME: dir } });
  const prepare = extra => cli('prepare', `--fetchFile=${input}`, '--outFile', packet, `--promptFile=${prompt}`, ...extra);
  let r = prepare([]); assert.equal(r.status, 0, r.stderr);
  let p = JSON.parse(fs.readFileSync(packet));
  assert.equal(p.ledgerDiagnostics.status, 'missing');
  assert.equal(p.ledgerDiagnostics.pathSource, 'default');
  const ledger = path.join(dir, '.local/share/ai-rss-digest/ledger.json');
  assert.equal(p.ledgerDiagnostics.ledgerFile, ledger);
  fs.mkdirSync(path.dirname(ledger), { recursive: true });
  fs.writeFileSync(ledger, JSON.stringify({ schemaVersion: 1, editions: [{ id: 'one', recordedAt: new Date().toISOString(), events: [] }] }));
  r = prepare([]); assert.equal(r.status, 0, r.stderr); p = JSON.parse(fs.readFileSync(packet));
  assert.equal(p.ledgerDiagnostics.editions, 1); assert.equal(p.ledgerDiagnostics.recentEditions, 1);
  r = cli('retrospective', `--ledgerFile=${ledger}`); assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /"pathSource": "explicit"/);
  fs.writeFileSync(ledger, '{broken');
  r = prepare([]); assert.equal(r.status, 1); assert.match(r.stderr, /"status":"invalid"/);
  assert.equal(fs.readFileSync(ledger, 'utf8'), '{broken');
  assert.equal(prepare(['--ledgerFile=']).status, 1);
});

test('failed summary validation leaves the input artifact intact', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rss-invalid-summary-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const input = path.join(dir, 'summary.json'), fetch = path.join(dir, 'fetch.json');
  const original = JSON.stringify({ tier1: [item('一句。')] });
  fs.writeFileSync(input, original); fs.writeFileSync(fetch, '{}');
  const r = spawnSync(process.execPath, [path.join(__dirname, 'validate-summary.js'), `--input=${input}`, `--fetchFile=${fetch}`, `--outFile=${input}`], { encoding: 'utf8' });
  assert.equal(r.status, 1); assert.match(r.stderr, /at least 5 sentences/);
  assert.equal(fs.readFileSync(input, 'utf8'), original);
});
