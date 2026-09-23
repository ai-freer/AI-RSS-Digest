const assert = require('assert');
const {
  ensureSummaryShape,
  buildDeepReadPrompt,
  normalizeDeepReadResult,
  getTemplateHints
} = require('./summary-utils');
const {
  normalizeSummaryData,
  formatMarkdown,
  formatHtml,
  formatJson
} = require('./output-formatter');
const { extractReadableText, enrichArticle } = require('./full-content-fetcher');
const { main: prepareDeepReadMain } = require('./prepare-deep-read');
const { main: assembleSummaryMain } = require('./assemble-summary');
const { ensureDeepReadRequirement } = require('./prepare-prompt');

async function run() {
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

  // ensureSummaryShape
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

  // ensureDeepReadRequirement
  assert.throws(() => ensureDeepReadRequirement({}, fetchData), /Tier1 deep-read is required/);
  assert.doesNotThrow(() => ensureDeepReadRequirement({ deepReadResults: 'tmp/deep-read-results.json' }, fetchData));
  assert.doesNotThrow(() => ensureDeepReadRequirement({}, { topArticles: [], otherTopArticles: [] }));

  // normalizeSummaryData
  const normalized = normalizeSummaryData(shaped);
  assert.strictEqual(normalized.highlights[0].summary.length > 0, true);
  assert.strictEqual(normalized.byCategory.编程[0].oneLiner.includes('<p>'), false);
  assert.ok(normalized.metadata.qualityGates.summary.warningCount > 0);
  assert.ok(normalized.metadata.qualityGates.summary.text.includes('自动修复'));

  // formatMarkdown
  const md = formatMarkdown(normalized);
  assert.ok(typeof md === 'string');
  assert.ok(md.includes('每日科技阅读'));
  assert.ok(md.includes('深度推荐'));
  assert.ok(md.includes('质量闸门'));
  assert.ok(!md.includes('{{'));

  // formatHtml
  const html = formatHtml(normalized);
  assert.ok(typeof html === 'string');
  assert.ok(html.includes('<!DOCTYPE html>'));
  assert.ok(html.includes('rsd-highlight'));
  assert.ok(html.includes('--rsd-color-primary'));
  assert.ok(!html.includes('{{'));
  assert.ok(!html.includes('unsubscribeLink'));

  // formatJson
  const json = formatJson(normalized);
  assert.ok(typeof json === 'object');
  assert.ok(Array.isArray(json.tier1));
  assert.ok(Array.isArray(json.tier2));
  assert.ok(Array.isArray(json.highlights));
  assert.ok(json.metadata && json.metadata.generatedAt);

  // buildDeepReadPrompt
  const deepReadPrompt = buildDeepReadPrompt(
    [
      '# Role',
      '模板: {{templateName}}',
      '提示: {{templateHints}}',
      '标题: {{title}}',
      '{{fullContent}}'
    ].join('\n'),
    {
      title: 'Deep Article',
      source: 'example',
      link: 'https://example.com/deep',
      pubDate: '2026-02-16',
      fullContent: 'This is the full article content.'
    },
    'tech-dev'
  );
  assert.ok(deepReadPrompt.includes('tech-dev'));
  assert.ok(deepReadPrompt.includes(getTemplateHints('tech-dev')));
  assert.ok(deepReadPrompt.includes('This is the full article content.'));

  // extractReadableText
  const parsedText = extractReadableText(
    `
    <html>
      <body>
        <nav>menu</nav>
        <article><h1>Hello</h1><p>Main readable content.</p></article>
      </body>
    </html>
    `,
    'https://example.com'
  );
  assert.ok(parsedText.includes('Main readable content.'));

  // prepareDeepReadMain
  const deepReadPrompts = prepareDeepReadMain({
    params: {
      fetchData: {
        date: '2026-02-16',
        topArticles: [
          {
            title: 'Top Deep',
            link: 'https://example.com/deep',
            source: 'example',
            pubDate: '2026-02-16',
            fullContent: 'Long full article text'
          }
        ]
      },
      templateText: '# Role\n{{templateName}}\n{{templateHints}}\n{{title}}\n{{fullContent}}',
      templateName: 'product'
    }
  });
  assert.strictEqual(deepReadPrompts.result.prompts.length, 1);
  assert.ok(deepReadPrompts.result.prompts[0].prompt.includes('product'));

  // assembleSummaryMain
  const assembled = assembleSummaryMain({
    params: {
      deepReadData: {
        results: [
          {
            title: 'Deep Result',
            link: 'https://example.com/deep',
            source: 'example',
            category: 'AI',
            summary: '第一句。第二句。第三句。第四句。第五句。',
            keyPoints: ['要点一', '要点二', '要点三', '要点四'],
            action: '执行建议',
            risk: '风险提醒',
            quotable: '关键引述'
          }
        ]
      },
      tier2Data: {
        date: '2026-02-16',
        tier2: [
          {
            rank: 1,
            title: 'Tier2 title',
            link: 'https://example.com/tier2',
            source: 'example',
            category: '编程',
            oneLiner: '一句话速览内容足够长可通过质量校验'
          }
        ]
      },
      fetchData: {
        date: '2026-02-16',
        topArticles: [],
        otherTopArticles: []
      }
    }
  });
  assert.strictEqual(assembled.result.tier1.length, 1);
  assert.strictEqual(assembled.result.tier2.length, 1);
  assert.strictEqual(assembled.result.tier1[0].quotable, '关键引述');

  // normalizeDeepReadResult
  const normalizedDeepRead = normalizeDeepReadResult({
    title: 'Deep Direct',
    link: 'https://example.com/direct',
    source: 'example',
    summary: '一句。两句。三句。四句。五句。',
    keyPoints: ['a', 'b', 'c', 'd', 'e'],
    action: 'action',
    risk: 'risk',
    category: 'AI'
  }, 1);
  assert.strictEqual(normalizedDeepRead.deepRead, true);
  assert.strictEqual(normalizedDeepRead.sourceType, 'deep-read');

  const originalFetch = global.fetch;
  let webRequests = 0;
  global.fetch = async () => {
    webRequests += 1;
    throw new Error('Unexpected webpage request');
  };
  try {
    for (const articleInput of [
      { source: 'AIHOT', link: 'https://aihot.news/items/example' },
      { source: 'legacy', link: 'https://aihot.virxact.com/items/example' }
    ]) {
      const article = await enrichArticle({ ...articleInput, content: 'RSS article text' });
      assert.strictEqual(article.fullContent, 'RSS article text');
      assert.strictEqual(article.fullContentMeta.fetchedFrom, 'rss');
    }
    assert.strictEqual(webRequests, 0);
  } finally {
    global.fetch = originalFetch;
  }

  console.log('summary pipeline tests passed');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
