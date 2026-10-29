/**
 * Output Formatter for RSS Digest
 *
 * 输出三种基础格式：md（Markdown）、html、json
 * 渠道适配由下游（如 universal-deliver）负责。
 *
 * @author RSS Digest Skill
 */

const { assertLinks, unmark } = require('./content-contract');
const fs = require('fs');
const path = require('path');
const { parseCliArgs } = require('./cli-utils');
const { decodeHtmlEntities } = require('./summary-utils');

// ==================== 工具函数 ====================

const CATEGORY_KEYS = ['编程', 'AI', '系统', '硬件', '安全', '创业', '综合'];

function cleanText(text, maxLen = null) {
  const cleaned = decodeHtmlEntities(String(text || ''))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned;
}

function ensureCategory(value) {
  return CATEGORY_KEYS.includes(value) ? value : '综合';
}

function flattenByCategory(byCategory) {
  if (!byCategory || typeof byCategory !== 'object' || Array.isArray(byCategory)) return [];
  const rows = [];
  Object.entries(byCategory).forEach(([category, articles]) => {
    if (!Array.isArray(articles)) return;
    articles.forEach((item, index) => {
      rows.push({
        rank: Number.isFinite(Number(item.rank)) ? Number(item.rank) : index + 1,
        title: cleanText(item.title || 'Untitled', 200),
        link: String(item.link || '').trim(),
        source: cleanText(item.source || 'unknown', 80),
        category: ensureCategory(category),
        oneLiner: cleanText(item.oneLiner || item.summary || '', 140)
      });
    });
  });
  return rows;
}

function groupTier2ByCategory(tier2) {
  const grouped = {};
  tier2.forEach((item) => {
    const category = ensureCategory(item.category);
    if (!grouped[category]) grouped[category] = [];
    grouped[category].push({
      title: cleanText(item.title || 'Untitled', 200),
      link: String(item.link || '').trim(),
      source: cleanText(item.source || 'unknown', 80),
      oneLiner: cleanText(item.oneLiner || item.summary || '', 140)
    });
  });
  return grouped;
}

function computeSummary(tier1, tier2) {
  const categories = {};
  CATEGORY_KEYS.forEach((key) => { categories[key] = 0; });
  [...tier1, ...tier2].forEach((item) => {
    const key = ensureCategory(item.category);
    categories[key] += 1;
  });
  return {
    totalArticles: tier1.length + tier2.length,
    categories
  };
}

function summarizeQualityGates(rawQualityGates) {
  const qualityGates = rawQualityGates && typeof rawQualityGates === 'object' ? rawQualityGates : {};
  const warnings = Array.isArray(qualityGates.warnings)
    ? qualityGates.warnings.map(item => cleanText(item, 120)).filter(Boolean)
    : [];

  const counts = {};
  warnings.forEach((warning) => {
    const match = warning.match(/tier\d+\[\d+\]\s+(.+)/i);
    const kind = (match ? match[1] : warning).trim() || 'unknown';
    counts[kind] = (counts[kind] || 0) + 1;
  });

  const breakdown = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([kind, count]) => ({ kind, count }));

  const topText = breakdown.slice(0, 3).map(item => `${item.kind} x${item.count}`).join(', ');
  const text = warnings.length > 0
    ? `自动修复 ${warnings.length} 项（${topText}）`
    : '未触发自动修复。';

  return {
    applied: Boolean(qualityGates.applied),
    warningCount: warnings.length,
    breakdown,
    text
  };
}

