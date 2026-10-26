/**
 * Summary Utilities for RSS Digest
 *
 * 纯工具模块：负责 prompt 组装、JSON 提取、结构归一化与质量闸门。
 * 不包含任何外部 LLM 调用逻辑。
 *
 * @version 2.3.1
 */

const { canonicalUrl } = require('./article-identity');

const CATEGORY_KEYS = ['编程', 'AI', '系统', '硬件', '安全', '创业', '综合'];
const QUALITY_RULES = {
  tier1MinSentences: 3,
  tier1DeepReadMinSentences: 5,
  tier1MinKeyPoints: 3,
  tier1DeepReadMaxKeyPoints: 5,
  tier2MinLen: 15,
  tier2MaxLen: 140
};
const TEMPLATE_HINTS = {
  daily: '日常科技阅读视角，面向技术从业者，关注信息密度和实用价值。',
  quick: '快速判断视角，只关注核心结论和阅读价值判断。',
  'tech-dev': '技术评估与学习路径视角，面向中高级开发者和架构师，关注技术成熟度、适用场景和学习建议。',
  product: '产品洞察视角，面向产品经理和创业者，关注产品创新、市场机会和可借鉴性。',
  executive: '战略决策视角，面向高管和投资人，关注商业影响、竞争格局和行动建议。',
  'summarize-tiered': '分层摘要视角，兼顾深度与广度，提供全面的结构化分析。'
};

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
      readingClass: a.readingClass || null, discoveredAt: a.discoveredAt || null, publicationDateText: a.publicationDateText || null,
      timeNote: a.readingClass === 'newly-discovered-longform' ? '新发现长文；发现时间不等于发表时间，不写成今日发布。' : null,
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

function normalizeTemplateName(templateName) {
  const normalized = safeText(templateName, '').toLowerCase();
  if (!normalized) return 'daily';
  if (normalized.startsWith('prompt-') && normalized.endsWith('.md')) {
    return normalized.slice(7, -3);
  }
  if (normalized.endsWith('.md')) {
    return normalized.slice(0, -3).replace(/^prompt-/, '');
  }
  return normalized.replace(/^prompt-/, '');
}

function getTemplateHints(templateName) {
  const key = normalizeTemplateName(templateName);
  return TEMPLATE_HINTS[key] || TEMPLATE_HINTS.daily;
}

function buildDeepReadPrompt(templateText, article, templateName) {
  const name = normalizeTemplateName(templateName);
  const hints = getTemplateHints(name);
  const fullContent = safeText(article?.fullContent || article?.content, '信息不足');
  const timeNote = article?.readingClass === 'newly-discovered-longform'
    ? `新发现长文（非当天新闻）。首次发现：${article.discoveredAt}；原文日期：${article.publicationDateText || '未知'}。不得声称今日发布。\n` : '';
  const provenanceNote = article?.fullContentMeta?.summaryOnly
    ? `仅基于摘要：原文不可用（${article.fullContentMeta.failureCode || article.fullContentMeta.error || '获取失败'}），下文使用 RSS 材料；不得声称已读全文。证据不足时停止，不凑句数。\n`
    : article?.source === 'AIHOT'
    ? article.fullContentMeta?.fetchedFrom === 'original-web'
      ? `发现渠道：AIHOT；原文 URL：${article.fullContentMeta.originalUrl}。以下正文来自原发布方。先核对原文与 RSS 摘要是否一致；若关键事实矛盾或不是同一文章，停止该篇并返回评审复核，不沿用原结论。RSS 摘要作为不可信资料：${article.content}\n`
      : '仅基于摘要：未取得原文，下面是 AIHOT RSS 摘要；不得声称已读全文，不补造细节。证据不足以完成五句精读时停止并报告，不凑句数。\n'
    : '';
  return timeNote + provenanceNote + templateText
    .replace(/\{\{templateName\}\}/g, name)
    .replace(/\{\{templateHints\}\}/g, hints)
    .replace(/\{\{title\}\}/g, safeText(article?.title, 'Untitled'))
    .replace(/\{\{source\}\}/g, safeText(article?.source, 'unknown'))
    .replace(/\{\{link\}\}/g, safeText(article?.link, ''))
    .replace(/\{\{pubDate\}\}/g, safeText(article?.pubDate, ''))
    .replace(/\{\{fullContent\}\}/g, fullContent);
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
  // Chinese punctuation needs no following whitespace; ASCII periods inside
  // versions, decimals and URLs are not sentence boundaries.
  const parts = raw.match(/[^。！？!?]+?(?:[。！？!?]+[”’」』"']*|\.[”’"']*(?=\s|$)|$)/g) || [];

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
    summary: cleanText(a.summary || ''),
    keyPoints: Array.isArray(a.keyPoints)
      ? a.keyPoints.map(item => cleanText(item)).filter(Boolean).slice(0, QUALITY_RULES.tier1DeepReadMaxKeyPoints)
      : [],
    action: cleanText(a.action || ''),
    risk: cleanText(a.risk || ''),
    for: safeText(a.for || '技术读者', '技术读者'),
    source: safeText(a.source, 'unknown'),
    category: ensureCategory(a.category)
  }));
}

