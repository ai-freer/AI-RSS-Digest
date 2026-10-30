const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { spawnSync } = require('child_process');
const { parseCliArgs, ensureValue } = require('./cli-utils');
const { enforceTier1Quality, ensureSummaryShape } = require('./summary-utils');
const item = summary => ({ sourceType: 'deep-read', title: 'Test', link: 'https://fixtures.test', summary, keyPoints: ['甲', '乙', '丙'], action: '阅读', risk: '核验' });

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

test('seven reviewed Tier1 items never spill into Tier2 fallback; warnings survive validation', () => {
  const top = Array.from({length:7}, (_,i) => ({...item('第一句。第二句。第三句。第四句。第五句。'),link:`https://fixtures.test/${i}`}));
  const other = {title:'Other',link:'https://fixtures.test/other',content:'足够长的速览内容用于展示明确的信息与依据。'};
  const data = {tier1:top,tier2:[],metadata:{qualityGates:{warnings:['earlier repair','earlier repair',42]}}};
  const fetchData = {editorialStatus:'reviewed',topArticles:top,otherTopArticles:[other]};
  const first = ensureSummaryShape(data,fetchData);
  assert.deepEqual(first.tier1.map(a=>a.link),top.map(a=>a.link));
  assert.deepEqual(first.tier2.map(a=>a.link),[other.link]);
  const second = ensureSummaryShape(first,fetchData);
  assert.deepEqual(second.metadata.qualityGates.warnings,first.metadata.qualityGates.warnings);
  assert.equal(second.metadata.qualityGates.warnings.filter(w=>w==='earlier repair').length,1);
  assert.deepEqual(ensureSummaryShape(data,{...fetchData,otherTopArticles:[]}).tier2,[]);
  assert.throws(()=>ensureSummaryShape({tier1:[],tier2:[]},fetchData),/Tier1 summaries are missing/);
  const legacy = ensureSummaryShape(data,{topArticles:top,otherTopArticles:[top[6],other]});
  assert.deepEqual(legacy.tier2.map(a=>a.link),[other.link]);
});

test('complete Unicode text and summary-only metadata survive JSON; display badges are idempotent', () => {
  const {excerpt} = require('./content-contract');
  const {formatJson,formatMarkdown,formatHtml} = require('./output-formatter');
  const text='第一句。第二句。第三句。第四句。第五句。'+'👨‍👩‍👧‍👦👍🏽e\u0301'.repeat(150);
  assert.equal(excerpt('a👨‍👩‍👧‍👦b',2),'a👨‍👩‍👧‍👦…');
  const row={...item(text),title:'【仅基于摘要】标题',risk:'仅基于摘要，未取得原文。需核验。',quotable:'👍🏽'.repeat(100),keyPoints:['甲','乙','丙','丁','戊'],fullContentMeta:{summaryOnly:true,fetchedFrom:'rss-fallback'}};
  const shaped=ensureSummaryShape({tier1:[row],tier2:[]});
  assert.equal(shaped.tier1[0].title,'标题');
  const json=formatJson(shaped);
  assert.equal(json.tier1[0].summary,text);
  assert.equal(json.tier1[0].quotable,row.quotable);
  assert.equal(json.tier1[0].keyPoints.length,5);
  assert.equal(json.tier1[0].title,'标题');assert.equal(json.tier1[0].risk,'需核验。');
  assert.equal(json.tier1[0].fullContentMeta.summaryOnly,true);
  assert.match(formatMarkdown(json),/【仅基于摘要】标题/);
  assert.match(formatHtml(json),/【仅基于摘要】标题/);
  assert.equal(formatMarkdown(formatJson(json)),formatMarkdown(json));
  assert.ok(!JSON.stringify(json).includes('【仅基于摘要】'));
  const short={title:'速览',link:'https://fixtures.test/short',oneLiner:'👍🏽'.repeat(140)};
  assert.equal(ensureSummaryShape({tier1:[],tier2:[short]}).tier2[0].oneLiner,short.oneLiner);
  assert.throws(()=>ensureSummaryShape({tier1:[],tier2:[{...short,oneLiner:'文'.repeat(141)}]}),/rewrite a complete shorter summary/);
});

