/**
 * AI Summarizer for RSS Digest
 *
 * 把 rss-fetcher 的排序结果交给 LLM 生成结构化摘要（summaryData）
 * 主契约：tier1 / tier2；同时桥接 highlights / byCategory 以兼容旧格式化层。
 *
 * @version 1.1.0
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_TEMPLATE = path.join(__dirname, '..', 'templates', 'prompt-summarize-tiered.md');
const DEFAULT_TIMEOUT = 90000;
const CATEGORY_KEYS = ['编程', 'AI', '系统', '硬件', '安全', '创业', '综合'];
const QUALITY_RULES = {
  tier1MinSentences: 3,
  tier1MinKeyPoints: 3,
  tier2MinLen: 15,
  tier2MaxLen: 140
};

function ensureValue(value, name) {
  if (value === undefined || value === null || value === '') {
    throw new Error(`Missing required value: ${name}`);
  }
}

function safeText(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function decodeHtmlEntities(text) {
  if (!text) return '';
  return String(text)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    });
}

function cleanText(text) {
  return decodeHtmlEntities(safeText(text, ''))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripAndClamp(text, maxLen = 1200) {
  const raw = cleanText(text);
  if (raw.length <= maxLen) return raw;
  return `${raw.slice(0, maxLen)}...`;
}

function inferCategory(title, content) {
  const corpus = `${safeText(title, '')} ${safeText(content, '')}`.toLowerCase();
  if (!corpus) return '综合';
  if (/(\bllm\b|\bgpt\b|\bagent(ic)?\b|\bmodel(s)?\b|\binference\b|人工智能|机器学习|深度学习|大模型|推理)/.test(corpus)) return 'AI';
  if (/(\bkernel\b|\blinux\b|\bos\b|\bfilesystem\b|\bdriver\b|操作系统|内核|系统编程)/.test(corpus)) return '系统';
  if (/(\bsecurity\b|\bvulnerability\b|\bcve\b|\bexploit\b|逆向|漏洞|渗透|隐私|攻击)/.test(corpus)) return '安全';
  if (/(\bchip(s)?\b|\bgpu\b|\bcpu\b|\bembedded\b|\bfpga\b|硬件|芯片|树莓派|电路)/.test(corpus)) return '硬件';
  if (/(\bstartup\b|\bsaas\b|\bbusiness\b|\bproduct\b|\bmarket\b|\bgrowth\b|创业|增长|商业|市场|产品)/.test(corpus)) return '创业';
  if (/(\bcode\b|\bprogram(ming)?\b|\bjavascript\b|\bpython\b|\brust\b|\bgo\b|\breact\b|\bcompiler\b|编程|开发|架构)/.test(corpus)) return '编程';
  return '综合';
}

function buildPromptArticles(fetchData) {
  const top = Array.isArray(fetchData?.topArticles) ? fetchData.topArticles : [];
  const other = Array.isArray(fetchData?.otherTopArticles) ? fetchData.otherTopArticles : [];
  const all = [...top, ...other];

  return all.map((a, index) => {
    const content = stripAndClamp(a.content, 1200);
    return {
      rank: index + 1,
      title: safeText(a.title, 'Untitled'),
      link: safeText(a.link, ''),
      source: safeText(a.source, 'unknown'),
      pubDate: safeText(a.pubDate, ''),
      score: typeof a.score === 'number' ? a.score : null,
      content,
      categoryHint: inferCategory(a.title, content),
      sourceTags: Array.isArray(a.sourceTags) ? a.sourceTags : []
    };
  });
}

function buildPrompt(templateText, articles, fetchData = {}) {
  const topArticles = Array.isArray(fetchData?.topArticles) ? fetchData.topArticles : [];
  const otherTopArticles = Array.isArray(fetchData?.otherTopArticles) ? fetchData.otherTopArticles : [];
  const sanitizedTop = topArticles.map(a => ({ ...a, content: stripAndClamp(a.content, 1000) }));
  const sanitizedOther = otherTopArticles.map(a => ({ ...a, content: stripAndClamp(a.content, 600) }));

  return templateText
    .replace(/\{\{articleCount\}\}/g, String(articles.length))
    .replace(/\{\{articles\}\}/g, JSON.stringify(articles, null, 2))
    .replace(/\{\{topCount\}\}/g, String(topArticles.length))
    .replace(/\{\{otherCount\}\}/g, String(otherTopArticles.length))
    .replace(/\{\{topArticles\}\}/g, JSON.stringify(sanitizedTop, null, 2))
    .replace(/\{\{otherTopArticles\}\}/g, JSON.stringify(sanitizedOther, null, 2));
}

function extractJson(text) {
  if (!text) return null;
  const trimmed = String(text).trim();
  try {
    return JSON.parse(trimmed);
  } catch (_) {
    // continue
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  const candidate = trimmed.slice(start, end + 1);
  try {
    return JSON.parse(candidate);
  } catch (_) {
    return null;
  }
}

function ensureCategory(value, fallback = '综合') {
  const normalized = safeText(value, fallback);
  return CATEGORY_KEYS.includes(normalized) ? normalized : fallback;
}

function extractShortSummary(text, maxLen = 90) {
  const raw = cleanText(text);
  if (!raw) return '信息不足，建议查看原文。';
  if (raw.length <= maxLen) return raw;
  return `${raw.slice(0, maxLen)}...`;
}

function extractSentences(text, count = 3) {
  const raw = cleanText(text);
  if (!raw) return [];
  const parts = raw.split(/(?<=[。！？.!?])\s+/).filter(Boolean);
  if (parts.length === 0) return [extractShortSummary(raw, 80)];
  return parts.slice(0, count).map(s => s.trim()).filter(Boolean);
}

function flattenByCategory(byCategory) {
  if (!byCategory || typeof byCategory !== 'object' || Array.isArray(byCategory)) return [];
  const rows = [];
  Object.entries(byCategory).forEach(([category, articles]) => {
    if (!Array.isArray(articles)) return;
    articles.forEach((a, index) => {
      rows.push({
        rank: index + 1,
        title: safeText(a.title, 'Untitled'),
        link: safeText(a.link, ''),
        source: safeText(a.source, 'unknown'),
        category: ensureCategory(category),
        oneLiner: extractShortSummary(a.oneLiner || a.summary || a.content, 120)
      });
    });
  });
  return rows;
}

function groupTier2ByCategory(tier2) {
  const grouped = {};
  CATEGORY_KEYS.forEach(key => { grouped[key] = []; });
  tier2.forEach((a) => {
    const category = ensureCategory(a.category);
    grouped[category].push({
      title: safeText(a.title, 'Untitled'),
      link: safeText(a.link, ''),
      source: safeText(a.source, 'unknown'),
      oneLiner: extractShortSummary(a.oneLiner || a.summary || '', 120)
    });
  });
  return grouped;
}

function bridgeFromTier1(tier1) {
  return tier1.map((a, index) => ({
    rank: Number.isFinite(Number(a.rank)) ? Number(a.rank) : index + 1,
    title: safeText(a.title, 'Untitled'),
    link: safeText(a.link, ''),
    reason: extractShortSummary(a.summary || a.action || a.risk, 48),
    for: safeText(a.for || '技术读者', '技术读者'),
    source: safeText(a.source, 'unknown'),
    category: ensureCategory(a.category)
  }));
}

function normalizeTier1Item(article, rank) {
  const content = safeText(article.summary, '') || extractSentences(article.content, 3).join(' ');
  const keyPoints = Array.isArray(article.keyPoints)
    ? article.keyPoints.slice(0, 3).map(item => extractShortSummary(item, 60))
    : extractSentences(article.content, 3).map(item => extractShortSummary(item, 60));

  return {
    rank: Number.isFinite(Number(article.rank)) ? Number(article.rank) : rank,
    title: safeText(article.title, 'Untitled'),
    link: safeText(article.link, ''),
    source: safeText(article.source, 'unknown'),
    category: ensureCategory(article.category || inferCategory(article.title, article.summary || article.content)),
    summary: content || '信息不足，建议查看原文。',
    keyPoints: keyPoints.length > 0 ? keyPoints : ['信息不足，建议查看原文。'],
    action: extractShortSummary(article.action || '建议先阅读原文再做决策。', 80),
    risk: extractShortSummary(article.risk || '原文信息有限，判断可能偏差。', 80)
  };
}

function normalizeTier2Item(article, rank) {
  return {
    rank: Number.isFinite(Number(article.rank)) ? Number(article.rank) : rank,
    title: safeText(article.title, 'Untitled'),
    link: safeText(article.link, ''),
    source: safeText(article.source, 'unknown'),
    category: ensureCategory(article.category || inferCategory(article.title, article.oneLiner || article.content)),
    oneLiner: extractShortSummary(article.oneLiner || article.summary || article.content, 120)
  };
}

function buildSummaryFromKeyPoints(keyPoints) {
  if (!Array.isArray(keyPoints)) return '';
  const normalized = keyPoints
    .map(item => cleanText(item))
    .filter(Boolean)
    .slice(0, 3)
    .map(item => (/[。！？.!?]$/.test(item) ? item : `${item}。`));
  return normalized.join(' ');
}

function sentenceCount(text) {
  return extractSentences(text, 20).length;
}

function enforceTier1Quality(tier1) {
  const warnings = [];
  const fixed = tier1.map((item, idx) => {
    const output = { ...item };
    output.summary = cleanText(output.summary || '');
    output.keyPoints = Array.isArray(output.keyPoints)
      ? output.keyPoints.map(v => cleanText(v)).filter(Boolean).slice(0, 3)
      : [];
    output.action = cleanText(output.action || '');
    output.risk = cleanText(output.risk || '');

    if (!output.summary || sentenceCount(output.summary) < QUALITY_RULES.tier1MinSentences) {
      const rebuilt = buildSummaryFromKeyPoints(output.keyPoints);
      if (rebuilt) {
        output.summary = rebuilt;
        warnings.push(`tier1[${idx}] summary rebuilt from keyPoints`);
      }
    }

    if (!output.summary) {
      output.summary = '信息不足，建议查看原文。';
      warnings.push(`tier1[${idx}] summary fallback`);
    }

    if (output.keyPoints.length < QUALITY_RULES.tier1MinKeyPoints) {
      const fromSummary = extractSentences(output.summary, 6).map(v => extractShortSummary(v, 70));
      output.keyPoints = [...output.keyPoints, ...fromSummary].filter(Boolean).slice(0, 3);
      while (output.keyPoints.length < QUALITY_RULES.tier1MinKeyPoints) {
        output.keyPoints.push('信息不足，建议查看原文。');
      }
      warnings.push(`tier1[${idx}] keyPoints completed`);
    }

    if (!output.action) {
      output.action = '建议先阅读原文关键段落，再决定是否投入时间深入。';
      warnings.push(`tier1[${idx}] action fallback`);
    }

    if (!output.risk) {
      output.risk = '摘要可能缺少上下文，结论需回源核对。';
      warnings.push(`tier1[${idx}] risk fallback`);
    }

    return output;
  });

  return { tier1: fixed, warnings };
}

function enforceTier2Quality(tier2) {
  const warnings = [];
  const fixed = tier2.map((item, idx) => {
    const output = { ...item };
    const raw = cleanText(output.oneLiner || '');

    if (!raw || raw.length < QUALITY_RULES.tier2MinLen) {
      output.oneLiner = '信息不足，建议查看原文。';
      warnings.push(`tier2[${idx}] oneLiner fallback`);
      return output;
    }

    if (raw.length > QUALITY_RULES.tier2MaxLen) {
      output.oneLiner = `${raw.slice(0, QUALITY_RULES.tier2MaxLen)}...`;
      warnings.push(`tier2[${idx}] oneLiner clamped`);
      return output;
    }

    output.oneLiner = raw;
    return output;
  });

  return { tier2: fixed, warnings };
}

function computeSummary(tier1, tier2) {
  const categories = {};
  CATEGORY_KEYS.forEach(c => { categories[c] = 0; });
  [...tier1, ...tier2].forEach(a => {
    const category = ensureCategory(a.category);
    categories[category] += 1;
  });
  return {
    totalArticles: tier1.length + tier2.length,
    categories
  };
}

function ensureSummaryShape(data, fetchData = {}) {
  if (!data || typeof data !== 'object') {
    throw new Error('LLM output is not a JSON object');
  }

  const fetchTop = Array.isArray(fetchData?.topArticles) ? fetchData.topArticles : [];
  const fetchOther = Array.isArray(fetchData?.otherTopArticles) ? fetchData.otherTopArticles : [];

  let tier1Source = Array.isArray(data.tier1) ? data.tier1 : [];
  let tier2Source = Array.isArray(data.tier2) ? data.tier2 : [];

  if (tier1Source.length === 0 && Array.isArray(data.highlights)) {
    tier1Source = data.highlights;
  }
  if (tier2Source.length === 0) {
    tier2Source = flattenByCategory(data.byCategory);
  }

  if (tier1Source.length === 0) {
    tier1Source = fetchTop.slice(0, 5);
  }
  if (tier2Source.length === 0) {
    const fallbackTier2 = [...fetchTop.slice(5), ...fetchOther];
    tier2Source = fallbackTier2;
  }

  const rawTier1 = tier1Source.map((a, idx) => normalizeTier1Item(a, idx + 1));
  const rawTier2 = tier2Source.map((a, idx) => normalizeTier2Item(a, idx + 1));
  const tier1Quality = enforceTier1Quality(rawTier1);
  const tier2Quality = enforceTier2Quality(rawTier2);
  const tier1 = tier1Quality.tier1;
  const tier2 = tier2Quality.tier2;
  const highlights = bridgeFromTier1(tier1);
  const byCategory = groupTier2ByCategory(tier2);
  const summary = (data.summary && typeof data.summary === 'object')
    ? {
      totalArticles: Number.isFinite(Number(data.summary.totalArticles))
        ? Number(data.summary.totalArticles)
        : tier1.length + tier2.length,
      categories: CATEGORY_KEYS.reduce((acc, key) => {
        const val = data.summary?.categories?.[key];
        acc[key] = Number.isFinite(Number(val)) ? Number(val) : 0;
        return acc;
      }, {})
    }
    : computeSummary(tier1, tier2);

  // 如果传入 summary 为空计数，则用实时计数覆盖
  if (summary.totalArticles === 0) {
    const computed = computeSummary(tier1, tier2);
    summary.totalArticles = computed.totalArticles;
    summary.categories = computed.categories;
  }

  const normalized = {
    date: safeText(data.date, fetchData?.date || new Date().toISOString().slice(0, 10)),
    summary,
    tier1,
    tier2,
    highlights,
    byCategory,
    dailyAdvice: extractShortSummary(
      data.dailyAdvice || '优先阅读 Tier1 的深度摘要，再按 Tier2 速览做取舍。',
      100
    ),
    metadata: {
      ...(data.metadata && typeof data.metadata === 'object' ? data.metadata : {}),
      qualityGates: {
        applied: true,
        rules: QUALITY_RULES,
        warnings: [...tier1Quality.warnings, ...tier2Quality.warnings]
      }
    }
  };

  return normalized;
}

async function callOpenAICompatible({ apiKey, baseUrl, model, prompt, timeoutMs = DEFAULT_TIMEOUT }) {
  ensureValue(apiKey, 'OPENAI_API_KEY');
  ensureValue(model, 'model');

  const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`LLM HTTP ${response.status}: ${raw.slice(0, 500)}`);
    }

    const payload = JSON.parse(raw);
    const content = payload?.choices?.[0]?.message?.content;
    const parsed = extractJson(content);
    if (!parsed) {
      throw new Error('LLM returned non-JSON content');
    }
    return parsed;
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildHeuristicSummary(fetchData) {
  const top = Array.isArray(fetchData?.topArticles) ? fetchData.topArticles : [];
  const other = Array.isArray(fetchData?.otherTopArticles) ? fetchData.otherTopArticles : [];

  const tier1 = top.slice(0, 5).map((a, idx) => normalizeTier1Item({
    rank: idx + 1,
    title: safeText(a.title, 'Untitled'),
    link: safeText(a.link, ''),
    source: safeText(a.source, 'unknown'),
    category: inferCategory(a.title, a.content),
    summary: extractSentences(a.content, 3).join(' '),
    keyPoints: extractSentences(a.content, 3),
    action: `若该主题与你职责相关，优先阅读原文第 1-3 段确认细节。`,
    risk: `RSS 摘要可能缺少上下文，结论需回源核对。`
  }, idx + 1));

  const tier2Raw = [...top.slice(5), ...other];
  const tier2 = tier2Raw.map((a, idx) => normalizeTier2Item({
    rank: idx + 1,
    title: safeText(a.title, 'Untitled'),
    link: safeText(a.link, ''),
    source: safeText(a.source, 'unknown'),
    category: inferCategory(a.title, a.content),
    oneLiner: extractShortSummary(a.content, 120)
  }, idx + 1));

  const result = ensureSummaryShape({
    date: fetchData?.date || new Date().toISOString().slice(0, 10),
    tier1,
    tier2,
    dailyAdvice: '先看 Tier1 深度摘要，再按 Tier2 速览决定是否回源阅读。'
  }, fetchData);

  result.metadata = {
    ...(result.metadata && typeof result.metadata === 'object' ? result.metadata : {}),
    generatedAt: new Date().toISOString(),
    model: 'heuristic-fallback',
    version: '1.1.0',
    template: 'summarize-tiered'
  };
  return result;
}

async function main({ params }) {
  const {
    fetchData,
    templatePath = DEFAULT_TEMPLATE,
    model = process.env.LLM_MODEL || 'gpt-4.1-mini',
    timeoutMs = DEFAULT_TIMEOUT,
    allowHeuristicFallback = false
  } = params || {};

  ensureValue(fetchData, 'fetchData');
  const templateText = fs.readFileSync(templatePath, 'utf8');
  const promptArticles = buildPromptArticles(fetchData);
  const prompt = buildPrompt(templateText, promptArticles, fetchData);

  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

  try {
    const summaryData = await callOpenAICompatible({
      apiKey,
      baseUrl,
      model,
      prompt,
      timeoutMs
    });
    const shaped = ensureSummaryShape(summaryData, fetchData);
    shaped.metadata = {
      ...shaped.metadata,
      generatedAt: shaped.metadata.generatedAt || new Date().toISOString(),
      model,
      version: shaped.metadata.version || '1.1.0',
      template: shaped.metadata.template || 'summarize-tiered'
    };
    return { result: shaped };
  } catch (error) {
    if (!allowHeuristicFallback) {
      throw error;
    }
    const fallback = buildHeuristicSummary(fetchData);
    fallback.metadata.fallbackReason = String(error.message || error);
    return { result: fallback };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    main,
    buildPromptArticles,
    buildPrompt,
    ensureSummaryShape,
    cleanText,
    inferCategory,
    QUALITY_RULES
  };
}

if (typeof exports !== 'undefined') {
  exports.main = main;
}