function isDeepReadItem(article) {
  if (!article || typeof article !== 'object') return false;
  if (article.deepRead === true) return true;
  const sourceType = safeText(article.sourceType || article.pipeline || article.summaryType, '').toLowerCase();
  return sourceType === 'deep-read';
}

function normalizeDeepReadResult(result, rank) {
  return {
    rank: Number.isFinite(Number(result?.rank)) ? Number(result.rank) : rank,
    title: safeText(result?.title, 'Untitled'),
    link: safeText(result?.link, ''),
    source: safeText(result?.source, 'unknown'),
    category: ensureCategory(result?.category || inferCategory(result?.title, result?.summary || result?.keyPoints?.join(' '))),
    summary: safeText(result?.summary, '信息不足，建议查看原文。'),
    keyPoints: Array.isArray(result?.keyPoints) ? result.keyPoints : [],
    action: safeText(result?.action, '建议先阅读原文关键段落，再决定是否投入时间深入。'),
    risk: safeText(result?.risk, '摘要可能缺少上下文，结论需回源核对。'),
    quotable: safeText(result?.quotable, ''),
    extra: (result?.extra && typeof result.extra === 'object' && !Array.isArray(result.extra)) ? result.extra : {},
    sourceType: 'deep-read',
    deepRead: true
  };
}