function normalizeSummaryData(input) {
  const base = input && typeof input === 'object' ? input : {};
  let tier1 = Array.isArray(base.tier1) ? base.tier1 : [];
  let tier2 = Array.isArray(base.tier2) ? base.tier2 : [];
  let highlights = Array.isArray(base.highlights) ? base.highlights : [];
  let byCategory = base.byCategory && typeof base.byCategory === 'object' && !Array.isArray(base.byCategory)
    ? base.byCategory
    : {};

  if (tier1.length === 0 && highlights.length > 0) {
    tier1 = highlights.map(unmark).map((h, idx) => ({
      ...h,
      rank: Number.isFinite(Number(h.rank)) ? Number(h.rank) : idx + 1,
      title: cleanText(h.title || 'Untitled', 200),
      link: String(h.link || '').trim(),
      source: cleanText(h.source || 'unknown', 80),
      category: ensureCategory(h.category),
      summary: cleanText(h.summary || h.reason || '', 260),
      keyPoints: Array.isArray(h.keyPoints) ? h.keyPoints.slice(0, 5).map(v => cleanText(v, 80)) : [],
      action: cleanText(h.action || '', 120),
      risk: cleanText(h.risk || '', 120)
    }));
  }

  if (tier2.length === 0) {
    tier2 = flattenByCategory(byCategory);
  }

  tier1 = tier1.map(unmark).map((h, idx) => ({
    ...h,
    rank: Number.isFinite(Number(h.rank)) ? Number(h.rank) : idx + 1,
    title: cleanText(h.title || 'Untitled', 200),
    link: String(h.link || '').trim(),
    source: cleanText(h.source || 'unknown', 80),
    category: ensureCategory(h.category),
    summary: cleanText(h.summary || h.reason || '', 360),
    keyPoints: Array.isArray(h.keyPoints) ? h.keyPoints.slice(0, 5).map(v => cleanText(v, 80)).filter(Boolean) : [],
    action: cleanText(h.action || '', 120),
    risk: cleanText(h.risk || '', 120)
  }));

  tier2 = tier2.map((h, idx) => ({
    ...h,
    rank: Number.isFinite(Number(h.rank)) ? Number(h.rank) : idx + 1,
    title: cleanText(h.title || 'Untitled', 200),
    link: String(h.link || '').trim(),
    source: cleanText(h.source || 'unknown', 80),
    category: ensureCategory(h.category),
    oneLiner: cleanText(h.oneLiner || h.summary || '', 140)
  }));

  if (highlights.length === 0 && tier1.length > 0) {
    highlights = tier1.map((h) => ({
      ...h,
      rank: h.rank,
      title: h.title,
      link: h.link,
      source: h.source,
      category: h.category,
      reason: cleanText(h.summary || h.action || h.risk || '建议优先阅读该文。', 90),
      summary: h.summary,
      keyPoints: h.keyPoints,
      action: h.action,
      risk: h.risk
    }));
  } else {
    const tier1Lookup = new Map(tier1.map(item => [item.link || item.title, item]));
    highlights = highlights.map((h, idx) => {
      const key = String(h.link || h.title || '');
      const hit = tier1Lookup.get(key);
      return {
        ...h,
        fullContentMeta: hit?.fullContentMeta || h.fullContentMeta,
        origin: hit?.origin || h.origin,
        rank: Number.isFinite(Number(h.rank)) ? Number(h.rank) : idx + 1,
        title: cleanText(h.title || hit?.title || 'Untitled', 200),
        link: String(h.link || hit?.link || '').trim(),
        source: cleanText(h.source || hit?.source || 'unknown', 80),
        category: ensureCategory(h.category || hit?.category),
        reason: cleanText(h.reason || hit?.summary || '建议优先阅读该文。', 90),
        summary: cleanText(h.summary || hit?.summary || '', 360),
        keyPoints: Array.isArray(h.keyPoints) ? h.keyPoints.slice(0, 5).map(v => cleanText(v, 80)).filter(Boolean) : (hit?.keyPoints || []),
        action: cleanText(h.action || hit?.action || '', 120),
        risk: cleanText(h.risk || hit?.risk || '', 120)
      };
    });
  }

  if (Object.keys(byCategory).length === 0 && tier2.length > 0) {
    byCategory = groupTier2ByCategory(tier2);
  } else {
    byCategory = groupTier2ByCategory(flattenByCategory(byCategory));
  }

  const summary = base.summary && typeof base.summary === 'object'
    ? {
      totalArticles: Number.isFinite(Number(base.summary.totalArticles))
        ? Number(base.summary.totalArticles)
        : tier1.length + tier2.length,
      categories: CATEGORY_KEYS.reduce((acc, key) => {
        const value = base.summary?.categories?.[key];
        acc[key] = Number.isFinite(Number(value)) ? Number(value) : 0;
        return acc;
      }, {})
    }
    : computeSummary(tier1, tier2);

  if (!summary.totalArticles) {
    const computed = computeSummary(tier1, tier2);
    summary.totalArticles = computed.totalArticles;
    summary.categories = computed.categories;
  }

  highlights = highlights.map(unmark);
  const qualitySummary = summarizeQualityGates(base.metadata?.qualityGates);
  const mergedQualityGates = {
    ...(base.metadata?.qualityGates && typeof base.metadata.qualityGates === 'object'
      ? base.metadata.qualityGates
      : {}),
    summary: qualitySummary
  };

  return {
    ...base,
    date: cleanText(base.date || new Date().toISOString().slice(0, 10), 20),
    dailyAdvice: cleanText(base.dailyAdvice || '先读 Tier1 深度摘要，再按 Tier2 速览做取舍。', 120),
    metadata: base.metadata && typeof base.metadata === 'object'
      ? {
        ...base.metadata,
        generatedAt: base.metadata.generatedAt || new Date().toISOString(),
        qualityGates: mergedQualityGates
      }
      : {
        generatedAt: new Date().toISOString(),
        qualityGates: mergedQualityGates
      },
    tier1,
    tier2,
    highlights,
    byCategory,
    summary,
    otherTopArticles: Array.isArray(base.otherTopArticles) ? base.otherTopArticles : []
  };
}

