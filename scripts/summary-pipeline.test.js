const assert = require('assert');
const { ensureSummaryShape } = require('./summary-utils');
const { normalizeSummaryData, formatEmailHtml, formatEmailText, formatWecom } = require('./output-formatter');

function run() {
  const fetchData = {
    date: '2026-02-15',
    topArticles: [
      {
        title: 'Top Article',
        link: 'https://example.com/top',
        source: 'example',
        content: '<p>LLM inference speed and model quality tradeoff.</p>'
      }
    ],
    otherTopArticles: [
      {
        title: 'Other Article',
        link: 'https://example.com/other',
        source: 'example',
        content: '&lt;p&gt;A short one-liner for scanning.&lt;/p&gt;'
      }
    ]
  };

  const tieredInput = {
    date: '2026-02-15',
    tier1: [
      {
        rank: 1,
        title: 'Top Article',
        link: 'https://example.com/top',
        source: 'example',
        category: 'AI',
        summary: 'Too short.',
        keyPoints: ['Point A'],
        action: '',
        risk: ''
      }
    ],
    tier2: [
      {
        rank: 1,
        title: 'Other Article',
        link: 'https://example.com/other',
        source: 'example',
        category: '编程',
        oneLiner: 'short'
      }
    ],
    dailyAdvice: 'Read tier1 first.'
  };

  const shaped = ensureSummaryShape(tieredInput, fetchData);
  assert.strictEqual(shaped.tier1.length, 1);
  assert.strictEqual(shaped.tier2.length, 1);
  assert.strictEqual(shaped.highlights.length, 1);
  assert.ok(shaped.byCategory.编程.length >= 1);
  assert.ok(shaped.metadata.qualityGates.applied);
  assert.ok(shaped.metadata.qualityGates.warnings.length > 0);
  assert.ok(shaped.tier1[0].keyPoints.length >= 3);
  assert.ok(shaped.tier1[0].action.length > 0);
  assert.ok(shaped.tier1[0].risk.length > 0);
  assert.strictEqual(shaped.tier2[0].oneLiner, '信息不足，建议查看原文。');

  const normalized = normalizeSummaryData(shaped);
  assert.strictEqual(normalized.highlights[0].summary.length > 0, true);
  assert.strictEqual(normalized.byCategory.编程[0].oneLiner.includes('<p>'), false);
  assert.ok(normalized.metadata.qualityGates.summary.warningCount > 0);
  assert.ok(normalized.metadata.qualityGates.summary.text.includes('自动修复'));

  const text = formatEmailText(normalized);
  assert.ok(text.includes('摘要:'));
  assert.ok(text.includes('要点:'));
  assert.ok(text.includes('行动:'));
  assert.ok(text.includes('风险:'));
  assert.ok(text.includes('质量闸门'));
  assert.ok(!text.includes('{{/each}}'));
  assert.ok(!text.includes('{{metadata.generatedAt}}'));

  const html = formatEmailHtml(normalized);
  assert.ok(!html.includes('{{/each}}'));
  assert.ok(!html.includes('{{metadata.generatedAt}}'));
  assert.ok(!html.includes('{{unsubscribeLink}}'));

  const wecom = formatWecom({
    ...normalized,
    dailyAdvice: '你'.repeat(1200)
  });
  assert.ok(Array.isArray(wecom.chunks));
  wecom.chunks.forEach((chunk) => {
    assert.ok(Buffer.byteLength(chunk, 'utf8') <= 1800);
  });

  console.log('summary pipeline tests passed');
}

run();