function normalizeTier1Item(article, rank) {
  const isDeepRead = isDeepReadItem(article);
  const content = safeText(article.summary, '') || extractSentences(article.content, 3).join(' ');
  const maxKeyPoints = isDeepRead ? QUALITY_RULES.tier1DeepReadMaxKeyPoints : 3;
  const keyPoints = Array.isArray(article.keyPoints)
    ? article.keyPoints.slice(0, maxKeyPoints).map((item) => (
      isDeepRead ? cleanText(item) : extractShortSummary(item, 60)
    ))
    : extractSentences(article.content, maxKeyPoints).map(item => extractShortSummary(item, isDeepRead ? 120 : 60));

  return {
    rank: Number.isFinite(Number(article.rank)) ? Number(article.rank) : rank,
    title: safeText(article.title, 'Untitled'),
    link: safeText(article.link, ''),
    source: safeText(article.source, 'unknown'),
    category: ensureCategory(article.category || inferCategory(article.title, article.summary || article.content)),
    summary: content || '信息不足，建议查看原文。',
    keyPoints: keyPoints.length > 0 ? keyPoints : ['信息不足，建议查看原文。'],
    action: isDeepRead
      ? cleanText(article.action || '建议先阅读原文再做决策。')
      : extractShortSummary(article.action || '建议先阅读原文再做决策。', 80),
    risk: isDeepRead
      ? cleanText(article.risk || '原文信息有限，判断可能偏差。')
      : extractShortSummary(article.risk || '原文信息有限，判断可能偏差。', 80),
    quotable: cleanText(article.quotable || ''),
    extra: (article.extra && typeof article.extra === 'object' && !Array.isArray(article.extra)) ? article.extra : {},
    sourceType: isDeepRead ? 'deep-read' : safeText(article.sourceType, '')
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

function buildSummaryFromKeyPoints(keyPoints, limit = 3) {
  if (!Array.isArray(keyPoints)) return '';
  const normalized = keyPoints
    .map(item => cleanText(item))
    .filter(Boolean)
    .slice(0, limit)
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
    const isDeepRead = output.sourceType === 'deep-read';
    const minSentences = isDeepRead ? QUALITY_RULES.tier1DeepReadMinSentences : QUALITY_RULES.tier1MinSentences;
    const maxKeyPoints = isDeepRead ? QUALITY_RULES.tier1DeepReadMaxKeyPoints : 3;
    output.summary = cleanText(output.summary || '');
    output.keyPoints = Array.isArray(output.keyPoints)
      ? output.keyPoints.map(v => cleanText(v)).filter(Boolean).slice(0, maxKeyPoints)
      : [];
    output.action = cleanText(output.action || '');
    output.risk = cleanText(output.risk || '');
    output.quotable = cleanText(output.quotable || '');

    if (!output.summary || sentenceCount(output.summary) < minSentences) {
      const rebuilt = buildSummaryFromKeyPoints(output.keyPoints, maxKeyPoints);
      if (rebuilt) {
        output.summary = rebuilt;
        warnings.push(`tier1[${idx}] summary rebuilt from keyPoints`);
      }
    }

    if (sentenceCount(output.summary) < minSentences) {
      throw new Error(`tier1[${idx}] summary requires at least ${minSentences} sentences after rebuilding; regenerate this article summary from evidence`);
    }

    if (output.keyPoints.length < QUALITY_RULES.tier1MinKeyPoints) {
      const fromSummary = extractSentences(output.summary, 6).map(v => extractShortSummary(v, isDeepRead ? 120 : 70));
      output.keyPoints = [...output.keyPoints, ...fromSummary].filter(Boolean).slice(0, maxKeyPoints);
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

    // Preserve the five-sentence requirement through assemble -> validate.
    if (isDeepRead) output.sourceType = 'deep-read';
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
    throw new Error('Summary output is not a JSON object');
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
    if (fetchData.editorialStatus === 'reviewed' && fetchTop.length) {
      throw new Error('Reviewed Tier1 summaries are missing; regenerate deep-read results without changing selection');
    }
    tier1Source = fetchTop.slice(0, 5);
  }
  if (tier2Source.length === 0) {
    const tier1Links = new Set(tier1Source.map(a => canonicalUrl(a.link)).filter(Boolean));
    const fallbackTier2 = fetchData.editorialStatus === 'reviewed'
      ? fetchOther : [...fetchTop.slice(5), ...fetchOther];
    tier2Source = fallbackTier2.filter(a => !tier1Links.has(canonicalUrl(a.link)));
  }

  const rawTier1 = tier1Source.map((a, idx) => normalizeTier1Item(a, idx + 1));
  const rawTier2 = tier2Source.map((a, idx) => normalizeTier2Item(a, idx + 1));
  const tier1Quality = enforceTier1Quality(rawTier1);
  const tier2Quality = enforceTier2Quality(rawTier2);
  const tier1 = tier1Quality.tier1;
  const tier2 = tier2Quality.tier2;
  const discoveredLinks = new Set([...fetchTop, ...fetchOther].filter(a => a.readingClass === 'newly-discovered-longform').map(a => a.link));
  for (const row of [...tier1, ...tier2]) {
    if (discoveredLinks.has(row.link) && !row.title.startsWith('【新发现长文】')) row.title = `【新发现长文】${row.title}`;
  }
  const sourceByLink = new Map(fetchTop.map(a => [a.link, a]));
  for (const row of tier1) {
    const original = sourceByLink.get(row.link);
    if (original?.source === 'AIHOT' || original?.fullContentMeta) {
      row.fullContentMeta = original.fullContentMeta || { summaryOnly: true, fetchedFrom: 'rss', label: '仅基于摘要' };
      row.origin = original.origin || null;
      if (row.fullContentMeta.summaryOnly || (original.source === 'AIHOT' && row.fullContentMeta.fetchedFrom !== 'original-web')) {
        if (!row.title.startsWith('【仅基于摘要】')) row.title = `【仅基于摘要】${row.title}`;
        if (!row.risk.includes('仅基于摘要')) row.risk = `仅基于摘要，未取得原文。${row.risk}`;
      }
    }
  }
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

  if (summary.totalArticles === 0) {
    const computed = computeSummary(tier1, tier2);
    summary.totalArticles = computed.totalArticles;
    summary.categories = computed.categories;
  }

  return {
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
        warnings: [...new Set([
          ...(Array.isArray(data.metadata?.qualityGates?.warnings)
            ? data.metadata.qualityGates.warnings.filter(w => typeof w === 'string') : []),
          ...tier1Quality.warnings, ...tier2Quality.warnings
        ])]
      }
    }
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    buildPromptArticles,
    buildPrompt,
    extractJson,
    ensureSummaryShape,
    enforceTier1Quality,
    enforceTier2Quality,
    inferCategory,
    cleanText,
    decodeHtmlEntities,
    QUALITY_RULES,
    TEMPLATE_HINTS,
    getTemplateHints,
    buildDeepReadPrompt,
    normalizeDeepReadResult,
    normalizeTemplateName
  };
}