function getQualityGateText(data) {
  return cleanText(data?.metadata?.qualityGates?.summary?.text || '', 220);
}

// ==================== 格式化函数 ====================

/**
 * 输出 Markdown 格式
 */
function publishable(rawData, display = false) {
  const data = normalizeSummaryData(rawData);
  assertLinks([...data.tier1, ...data.tier2, ...data.highlights,
    ...flattenByCategory(data.byCategory), ...(data.otherTopArticles || [])]);
  if (display) {
    data.highlights = data.highlights.map(row => row.fullContentMeta?.summaryOnly
      ? { ...row, title: `【仅基于摘要】${row.title}`, risk: `仅基于摘要，未取得原文。${row.risk || ''}` } : row);
  }
  return data;
}

function formatMarkdown(rawData) {
  const data = publishable(rawData, true);
  const qualityText = getQualityGateText(data);
  const highlights = Array.isArray(data.highlights) ? data.highlights : [];
  const byCategory = data.byCategory && typeof data.byCategory === 'object' ? data.byCategory : {};
  const otherTopArticles = Array.isArray(data.otherTopArticles) ? data.otherTopArticles : [];

  let md = `# 📰 每日科技阅读 (${data.date})\n\n`;

  // 统计
  const cats = data.summary.categories || {};
  md += `> 共 ${data.summary.totalArticles} 篇文章`;
  const catParts = CATEGORY_KEYS.filter(k => cats[k] > 0).map(k => `${k}: ${cats[k]}`);
  if (catParts.length > 0) md += ` | ${catParts.join(' | ')}`;
  md += '\n\n';

  // 今日建议
  md += `## 💡 今日建议\n\n${data.dailyAdvice}\n\n`;

  // 质量闸门
  if (qualityText) {
    md += `> 🧪 质量闸门：${qualityText}\n\n`;
  }

  // 深度推荐（Tier1）
  md += `## ⭐ 深度推荐\n\n`;
  highlights.forEach(h => {
    md += `### ${h.rank}. [${h.title}](${h.link})\n\n`;
    md += `📰 ${h.source} · ${h.category}\n\n`;
    md += `💡 ${h.reason}\n\n`;
    if (h.summary) md += `${h.summary}\n\n`;
    if (Array.isArray(h.keyPoints) && h.keyPoints.length > 0) {
      h.keyPoints.forEach(k => { md += `- ${k}\n`; });
      md += '\n';
    }
    if (h.action) md += `✅ **行动**：${h.action}\n\n`;
    if (h.risk) md += `⚠️ **风险**：${h.risk}\n\n`;
    md += '---\n\n';
  });

  // 分类速览（Tier2）
  Object.entries(byCategory).forEach(([category, articles]) => {
    if (articles.length === 0) return;
    md += `## ${category} (${articles.length}篇)\n\n`;
    articles.forEach(a => {
      md += `- [${a.title}](${a.link})  \n`;
      md += `  ${a.oneLiner} *(${a.source})*\n`;
    });
    md += '\n';
  });

  // 次级推荐
  if (otherTopArticles.length > 0) {
    md += `## 📌 次级推荐 (${otherTopArticles.length}篇)\n\n`;
    otherTopArticles.slice(0, 10).forEach((a, idx) => {
      md += `${idx + 1}. [${a.title}](${a.link}) — ${a.source}${a.score !== undefined ? ` · Score: ${a.score}` : ''}\n`;
    });
    md += '\n';
  }

  md += `---\n\n*由 RSS Digest 生成于 ${data.metadata.generatedAt}*\n`;
  return md;
}

