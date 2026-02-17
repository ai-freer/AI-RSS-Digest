const assert = require('assert');
const {
  ensureSummaryShape,
  buildDeepReadPrompt,
  normalizeDeepReadResult,
  getTemplateHints
} = require('./summary-utils');
const {
  normalizeSummaryData,
  formatEmailHtml,
  formatEmailText,
  formatWecom,
  formatFeishuCard,
  formatDingtalk,
  formatWhatsApp,
  splitMessage
} = require('./output-formatter');
const { extractReadableText } = require('./full-content-fetcher');
const { main: prepareDeepReadMain } = require('./prepare-deep-read');
const { main: assembleSummaryMain } = require('./assemble-summary');

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

  const wecom = formatWecom({
    ...normalized,
    dailyAdvice: '你'.repeat(1200)
  });
  assert.ok(Array.isArray(wecom.chunks));
  wecom.chunks.forEach((chunk) => {
    assert.ok(Buffer.byteLength(chunk, 'utf8') <= 1800);
  });

  const feishu = formatFeishuCard(normalized);
  assert.strictEqual(feishu.msg_type, 'interactive');
  assert.ok(Array.isArray(feishu.card.elements));
  assert.ok(feishu.card.elements.length > 0);

  const dingtalk = formatDingtalk(normalized);
  assert.strictEqual(dingtalk.msgtype, 'markdown');
  assert.ok(dingtalk.markdown.text.includes('深度推荐'));

  const whatsappTier2 = Array.from({ length: 120 }, (_, idx) => ({
    rank: idx + 1,
    title: `Long WhatsApp Title ${idx + 1}`,
    link: `https://example.com/w/${idx + 1}`,
    source: 'example',
    category: '综合',
    oneLiner: '用于触发 WhatsApp 自动分片的测试内容，保持语义完整并可读。'
  }));
  const hugeHighlights = Array.from({ length: 40 }, (_, idx) => ({
    rank: idx + 1,
    title: `Huge Highlight ${idx + 1}`,
    link: `https://example.com/h/${idx + 1}`,
    source: 'example',
    category: '综合',
    reason: '高价值内容，建议优先阅读。',
    summary: '这是一段用于触发分片的长摘要。'.repeat(25),
    action: '执行建议。'.repeat(20),
    risk: '风险提示。'.repeat(20)
  }));
  const whatsapp = formatWhatsApp({
    ...normalized,
    highlights: hugeHighlights,
    tier2: whatsappTier2,
    byCategory: {}
  });
  assert.strictEqual(whatsapp.messaging_product, 'whatsapp');
  assert.ok(Array.isArray(whatsapp.messages));
  assert.ok(whatsapp.messages.length >= 2);

  const chunks = splitMessage('a'.repeat(8200), 4096);
  assert.ok(chunks.length >= 2);
  chunks.forEach((chunk) => {
    assert.ok(chunk.length <= 4096);
  });

  console.log('summary pipeline tests passed');
}

run();