test('placeholder links fail before deduplication, review and every publication format', () => {
  const {linkIssue}=require('./content-contract');
  const {prepareCandidates}=require('./rss-fetcher');
  const {prepare,EMPTY_LEDGER}=require('./editorial');
  const {formatJson,formatMarkdown,formatHtml}=require('./output-formatter');
  const policy=require('../editorial-policy.json');
  for (const link of ['https://example.com/1','https://sub.example.org/2','https://aihot.news/items/xxx','https://site.test/%7Bid%7D','https://site.test/a?id=undefined']) {
    assert.equal(linkIssue(link),'placeholder-article-url');
    const a={...item('一。二。三。四。五。'),link,content:'正文',pubDate:new Date().toISOString()};
    assert.throws(()=>prepareCandidates([a,a]),/placeholder-article-url/);
    assert.throws(()=>prepare({candidates:[a]},policy,'daily',EMPTY_LEDGER),/placeholder-article-url/);
    for(const format of [formatJson,formatMarkdown,formatHtml]) assert.throws(()=>format({tier1:[a],tier2:[]}),/placeholder-article-url/);
  }
  for(const link of ['https://site.test/xxx-analysis','https://aihot.news/items/t1bibyohet2owqi2h0ytwvtk8','https://site.test/a?id=123']) assert.equal(linkIssue(link),null);
  for(const link of ['javascript:alert(1)','https://user:pass@site.test/a','']) assert.equal(linkIssue(link),'invalid-article-url');
});

test('invalid publication links leave an existing output file untouched', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rss-publish-'));
  try {
    const input=path.join(dir,'input.json'), output=path.join(dir,'output.md');
    fs.writeFileSync(input,JSON.stringify({tier1:[{...item('一。二。三。四。五。'),link:'https://example.com/1'}],tier2:[]}));
    fs.writeFileSync(output,'previous valid report');
    const result=spawnSync(process.execPath,[path.join(__dirname,'output-formatter.js'),'--input',input,'--outFile',output],{encoding:'utf8'});
    assert.notEqual(result.status,0);assert.match(result.stderr,/placeholder-article-url/);
    assert.equal(fs.readFileSync(output,'utf8'),'previous valid report');
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});

test('deep-read missing source is restored from matching selected candidate', () => {
  const {main: assemble} = require('./assemble-summary');
  const {formatJson,formatMarkdown} = require('./output-formatter');
  const topArticles = [
    {link:'https://aihot.news/items/real1',source:'AIHOT'},
    {link:'https://fixtures.test/article',source:'36氪'},
    {link:'https://fixtures.test/existing',source:'原始信源'},
    {link:'https://fixtures.test/empty',source:''}
  ];
  const rows = [
    {...item('一。二。三。四。五。'),link:topArticles[0].link,source:undefined},
    {...item('一。二。三。四。五。'),link:topArticles[1].link,source:'  '},
    {...item('一。二。三。四。五。'),link:topArticles[2].link,source:'明确来源'},
    {...item('一。二。三。四。五。'),link:topArticles[3].link,source:'unknown'},
    {...item('一。二。三。四。五。'),link:'https://fixtures.test/unmatched',source:undefined}
  ];
  const fetchData = {topArticles,otherTopArticles:[]};
  const result = assemble({params:{deepReadData:rows,tier2Data:{},fetchData}}).result;
  assert.deepEqual(result.tier1.map(a=>a.source),['AIHOT','36氪','明确来源','unknown','unknown']);
  const validated = ensureSummaryShape(result,fetchData);
  assert.deepEqual(formatJson(validated).tier1.map(a=>a.source),['AIHOT','36氪','明确来源','unknown','unknown']);
  assert.match(formatMarkdown(validated),/📰 AIHOT/);
});
