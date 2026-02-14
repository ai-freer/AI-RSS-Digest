/**
 * Output Formatter for RSS Digest
 *
 * 用于自动化流程的输出格式化脚本
 * 支持邮件、飞书、钉钉、企业微信、WhatsApp 等多种输出格式
 *
 * @author RSS Digest Skill
 * @version 2.2.0
 */

// ==================== 邮件 HTML 模板 ====================

const EMAIL_HTML_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    /* 响应式设计 */
    @media (max-width: 600px) {
      .container { padding: 10px !important; }
      .highlight { padding: 12px !important; }
      .article { padding: 8px !important; }
    }

    /* 深色模式支持 */
    @media (prefers-color-scheme: dark) {
      body { background: #1a1a1a !important; color: #e0e0e0 !important; }
      .highlight { background: #2d2d2d !important; }
      .article { background: #252525 !important; }
      .category h3 { border-color: #444 !important; color: #66b3ff !important; }
      h1 { color: #fff !important; border-color: #66b3ff !important; }
      .advice { background: #1a2f4a !important; border-color: #66b3ff !important; }
      a { color: #66b3ff !important; }
      .source { color: #999 !important; }
      .reason { color: #ff9966 !important; }
      .oneliner { color: #ccc !important; }
      .footer { border-color: #444 !important; color: #777 !important; }
    }

    /* 基础样式 */
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background: #f5f5f5;
    }
    .container {
      background: #fff;
      border-radius: 8px;
      padding: 30px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    h1 {
      color: #1a1a1a;
      border-bottom: 3px solid #0066cc;
      padding-bottom: 15px;
      margin-top: 0;
      font-size: 24px;
    }
    h2 {
      color: #333;
      font-size: 18px;
      margin-top: 30px;
      margin-bottom: 15px;
    }
    .advice {
      background: #f0f7ff;
      border-left: 4px solid #0066cc;
      padding: 15px 20px;
      margin: 20px 0;
      font-style: italic;
      color: #444;
      border-radius: 0 8px 8px 0;
    }
    .highlight {
      background: #fff8e1;
      border-radius: 8px;
      padding: 15px 20px;
      margin: 15px 0;
      border: 1px solid #ffe082;
    }
    .highlight-title {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 8px;
    }
    .highlight-title a {
      color: #e65100;
      text-decoration: none;
    }
    .highlight-title a:hover {
      text-decoration: underline;
    }
    .category {
      margin: 25px 0;
    }
    .category h3 {
      color: #0066cc;
      border-bottom: 2px solid #e0e0e0;
      padding-bottom: 8px;
      font-size: 16px;
      margin-bottom: 12px;
    }
    .article {
      margin: 10px 0;
      padding: 12px;
      background: #fafafa;
      border-radius: 6px;
      border-left: 3px solid #ddd;
    }
    .article-title {
      font-weight: 500;
      margin-bottom: 5px;
    }
    .article-title a {
      color: #0066cc;
      text-decoration: none;
    }
    .article-title a:hover {
      text-decoration: underline;
    }
    .source {
      color: #666;
      font-size: 12px;
      margin-top: 5px;
    }
    .reason {
      color: #d84315;
      font-size: 13px;
      margin-top: 8px;
      font-weight: 500;
    }
    .oneliner {
      color: #555;
      font-size: 13px;
      margin-top: 5px;
      line-height: 1.5;
    }
    .stats {
      background: #f5f5f5;
      padding: 10px 15px;
      border-radius: 6px;
      font-size: 13px;
      color: #666;
      margin: 20px 0;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e0e0e0;
      color: #999;
      font-size: 12px;
      text-align: center;
    }
    .footer a {
      color: #999;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>📰 每日科技阅读 ({{date}})</h1>

    <div class="stats">
      共 {{summary.totalArticles}} 篇文章 |
      编程: {{summary.categories.编程}} |
      AI: {{summary.categories.AI}} |
      系统: {{summary.categories.系统}} |
      硬件: {{summary.categories.硬件}} |
      安全: {{summary.categories.安全}} |
      创业: {{summary.categories.创业}} |
      综合: {{summary.categories.综合}}
    </div>

    <div class="advice">{{dailyAdvice}}</div>

    <!-- 深度风格/商业风格的额外字段 -->
    {{trendInsight}}
    {{marketTrend}}

    <h2>⭐ 深度推荐</h2>
    {{#each highlights}}
    <div class="highlight">
      <div class="highlight-title">
        <strong>#{{rank}}</strong> <a href="{{link}}">{{title}}</a>
      </div>
      <div class="source">📰 {{source}} · {{category}}</div>
      <div class="reason">💡 {{reason}}</div>
    </div>
    {{/each}}

    {{#each byCategory}}
    <div class="category">
      <h3>{{@key}} ({{this.length}}篇)</h3>
      {{#each this}}
      <div class="article">
        <div class="article-title"><a href="{{link}}">{{title}}</a></div>
        <div class="source">📰 {{source}}</div>
        <div class="oneliner">{{oneLiner}}</div>
      </div>
      {{/each}}
    </div>
    {{/each}}

    {{otherTopSection}}

    <div class="footer">
      由 RSS Digest 生成于 {{metadata.generatedAt}}<br>
      <a href="{{unsubscribeLink}}">取消订阅</a>
    </div>
  </div>
</body>
</html>`;

// ==================== 邮件纯文本模板 ====================

const EMAIL_TEXT_TEMPLATE = `📰 每日科技阅读 ({{date}})

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
今日建议
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{{dailyAdvice}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⭐ 深度推荐
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{{#each highlights}}
#{{rank}}. {{title}}
   链接: {{link}}
   来源: {{source}} · {{category}}
   推荐: {{reason}}

{{/each}}
{{#each byCategory}}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{{@key}} ({{this.length}}篇)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{{#each this}}
· {{title}}
  {{link}}
  {{oneLiner}} ({{source}})

{{/each}}
{{/each}}
{{otherTopSection}}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
由 RSS Digest 生成于 {{metadata.generatedAt}}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

// ==================== 飞书卡片模板 ====================

const FEISHU_TEMPLATE = {
  msg_type: "interactive",
  card: {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: "plain_text", content: "📰 每日科技阅读 ({{date}})" },
      template: "blue"
    },
    elements: [
      // 统计信息
      {
        tag: "div",
        text: {
          tag: "lark_md",
          content: "**📊 今日概览**\n共 {{summary.totalArticles}} 篇文章 | 编程: {{summary.categories.编程}} | AI: {{summary.categories.AI}} | 系统: {{summary.categories.系统}} | 硬件: {{summary.categories.硬件}} | 安全: {{summary.categories.安全}} | 创业: {{summary.categories.创业}} | 综合: {{summary.categories.综合}}"
        }
      },
      { tag: "hr" },
      // 今日建议
      {
        tag: "div",
        text: { tag: "lark_md", content: "**💡 今日建议**\n{{dailyAdvice}}" }
      },
      { tag: "hr" },
      // 深度推荐标题
      {
        tag: "div",
        text: { tag: "lark_md", content: "**⭐ 深度推荐**" }
      }
      // 精选文章将在代码中动态添加
    ]
  }
};

// ==================== 钉钉 Markdown 模板 ====================

const DINGTALK_TEMPLATE = `# 📰 每日科技阅读 ({{date}})

> **📊 今日概览**
> 共 {{summary.totalArticles}} 篇文章
> 编程: {{summary.categories.编程}} | AI: {{summary.categories.AI}} | 系统: {{summary.categories.系统}} | 硬件: {{summary.categories.硬件}} | 安全: {{summary.categories.安全}} | 创业: {{summary.categories.创业}} | 综合: {{summary.categories.综合}}

---

## 💡 今日建议

{{dailyAdvice}}

---

## ⭐ 深度推荐

{{#each highlights}}
**{{rank}}.** [{{title}}]({{link}})
📰 {{source}} · {{category}}
💡 {{reason}}

{{/each}}

---
{{#each byCategory}}
## {{@key}} ({{this.length}}篇)

{{#each this}}
- [{{title}}]({{link}})
  > {{oneLiner}}
  > 📰 {{source}}

{{/each}}
---
{{/each}}

*由 RSS Digest 生成于 {{metadata.generatedAt}}*`;

// ==================== 企业微信模板 ====================

const WECOM_TEMPLATE = `📰 每日科技阅读 ({{date}})

💡 {{dailyAdvice}}

⭐ 深度推荐:
{{#each highlights}}
{{rank}}. {{title}}
{{link}}
{{/each}}

📊 分类速览:
{{#each byCategory}}
{{@key}}({{this.length}}篇):
{{#each this}}
· {{title}}
{{/each}}

{{/each}}

生成于 {{metadata.generatedAt}}`;

// ==================== Webhook JSON 模板 ====================

const WEBHOOK_TEMPLATE = {
  version: "2.2.0",
  timestamp: "{{metadata.generatedAt}}",
  type: "rss_digest",
  data: {
    date: "{{date}}",
    summary: "{{summary}}",
    highlights: "{{highlights}}",
    byCategory: "{{byCategory}}",
    dailyAdvice: "{{dailyAdvice}}"
  }
};

// ==================== 格式化函数 ====================

const DEFAULT_WHATSAPP_MAX_LENGTH = 4096;
const DEFAULT_WECOM_SAFE_MAX_LENGTH = 1800;

/**
 * 简单的模板引擎
 */
function renderTemplate(template, data) {
  let result = template;

  // 处理 {{variable}}
  result = result.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return data[key] !== undefined ? data[key] : match;
  });

  // 处理 {{#each array}} ... {{/each}}
  result = result.replace(/\{\{#each (\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (match, arrayKey, content) => {
    const array = data[arrayKey];
    if (!Array.isArray(array)) return '';

    return array.map((item, index) => {
      let itemContent = content;
      // 替换 {{property}}
      itemContent = itemContent.replace(/\{\{(\w+)\}\}/g, (m, k) => item[k] !== undefined ? item[k] : m);
      // 替换 {{@key}} 和 {{@index}}
      itemContent = itemContent.replace(/\{\{@key\}\}/g, Object.keys(data[arrayKey])[index] || '');
      itemContent = itemContent.replace(/\{\{@index\}\}/g, index);
      return itemContent;
    }).join('');
  });

  // 处理对象的 {{#each}}
  result = result.replace(/\{\{#each (\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (match, objKey, content) => {
    const obj = data[objKey];
    if (typeof obj !== 'object' || Array.isArray(obj)) return '';

    return Object.entries(obj).map(([key, items]) => {
      let itemContent = content;
      itemContent = itemContent.replace(/\{\{@key\}\}/g, key);
      itemContent = itemContent.replace(/\{\{this\.length\}\}/g, items.length);

      // 处理嵌套的 {{#each this}}
      itemContent = itemContent.replace(/\{\{#each this\}\}([\s\S]*?)\{\{\/each\}\}/g, (m, c) => {
        if (!Array.isArray(items)) return '';
        return items.map(subItem => {
          let subContent = c;
          subContent = subContent.replace(/\{\{(\w+)\}\}/g, (sm, sk) => subItem[sk] !== undefined ? subItem[sk] : sm);
          return subContent;
        }).join('');
      });

      return itemContent;
    }).join('');
  });

  return result;
}

/**
 * 按段落优先切分长消息，并在末尾追加分页标记 (1/3)
 */
function splitMessage(text, maxLength) {
  if (typeof text !== 'string') return [];
  if (!Number.isInteger(maxLength) || maxLength < 32) {
    throw new Error('splitMessage requires maxLength >= 32');
  }
  if (text.length <= maxLength) return [text];

  const chunks = [];
  const paragraphs = text.split(/\n{2,}/).filter(Boolean);
  let current = '';

  const flushCurrent = () => {
    if (current) {
      chunks.push(current);
      current = '';
    }
  };

  const appendWithLimit = (segment) => {
    const normalized = String(segment || '').trim();
    if (!normalized) return;

    if (!current) {
      if (normalized.length <= maxLength) {
        current = normalized;
        return;
      }
      // 段落本身超长：按行+字符兜底切分
      const lines = normalized.split('\n');
      let longPart = '';
      lines.forEach((line) => {
        const candidate = longPart ? `${longPart}\n${line}` : line;
        if (candidate.length <= maxLength) {
          longPart = candidate;
          return;
        }
        if (longPart) {
          chunks.push(longPart);
        }
        longPart = '';
        let rest = line;
        while (rest.length > maxLength) {
          chunks.push(rest.slice(0, maxLength));
          rest = rest.slice(maxLength);
        }
        longPart = rest;
      });
      if (longPart) {
        current = longPart;
      }
      return;
    }

    const candidate = `${current}\n\n${normalized}`;
    if (candidate.length <= maxLength) {
      current = candidate;
      return;
    }

    flushCurrent();
    appendWithLimit(normalized);
  };

  paragraphs.forEach(appendWithLimit);
  flushCurrent();

  if (chunks.length <= 1) return chunks;
  const total = chunks.length;
  return chunks.map((chunk, idx) => {
    const suffix = ` (${idx + 1}/${total})`;
    if (chunk.length + suffix.length <= maxLength) {
      return `${chunk}${suffix}`;
    }
    return `${chunk.slice(0, maxLength - suffix.length)}${suffix}`;
  });
}

/**
 * 格式化飞书卡片
 */
function formatFeishuCard(data) {
  const highlights = Array.isArray(data.highlights) ? data.highlights : [];
  const byCategory = data.byCategory && typeof data.byCategory === 'object' ? data.byCategory : {};
  const otherTopArticles = Array.isArray(data.otherTopArticles) ? data.otherTopArticles : [];
  const card = JSON.parse(JSON.stringify(FEISHU_TEMPLATE));

  // 设置标题
  card.card.header.title.content = `📰 每日科技阅读 (${data.date})`;

  // 构建 elements
  const elements = [];

  // 统计信息
  elements.push({
    tag: "div",
    text: {
      tag: "lark_md",
      content: `**📊 今日概览**\n共 ${data.summary.totalArticles} 篇文章 | 编程: ${data.summary.categories.编程 || 0} | AI: ${data.summary.categories.AI || 0} | 系统: ${data.summary.categories.系统 || 0} | 硬件: ${data.summary.categories.硬件 || 0} | 安全: ${data.summary.categories.安全 || 0} | 创业: ${data.summary.categories.创业 || 0} | 综合: ${data.summary.categories.综合 || 0}`
    }
  });
  elements.push({ tag: "hr" });

  // 今日建议
  elements.push({
    tag: "div",
    text: { tag: "lark_md", content: `**💡 今日建议**\n${data.dailyAdvice}` }
  });
  elements.push({ tag: "hr" });

  // 深度推荐
  elements.push({
    tag: "div",
    text: { tag: "lark_md", content: "**⭐ 深度推荐**" }
  });

  highlights.forEach(h => {
    elements.push({
      tag: "div",
      text: {
        tag: "lark_md",
        content: `**#${h.rank}** [${h.title}](${h.link})\n📰 ${h.source} · ${h.category}\n💡 ${h.reason}`
      }
    });
    elements.push({ tag: "hr" });
  });

  // 分类速览
  Object.entries(byCategory).forEach(([category, articles]) => {
    if (articles.length === 0) return;

    elements.push({
      tag: "div",
      text: { tag: "lark_md", content: `**📂 ${category} (${articles.length}篇)**` }
    });

    articles.slice(0, 5).forEach(a => {
      elements.push({
        tag: "div",
        text: {
          tag: "lark_md",
          content: `· [${a.title}](${a.link})\n  ${a.oneLiner}`
        }
      });
    });

    if (articles.length > 5) {
      elements.push({
        tag: "div",
        text: { tag: "lark_md", content: `*...还有 ${articles.length - 5} 篇*` }
      });
    }

    elements.push({ tag: "hr" });
  });

  if (otherTopArticles.length > 0) {
    elements.push({
      tag: "div",
      text: { tag: "lark_md", content: `**📌 次级推荐 (${otherTopArticles.length}篇)**` }
    });
    otherTopArticles.slice(0, 10).forEach((a, idx) => {
      elements.push({
        tag: "div",
        text: {
          tag: "lark_md",
          content: `${idx + 1}. [${a.title}](${a.link})\n📰 ${a.source}${a.score !== undefined ? ` · Score: ${a.score}` : ''}`
        }
      });
    });
    elements.push({ tag: "hr" });
  }

  // 页脚
  elements.push({
    tag: "div",
    text: {
      tag: "lark_md",
      content: `*由 RSS Digest 生成于 ${data.metadata.generatedAt}*`
    }
  });

  card.card.elements = elements;
  return card;
}

/**
 * 格式化钉钉消息
 */
function formatDingtalk(data) {
  const highlights = Array.isArray(data.highlights) ? data.highlights : [];
  const byCategory = data.byCategory && typeof data.byCategory === 'object' ? data.byCategory : {};
  const otherTopArticles = Array.isArray(data.otherTopArticles) ? data.otherTopArticles : [];
  let markdown = `# 📰 每日科技阅读 (${data.date})\n\n`;

  // 统计
  markdown += `> **📊 今日概览**\n`;
  markdown += `> 共 ${data.summary.totalArticles} 篇文章\n`;
  markdown += `> 编程: ${data.summary.categories.编程 || 0} | AI: ${data.summary.categories.AI || 0} | 系统: ${data.summary.categories.系统 || 0} | 硬件: ${data.summary.categories.硬件 || 0} | 安全: ${data.summary.categories.安全 || 0} | 创业: ${data.summary.categories.创业 || 0} | 综合: ${data.summary.categories.综合 || 0}\n\n`;
  markdown += `---\n\n`;

  // 今日建议
  markdown += `## 💡 今日建议\n\n${data.dailyAdvice}\n\n---\n\n`;

  // 深度推荐
  markdown += `## ⭐ 深度推荐\n\n`;
  highlights.forEach(h => {
    markdown += `**${h.rank}.** [${h.title}](${h.link})\n`;
    markdown += `📰 ${h.source} · ${h.category}\n`;
    markdown += `💡 ${h.reason}\n\n`;
  });
  markdown += `---\n\n`;

  // 分类
  Object.entries(byCategory).forEach(([category, articles]) => {
    if (articles.length === 0) return;

    markdown += `## ${category} (${articles.length}篇)\n\n`;
    articles.forEach(a => {
      markdown += `- [${a.title}](${a.link})\n`;
      markdown += `  > ${a.oneLiner}\n`;
      markdown += `  > 📰 ${a.source}\n\n`;
    });
    markdown += `---\n\n`;
  });

  if (otherTopArticles.length > 0) {
    markdown += `## 📌 次级推荐 (${otherTopArticles.length}篇)\n\n`;
    otherTopArticles.slice(0, 10).forEach((a, idx) => {
      markdown += `${idx + 1}. [${a.title}](${a.link})\n`;
      markdown += `   > 📰 ${a.source}${a.score !== undefined ? ` · Score: ${a.score}` : ''}\n`;
    });
    markdown += `\n---\n\n`;
  }

  markdown += `*由 RSS Digest 生成于 ${data.metadata.generatedAt}*`;

  return {
    msgtype: "markdown",
    markdown: { title: `每日科技阅读 (${data.date})`, text: markdown }
  };
}

/**
 * 格式化企业微信消息
 */
function formatWecom(data) {
  const highlights = Array.isArray(data.highlights) ? data.highlights : [];
  const byCategory = data.byCategory && typeof data.byCategory === 'object' ? data.byCategory : {};
  const otherTopArticles = Array.isArray(data.otherTopArticles) ? data.otherTopArticles : [];
  let text = `📰 每日科技阅读 (${data.date})\n\n`;
  text += `💡 ${data.dailyAdvice}\n\n`;
  text += `⭐ 深度推荐:\n`;

  highlights.forEach(h => {
    text += `${h.rank}. ${h.title}\n${h.link}\n\n`;
  });

  text += `📊 分类速览:\n`;
  Object.entries(byCategory).forEach(([category, articles]) => {
    if (articles.length === 0) return;
    text += `${category}(${articles.length}篇):\n`;
    articles.slice(0, 3).forEach(a => {
      text += `· ${a.title}\n`;
    });
    if (articles.length > 3) {
      text += `...还有${articles.length - 3}篇\n`;
    }
    text += `\n`;
  });

  if (otherTopArticles.length > 0) {
    text += `📌 次级推荐(${otherTopArticles.length}篇):\n`;
    otherTopArticles.slice(0, 5).forEach((a, idx) => {
      text += `${idx + 1}. ${a.title}\n`;
    });
    text += `\n`;
  }

  text += `生成于 ${data.metadata.generatedAt}`;

  const chunks = splitMessage(text, DEFAULT_WECOM_SAFE_MAX_LENGTH);

  return {
    msgtype: "text",
    text: { content: text },
    chunks
  };
}

/**
 * 格式化 WhatsApp 消息
 */
function formatWhatsApp(data) {
  const highlights = Array.isArray(data.highlights) ? data.highlights : [];
  const byCategory = data.byCategory && typeof data.byCategory === 'object' ? data.byCategory : {};
  const otherTopArticles = Array.isArray(data.otherTopArticles) ? data.otherTopArticles : [];

  let text = `*📰 每日科技阅读 (${data.date})*\n\n`;
  text += `*💡 今日建议*\n${data.dailyAdvice}\n\n`;
  text += `*⭐ 深度推荐*\n`;

  highlights.forEach(h => {
    text += `*${h.rank}.* ${h.title}\n`;
    text += `${h.link}\n`;
    text += `_📰 ${h.source} · ${h.category}_\n`;
    text += `\`${h.reason}\`\n\n`;
  });

  text += `*📊 分类速览*\n`;
  Object.entries(byCategory).forEach(([category, articles]) => {
    if (articles.length === 0) return;
    text += `\n*${category} (${articles.length}篇)*\n`;
    articles.slice(0, 3).forEach((a, idx) => {
      text += `${idx + 1}. ${a.title}\n${a.link}\n`;
    });
    if (articles.length > 3) {
      text += `...还有 ${articles.length - 3} 篇\n`;
    }
  });

  if (otherTopArticles.length > 0) {
    text += `\n*📌 次级推荐 (${otherTopArticles.length}篇)*\n`;
    otherTopArticles.slice(0, 5).forEach((a, idx) => {
      text += `${idx + 1}. ${a.title}\n${a.link}\n`;
    });
  }

  text += `\n_生成于 ${data.metadata.generatedAt}_`;

  const messages = splitMessage(text, DEFAULT_WHATSAPP_MAX_LENGTH);
  return {
    messaging_product: "whatsapp",
    messages: messages.map(message => ({
      type: "text",
      text: {
        preview_url: true,
        body: message
      }
    }))
  };
}

/**
 * 格式化邮件 HTML
 */
function formatEmailHtml(data) {
  const highlights = Array.isArray(data.highlights) ? data.highlights : [];
  const byCategory = data.byCategory && typeof data.byCategory === 'object' ? data.byCategory : {};
  const otherTopArticles = Array.isArray(data.otherTopArticles) ? data.otherTopArticles : [];
  let html = EMAIL_HTML_TEMPLATE;

  // 替换简单变量
  html = html.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (key === 'highlights' || key === 'byCategory' || key === 'summary') return match;
    return data[key] !== undefined ? data[key] : match;
  });

  // 处理可选字段：趋势洞察（深度风格）
  if (data.trendInsight) {
    html = html.replace(/\{\{trendInsight\}\}/, `<div class="trend-insight"><strong>📊 趋势洞察:</strong> ${data.trendInsight}</div>`);
  } else {
    html = html.replace(/\{\{trendInsight\}\}/, '');
  }

  // 处理可选字段：市场趋势（商业风格）
  if (data.marketTrend) {
    html = html.replace(/\{\{marketTrend\}\}/, `<div class="market-trend"><strong>💹 市场趋势:</strong> ${data.marketTrend}</div>`);
  } else {
    html = html.replace(/\{\{marketTrend\}\}/, '');
  }

  // 替换 summary
  html = html.replace(/\{\{summary\.totalArticles\}\}/g, data.summary.totalArticles);
  html = html.replace(/\{\{summary\.categories\.编程\}\}/g, data.summary.categories?.编程 || 0);
  html = html.replace(/\{\{summary\.categories\.AI\}\}/g, data.summary.categories?.AI || 0);
  html = html.replace(/\{\{summary\.categories\.系统\}\}/g, data.summary.categories?.系统 || 0);
  html = html.replace(/\{\{summary\.categories\.硬件\}\}/g, data.summary.categories?.硬件 || 0);
  html = html.replace(/\{\{summary\.categories\.安全\}\}/g, data.summary.categories?.安全 || 0);
  html = html.replace(/\{\{summary\.categories\.创业\}\}/g, data.summary.categories?.创业 || 0);
  html = html.replace(/\{\{summary\.categories\.综合\}\}/g, data.summary.categories?.综合 || 0);

  // 替换 highlights
  const highlightsHtml = highlights.map(h => {
    // 深度风格的额外字段
    const audienceHtml = h.audience ? `<div class="audience">👤 适合: ${h.audience}</div>` : '';
    const readTimeHtml = h.readTime ? `<div class="readtime">⏱️ ${h.readTime}</div>` : '';
    // 商业风格的额外字段
    const impactHtml = h.impact ? `<div class="impact">📈 影响: ${h.impact}</div>` : '';
    
    return `
    <div class="highlight">
      <div class="highlight-title">
        <strong>#${h.rank}</strong> <a href="${h.link}">${h.title}</a>
      </div>
      <div class="source">📰 ${h.source} · ${h.category}</div>
      <div class="reason">💡 ${h.reason}</div>
      ${audienceHtml}
      ${readTimeHtml}
      ${impactHtml}
    </div>
  `}).join('');
  html = html.replace(/\{\{#each highlights\}\}[\s\S]*?\{\{\/each\}\}/, highlightsHtml);

  // 替换 byCategory
  const categoriesHtml = Object.entries(byCategory).map(([category, articles]) => {
    if (articles.length === 0) return '';
    const articlesHtml = articles.map(a => {
      // 深度风格的额外字段
      const keyQuoteHtml = a.keyQuote ? `<div class="keyquote">"${a.keyQuote}"</div>` : '';
      // 商业风格的额外字段
      const impactHtml = a.impact ? `<div class="impact">📈 ${a.impact}</div>` : '';
      
      return `
      <div class="article">
        <div class="article-title"><a href="${a.link}">${a.title}</a></div>
        <div class="source">📰 ${a.source}</div>
        <div class="oneliner">${a.oneLiner}</div>
        ${keyQuoteHtml}
        ${impactHtml}
      </div>
    `}).join('');
    return `
      <div class="category">
        <h3>${category} (${articles.length}篇)</h3>
        ${articlesHtml}
      </div>
    `;
  }).join('');
  html = html.replace(/\{\{#each byCategory\}\}[\s\S]*?\{\{\/each\}\}/, categoriesHtml);

  const otherTopHtml = otherTopArticles.length > 0
    ? `
      <div class="category">
        <h3>📌 次级推荐 (${otherTopArticles.length}篇)</h3>
        ${otherTopArticles.slice(0, 10).map((a, idx) => `
        <div class="article">
          <div class="article-title"><a href="${a.link}">${idx + 1}. ${a.title}</a></div>
          <div class="source">📰 ${a.source}${a.score !== undefined ? ` · Score: ${a.score}` : ''}</div>
        </div>`).join('')}
      </div>
    `
    : '';
  html = html.replace(/\{\{otherTopSection\}\}/g, otherTopHtml);

  return html;
}

/**
 * 格式化邮件纯文本
 */
function formatEmailText(data) {
  const highlights = Array.isArray(data.highlights) ? data.highlights : [];
  const byCategory = data.byCategory && typeof data.byCategory === 'object' ? data.byCategory : {};
  const otherTopArticles = Array.isArray(data.otherTopArticles) ? data.otherTopArticles : [];
  let text = EMAIL_TEXT_TEMPLATE;

  // 替换简单变量
  text = text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (key === 'highlights' || key === 'byCategory') return match;
    return data[key] !== undefined ? data[key] : match;
  });

  // 替换 highlights
  const highlightsText = highlights.map(h =>
    `#${h.rank}. ${h.title}\n   链接: ${h.link}\n   来源: ${h.source} · ${h.category}\n   推荐: ${h.reason}\n`
  ).join('\n');
  text = text.replace(/\{\{#each highlights\}\}[\s\S]*?\{\{\/each\}\}/, highlightsText);

  // 替换 byCategory
  const categoriesText = Object.entries(byCategory).map(([category, articles]) => {
    if (articles.length === 0) return '';
    const articlesText = articles.map(a =>
      `· ${a.title}\n  ${a.link}\n  ${a.oneLiner} (${a.source})\n`
    ).join('\n');
    return `${category} (${articles.length}篇)\n\n${articlesText}`;
  }).join('\n');
  text = text.replace(/\{\{#each byCategory\}\}[\s\S]*?\{\{\/each\}\}/, categoriesText);

  const otherTopText = otherTopArticles.length > 0
    ? `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📌 次级推荐 (${otherTopArticles.length}篇)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${otherTopArticles.slice(0, 10).map((a, idx) => `${idx + 1}. ${a.title}\n   ${a.link}\n   ${a.source}${a.score !== undefined ? ` · Score: ${a.score}` : ''}\n`).join('\n')}\n`
    : '';
  text = text.replace(/\{\{otherTopSection\}\}/g, otherTopText);

  return text;
}

// ==================== 主函数 ====================

/**
 * 主入口函数
 *
 * @param {Object} params - 输入参数
 * @param {Object} params.summaryData - AI 摘要的输出数据
 * @param {string} params.channel - 输出渠道 (email/feishu/dingtalk/wecom/whatsapp/webhook)
 * @returns {Object} 格式化后的输出
 */
async function main({ params }) {
  const { summaryData, channel = 'email' } = params || {};

  if (!summaryData) {
    return { error: 'Missing summaryData' };
  }

  let result;

  switch (channel) {
    case 'email':
      result = {
        html: formatEmailHtml(summaryData),
        text: formatEmailText(summaryData),
        subject: `📰 每日科技阅读 (${summaryData.date})`
      };
      break;

    case 'feishu':
      result = formatFeishuCard(summaryData);
      break;

    case 'dingtalk':
      result = formatDingtalk(summaryData);
      break;

    case 'wecom':
    case 'wechat-work':
      result = formatWecom(summaryData);
      break;

    case 'whatsapp':
      result = formatWhatsApp(summaryData);
      break;

    case 'webhook':
      result = {
        ...WEBHOOK_TEMPLATE,
        timestamp: summaryData.metadata.generatedAt,
        data: summaryData
      };
      break;

    default:
      return { error: `Unknown channel: ${channel}` };
  }

  return { result };
}

// ==================== 导出 ====================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    main,
    formatEmailHtml,
    formatEmailText,
    formatFeishuCard,
    formatDingtalk,
    formatWecom,
    formatWhatsApp,
    splitMessage
  };
}

if (typeof exports !== 'undefined') {
  exports.main = main;
}