/**
 * 输出 HTML 格式
 *
 * 设计原则：
 * - CSS 自定义属性定义颜色/间距，使用方可一键覆盖
 * - 语义化结构（article/section/header），便于进一步定制
 * - 内置样式保证最差也好看，不绑定任何渠道特定字段
 */
function formatHtml(rawData) {
  const data = publishable(rawData, true);
  const qualityText = getQualityGateText(data);
  const highlights = Array.isArray(data.highlights) ? data.highlights : [];
  const byCategory = data.byCategory && typeof data.byCategory === 'object' ? data.byCategory : {};
  const otherTopArticles = Array.isArray(data.otherTopArticles) ? data.otherTopArticles : [];

  const cats = data.summary.categories || {};
  const catParts = CATEGORY_KEYS.filter(k => cats[k] > 0).map(k => `${k}: ${cats[k]}`);
  const statsText = `共 ${data.summary.totalArticles} 篇文章${catParts.length > 0 ? ' | ' + catParts.join(' | ') : ''}`;

  const highlightsHtml = highlights.map(h => {
    const summaryHtml = h.summary ? `<p class="rsd-summary">${h.summary}</p>` : '';
    const keyPointsHtml = Array.isArray(h.keyPoints) && h.keyPoints.length > 0
      ? `<ul class="rsd-keypoints">${h.keyPoints.map(k => `<li>${k}</li>`).join('')}</ul>`
      : '';
    const actionHtml = h.action ? `<p class="rsd-action">✅ ${h.action}</p>` : '';
    const riskHtml = h.risk ? `<p class="rsd-risk">⚠️ ${h.risk}</p>` : '';
    return `
    <article class="rsd-highlight">
      <h3 class="rsd-highlight-title"><a href="${h.link}">${h.rank}. ${h.title}</a></h3>
      <p class="rsd-meta">📰 ${h.source} · <span class="rsd-category">${h.category}</span></p>
      <p class="rsd-reason">💡 ${h.reason}</p>
      ${summaryHtml}${keyPointsHtml}${actionHtml}${riskHtml}
    </article>`;
  }).join('\n');

  const categoriesHtml = Object.entries(byCategory).map(([category, articles]) => {
    if (articles.length === 0) return '';
    const articlesHtml = articles.map(a => `
      <li class="rsd-article">
        <a href="${a.link}">${a.title}</a>
        <span class="rsd-meta"> — ${a.source}</span>
        <p class="rsd-oneliner">${a.oneLiner}</p>
      </li>`).join('');
    return `
    <section class="rsd-category-section">
      <h3 class="rsd-category-title">${category} <span class="rsd-count">(${articles.length}篇)</span></h3>
      <ul class="rsd-article-list">${articlesHtml}</ul>
    </section>`;
  }).join('\n');

  const otherTopHtml = otherTopArticles.length > 0
    ? `
    <section class="rsd-other-top">
      <h2>📌 次级推荐 <span class="rsd-count">(${otherTopArticles.length}篇)</span></h2>
      <ol class="rsd-article-list">
        ${otherTopArticles.slice(0, 10).map(a => `
        <li class="rsd-article">
          <a href="${a.link}">${a.title}</a>
          <span class="rsd-meta"> — ${a.source}${a.score !== undefined ? ` · Score: ${a.score}` : ''}</span>
        </li>`).join('')}
      </ol>
    </section>`
    : '';

  const qualityHtml = qualityText
    ? `<p class="rsd-quality-gate">🧪 质量闸门：${qualityText}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>每日科技阅读 (${data.date})</title>
  <style>
    /* ── CSS 自定义属性：使用方可覆盖 ── */
    :root {
      --rsd-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      --rsd-color-bg: #f7f7f8;
      --rsd-color-surface: #ffffff;
      --rsd-color-primary: #0066cc;
      --rsd-color-text: #1a1a1a;
      --rsd-color-text-muted: #666;
      --rsd-color-accent: #e65100;
      --rsd-color-highlight-bg: #fff8e1;
      --rsd-color-highlight-border: #ffe082;
      --rsd-color-action: #2e7d32;
      --rsd-color-risk: #c62828;
      --rsd-radius: 8px;
      --rsd-max-width: 680px;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --rsd-color-bg: #111;
        --rsd-color-surface: #1e1e1e;
        --rsd-color-primary: #66b3ff;
        --rsd-color-text: #e0e0e0;
        --rsd-color-text-muted: #999;
        --rsd-color-accent: #ff9966;
        --rsd-color-highlight-bg: #2a2000;
        --rsd-color-highlight-border: #665500;
        --rsd-color-action: #66bb6a;
        --rsd-color-risk: #ef9a9a;
      }
    }

    /* ── 基础 ── */
    body {
      font-family: var(--rsd-font);
      background: var(--rsd-color-bg);
      color: var(--rsd-color-text);
      line-height: 1.65;
      margin: 0;
      padding: 24px 16px;
    }
    .rsd-container {
      max-width: var(--rsd-max-width);
      margin: 0 auto;
      background: var(--rsd-color-surface);
      border-radius: var(--rsd-radius);
      padding: 32px;
      box-shadow: 0 2px 12px rgba(0,0,0,.08);
    }
    a { color: var(--rsd-color-primary); text-decoration: none; }
    a:hover { text-decoration: underline; }
    h1 { font-size: 1.5rem; margin: 0 0 8px; border-bottom: 3px solid var(--rsd-color-primary); padding-bottom: 12px; }
    h2 { font-size: 1.15rem; margin: 32px 0 12px; color: var(--rsd-color-primary); }
    h3 { font-size: 1rem; margin: 0 0 6px; }
    ul, ol { padding-left: 1.4em; margin: 8px 0; }
    li { margin: 4px 0; }

    /* ── 统计 & 建议 ── */
    .rsd-stats { font-size: .85rem; color: var(--rsd-color-text-muted); margin-bottom: 16px; }
    .rsd-advice { border-left: 4px solid var(--rsd-color-primary); padding: 10px 16px; margin: 16px 0; font-style: italic; background: color-mix(in srgb, var(--rsd-color-primary) 8%, transparent); border-radius: 0 var(--rsd-radius) var(--rsd-radius) 0; }
    .rsd-quality-gate { font-size: .82rem; color: var(--rsd-color-text-muted); margin: 8px 0 16px; }

    /* ── 深度推荐 ── */
    .rsd-highlight { background: var(--rsd-color-highlight-bg); border: 1px solid var(--rsd-color-highlight-border); border-radius: var(--rsd-radius); padding: 16px 20px; margin: 12px 0; }
    .rsd-highlight-title a { color: var(--rsd-color-accent); font-size: 1rem; font-weight: 600; }
    .rsd-meta { font-size: .82rem; color: var(--rsd-color-text-muted); margin: 4px 0; }
    .rsd-category { font-weight: 500; }
    .rsd-reason { color: var(--rsd-color-accent); font-size: .9rem; font-weight: 500; margin: 6px 0; }
    .rsd-summary { font-size: .9rem; margin: 6px 0; }
    .rsd-keypoints { font-size: .88rem; margin: 6px 0; }
    .rsd-action { font-size: .88rem; color: var(--rsd-color-action); margin: 4px 0; }
    .rsd-risk { font-size: .88rem; color: var(--rsd-color-risk); margin: 4px 0; }

    /* ── 分类速览 ── */
    .rsd-category-section { margin: 20px 0; }
    .rsd-category-title { font-size: 1rem; color: var(--rsd-color-primary); border-bottom: 1px solid color-mix(in srgb, var(--rsd-color-primary) 20%, transparent); padding-bottom: 6px; margin-bottom: 10px; }
    .rsd-count { font-weight: normal; font-size: .85rem; color: var(--rsd-color-text-muted); }
    .rsd-article-list { list-style: none; padding: 0; }
    .rsd-article { padding: 8px 0; border-bottom: 1px solid color-mix(in srgb, var(--rsd-color-text) 8%, transparent); }
    .rsd-article:last-child { border-bottom: none; }
    .rsd-oneliner { font-size: .85rem; color: var(--rsd-color-text-muted); margin: 2px 0 0; }

    /* ── 页脚 ── */
    .rsd-footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid color-mix(in srgb, var(--rsd-color-text) 12%, transparent); font-size: .8rem; color: var(--rsd-color-text-muted); text-align: center; }
  </style>
</head>
<body>
  <div class="rsd-container">
    <header>
      <h1>📰 每日科技阅读 (${data.date})</h1>
      <p class="rsd-stats">${statsText}</p>
    </header>

    <div class="rsd-advice">${data.dailyAdvice}</div>
    ${qualityHtml}

    <section class="rsd-highlights">
      <h2>⭐ 深度推荐</h2>
      ${highlightsHtml}
    </section>

    <section class="rsd-categories">
      ${categoriesHtml}
    </section>

    ${otherTopHtml}

    <footer class="rsd-footer">
      由 RSS Digest 生成于 ${data.metadata.generatedAt}
    </footer>
  </div>
</body>
</html>`;
}

/**
 * 输出 JSON 格式（归一化后的结构化数据）
 */
function formatJson(rawData) {
  return publishable(rawData);
}

// ==================== 主函数 ====================

async function main({ params }) {
  const { summaryData, format = 'md' } = params || {};

  if (!summaryData) {
    return { error: 'Missing summaryData' };
  }

  let result;
  switch (format) {
    case 'md':
    case 'markdown':
      result = formatMarkdown(summaryData);
      break;
    case 'html':
      result = formatHtml(summaryData);
      break;
    case 'json':
      result = formatJson(summaryData);
      break;
    default:
      return { error: `Unknown format: ${format}. Supported: md, html, json` };
  }

  return { result };
}

// ==================== 导出 ====================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    main,
    normalizeSummaryData,
    formatMarkdown,
    formatHtml,
    formatJson
  };
}

if (typeof exports !== 'undefined') {
  exports.main = main;
}

if (require.main === module) {
  (async () => {
    const args = parseCliArgs(process.argv);
    if (!args.input) {
      throw new Error('Missing required value: input');
    }
    const inputFile = path.resolve(args.input);
    const format = args.format || 'md';
    const outFile = args.outFile ? path.resolve(args.outFile) : null;
    const summaryData = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

    const { result, error } = await main({ params: { summaryData, format } });
    if (error) {
      process.stderr.write(`${error}\n`);
      process.exit(1);
    }

    const outputText = typeof result === 'string' ? result : `${JSON.stringify(result, null, 2)}\n`;
    if (outFile) {
      fs.mkdirSync(path.dirname(outFile), { recursive: true });
      fs.writeFileSync(outFile, outputText);
      process.stdout.write(`${outFile}\n`);
      return;
    }
    process.stdout.write(outputText);
  })().catch((error) => {
    process.stderr.write(`${String(error.message || error)}\n`);
    process.exit(1);
  });
}
