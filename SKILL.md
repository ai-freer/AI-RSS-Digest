---
name: rss-digest
description: |
  完整的 RSS 每日摘要系统生成器。当用户需要：
  - 搭建 RSS 订阅和每日摘要系统
  - 使用 Andrej Karpathy 风格的高效 RSS 清单
  - 生成自动化流程配置
  - 获取 RSS 抓取、AI 总结、邮件推送的完整方案
  - 配置多平台输出（邮件/飞书/钉钉/企业微信/WhatsApp）

  此 Skill 内置 90+ 精选 RSS 源、完整的抓取脚本、总结策略、Prompt 模板和输出策略，
  可作为独立、可复用的每日摘要系统基线。
version: 2.2.0
---

# RSS Digest - 完整每日摘要系统

## 系统概述

一个完整的 RSS 自动化阅读系统，包含：

| 模块 | 说明 |
|------|------|
| **RSS 清单** | 内置 90+ 精选源，分类管理 |
| **抓取策略** | 智能抓取、轻量去重、排序分层 |
| **总结策略** | 分层摘要：精选推荐 + 分类速览 + 一句话总结 |
| **Prompt 模板** | 科技资讯策展人角色，可配置风格 |
| **输出策略** | 支持邮件、飞书、钉钉、企业微信、WhatsApp、Webhook |

## 快速开始

### 1. 生成完整配置

```
/rss-digest setup
```

### 2. 选择输出渠道

```
/rss-digest setup --channel email
/rss-digest setup --channel feishu
/rss-digest setup --channel dingtalk
/rss-digest setup --channel wecom
```

### 3. 按标签筛选内容源

使用 RSS 源标签筛选感兴趣的内容：

```
# 只看编程相关内容
/rss-digest setup --tagFilter 编程

# 只看 AI + 安全内容
/rss-digest setup --tagFilter AI,安全

# 只看硬件相关内容
/rss-digest setup --tagFilter 硬件
```

> **注意**: `tagFilter` 只用于筛选 RSS 源，最终文章分类由 AI 根据内容动态决定。

## 内置 RSS 清单

### 分类机制：AI 动态分类

**不再使用预分类**，每篇文章由 AI 根据实际内容动态归类。

#### 7 大分类

| 分类 | 涵盖内容 |
|------|---------|
| **编程** | 软件开发、编程语言、工程实践、架构设计 |
| **AI** | 人工智能、机器学习、深度学习、大模型 |
| **系统** | 操作系统、底层技术、内核、系统编程 |
| **硬件** | 嵌入式、芯片、硬件设计、DIY、树莓派 |
| **安全** | 网络安全、逆向工程、漏洞、隐私保护 |
| **创业** | 创业经验、产品设计、商业策略、市场分析 |
| **综合** | 科技评论、行业趋势、深度分析、跨领域内容 |

#### 分类示例

| 文章 | 来源标签 | AI 动态分类 | 理由 |
|------|---------|------------|------|
| React 19 新特性 | AI | **编程** | 核心内容是前端框架 |
| 树莓派集群搭建 | AI | **硬件** | 核心内容是硬件 DIY |
| LLM 安全漏洞分析 | AI | **安全** | 核心内容是安全研究 |
| 独立开发者月收入分享 | 编程 | **创业** | 核心内容是商业经验 |

#### RSS 源标签（仅供参考）

```yaml
编程相关 (22个):
  - simonwillison.net (Python/数据)
  - antirez.com (Redis/C)
  - matklad.github.io (Rust/编译器)
  - overreacted.io (React/前端)
  - ...

AI/ML 相关 (12个):
  - seangoedecke.com (AI工程)
  - garymarcus.substack.com (AI研究)
  - minimaxir.com (数据科学)
  - ...

系统相关 (12个):
  - devblogs.microsoft.com/oldnewthing (Windows)
  - righto.com (硬件逆向)
  - rachelbythebay.com (系统编程)
  - ...

硬件相关 (5个):
  - jeffgeerling.com (树莓派/Linux)
  - ericmigi.com (硬件设计)
  - ...

安全相关 (8个):
  - krebsonsecurity.com (网络安全)
  - geohot.github.io (逆向/自动驾驶)
  - ...

创业相关 (8个):
  - paulgraham.com (YC/创业)
  - dwarkesh.com (创业访谈)
  - ...

综合相关 (25个):
  - daringfireball.net (苹果评论)
  - gwern.net (深度研究)
  - ...
```

> **注意**: RSS 源标签仅用于筛选感兴趣的内容源，最终分类由 AI 根据文章实际内容决定。

### 完整清单文件

详见 `RSS_FEEDS.md`

## 抓取策略

### 核心功能

```javascript
// 1. 并发控制
const CONCURRENCY = 5;

// 2. 超时重试
const TIMEOUT = 10000;
const RETRIES = 3;

// 3. 轻量去重（保留候选，交给排序层）
- URL 标准化去重
- GUID 回退去重
- 标题+内容指纹兜底去重

// 4. 时间窗口过滤
- 默认抓取 24h 内文章
- 可配置时间窗口

// 5. 内容清洗
- 移除 HTML 标签
- 截断过长内容（保留前 2000 字符）

// 6. 排序分层输出
- 主榜 TopN（topArticles）
- 候选榜 OtherTopN（otherTopArticles）
- 支持可调参数 topN / otherTopN

// 7. 错误处理
- 单个源失败不影响整体
- 失败源记录日志
- 指数退避重试
```

> 当前 `scripts/rss-fetcher.js` 未启用运行时缓存，主要依赖并发控制、超时重试与排序分层来保证稳定性和可读性。

## 总结策略

### 分层摘要架构

```
Level 1: 精选推荐 (TopN，默认 5)
  └── 最值得深度阅读的文章
  └── 每篇给出推荐理由

Level 2: 分类速览 (By Category)
  └── 每个分类的概要统计
  └── 关键文章列表

Level 3: 次级推荐 (OtherTopN，默认 30)
  └── 排序靠后的高分候选
  └── 用于快速扫读和补充阅读

Level 4: 一句话总结 (One-liner)
  └── 每篇文章的核心观点
  └── 15-30 字精炼表达

Level 5: 今日建议 (Daily Advice)
  └── 基于今日内容的阅读策略
  └── 100 字以内的行动建议
```

### 文章评分算法

```javascript
function calculateScore(article) {
  const scores = {
    // 时效性 (24h 内最高)
    freshness: calculateFreshness(article.pubDate),

    // 来源权重
    sourceWeight: SOURCE_WEIGHTS[article.source] || 1.0,

    // 内容质量指标
    contentQuality: {
      length: Math.min(article.content.length / 5000, 1), // 长度适中
      hasCode: article.content.includes('```') ? 0.2 : 0,  // 技术深度
      hasLinks: (article.content.match(/https?/g) || []).length * 0.05
    },

    // 关键词匹配（用户可配置关注领域）
    keywordMatch: calculateKeywordMatch(article, USER_KEYWORDS)
  };

  return weightedSum(scores);
}
```

## Prompt 模板

### 主提示词模板

**文件**: `templates/prompt.md`

```markdown
# Role
你是一位资深的科技资讯策展人，擅长从大量信息中筛选有价值的洞察。

# Task
分析提供的 {{articleCount}} 篇文章，生成结构化的每日阅读摘要。

# 重要：AI 动态分类规则

## 分类原则
**不要依赖 RSS 源的预分类标签，而是根据文章实际内容进行分类。**

每篇文章只归入 **一个最核心** 的分类：
- **编程**: 软件开发、编程语言、工程实践、架构设计、前端/后端
- **AI**: 人工智能、机器学习、深度学习、大模型、AI应用
- **系统**: 操作系统、底层技术、内核、系统编程、运维
- **硬件**: 嵌入式、芯片、硬件设计、DIY、树莓派
- **安全**: 网络安全、逆向工程、漏洞、隐私、加密
- **创业**: 创业经验、产品设计、商业策略、市场分析
- **综合**: 科技评论、行业趋势、深度分析、跨领域内容

## 分类判断示例
- "React 19 新特性" → 编程（不是 AI）
- "树莓派集群搭建" → 硬件（不是 AI）
- "LLM 安全漏洞分析" → 安全（不是 AI）
- "用 AI 优化数据库查询" → AI（核心内容是 AI 应用）
- "独立开发者月收入分享" → 创业（不是编程）

# Analysis Framework

## 1. 文章评分 (内部使用)
为每篇文章评估：
- 信息密度 (1-5): 单位字数的信息量
- 技术深度 (1-5): 技术细节的丰富程度
- 时效价值 (1-5): 内容的时效性和新闻价值
- 影响力 (1-5): 对行业/技术的潜在影响

## 2. 分层输出

### Level 1: 精选推荐 (Top {{topN}})
选择最值得深度阅读的文章，考虑：
- 技术突破或重要发布
- 深度分析而非表面新闻
- 对读者工作或学习有直接帮助
- 独特视角或独家信息

每篇给出推荐理由 (20-30 字)。

### Level 2: 分类速览
按动态分类结果，每个分类列出关键文章 (最多 {{maxPerCategory}} 篇)。

### Level 3: 一句话总结
为每篇文章提炼核心观点 (15-30 字)。

### Level 4: 今日建议
基于今日内容整体特点，给出阅读策略建议 (100 字以内)。

# Output Format (Strict JSON)

{
  "date": "YYYY-MM-DD",
  "summary": {
    "totalArticles": number,
    "categories": {
      "编程": number,
      "AI": number,
      "系统": number,
      "硬件": number,
      "安全": number,
      "创业": number,
      "综合": number
    }
  },
  "highlights": [
    {
      "rank": 1,
      "title": "文章标题",
      "link": "文章链接",
      "reason": "推荐理由",
      "source": "来源",
      "category": "分类"
    }
  ],
  "byCategory": {
    "编程": [
      {
        "title": "文章标题",
        "link": "文章链接",
        "oneLiner": "一句话总结",
        "source": "来源"
      }
    ]
  },
  "dailyAdvice": "今日阅读建议",
  "metadata": {
    "generatedAt": "ISO timestamp",
    "model": "model name",
    "version": "2.1.0"
  }
}

# Input Articles

{{articles}}

# Constraints
- 只输出 JSON，不要任何其他内容
- 确保 JSON 格式正确，可以被解析
- 推荐理由要具体，避免泛泛而谈
- 一句话总结要抓住核心，不是简单的标题改写
```

### 多风格 Prompt 模板

根据**用户角色**和**使用场景**选择不同风格的摘要。

#### 5 大模板总览

| 模板 | 目标用户 | 核心场景 | 时间 | 特色功能 |
|------|---------|---------|------|---------|
| **Daily** | 所有用户 | 日常阅读 | 20分钟 | 主榜 TopN + 分类速览 + 次级榜 |
| **Quick** | 忙碌用户 | 快速判断 | 3分钟 | 主榜 TopN（默认更少）+ 价值标签🔴🟡🟢 + 不做摘要 |
| **Tech Dev** | 开发者/架构师 | 技术选型/学习 | 30分钟 | 技术雷达(Adopt/Trial/Assess/Hold) + 学习路径 |
| **Product** | 产品经理/猎手 | 产品创新 | 20分钟 | 市场机会 + 可借鉴性评估 |
| **Executive** | 高管/决策者 | 战略决策 | 15分钟 | 战略影响 + 行动建议 + 风险预警 |

#### Quick vs Daily 核心区别

**Daily**："给你主榜 + 次级榜的完整阅读地图"
- 精选按 TopN 输出（默认 5），每篇都有详细推荐理由
- 各分类列出关键文章（最多5篇）
- 适合：晚上有20分钟，想深入了解今日动态

**Quick**："帮你先判断今天最该读的 TopN"
- 精选按 TopN 输出（默认 3），只给最核心的
- 其他文章**只给标题+价值标签**，不做任何摘要
- 目标：3分钟内决定今天的阅读计划
- 适合：早晨通勤，快速判断哪些文章值得留到晚上读

#### 如何选择模板

**按时间场景**:
| 时间 | 推荐 | 理由 |
|------|------|------|
| 早晨通勤 | **Quick** | 3分钟判断今日阅读计划 |
| 工作日晚间 | **Daily** | 标准深度，20分钟阅读 |
| 周末上午 | **Tech Dev** / **Product** | 深度学习，技术研究 |
| 周一晨会前 | **Executive** | 战略视角，制定计划 |

**按角色场景**:
| 角色 | 推荐 | 关注重点 |
|------|------|---------|
| 后端开发 | **Tech Dev** | 架构选型、性能优化 |
| 产品经理 | **Product** | 竞品分析、设计灵感 |
| 技术负责人 | **Tech Dev** + **Executive** | 技术 + 战略 |
| 创业者 | **Product** + **Executive** | 产品 + 商业 |
| CTO/CEO | **Executive** | 战略决策 |

**详细使用指南**: 见 `templates/README.md`

#### 如何使用

在任意 LLM 系统提示词中，复制对应模板内容：

```bash
# 日常阅读（默认）
cp templates/prompt-daily.md system-prompt.txt

# 快速扫描 - 忙碌的早晨
cp templates/prompt-quick.md system-prompt.txt

# 技术开发 - 做技术选型或学习
cp templates/prompt-tech-dev.md system-prompt.txt

# 产品视角 - 寻找产品灵感
cp templates/prompt-product.md system-prompt.txt

# 战略决策 - 高管视角
cp templates/prompt-executive.md system-prompt.txt
```

### 分层摘要模板（新增）

> 上述 5 个模板用于“筛选/策展风格”（前置步骤）。  
> 分层摘要模板用于“总结/摘要”（后置步骤）。二者是串联关系，不是替代关系。

- `templates/prompt-summarize-tiered.md`
  - Tier1（top 几篇）: 深度摘要（summary + keyPoints + action + risk）
  - Tier2（其余十几篇）: 1-2 句速览（oneLiner）

`scripts/ai-summarizer.js` 使用该模板做摘要阶段处理。

#### 摘要质量闸门（默认开启）

`scripts/ai-summarizer.js` 在输出前会自动执行质量校验与修复：
- Tier1：摘要至少满足最小句数，不足时由 keyPoints/正文补齐；`action`、`risk` 为空时自动补默认建议。
- Tier2：`oneLiner` 过短或缺失时标记为“信息不足，建议查看原文。”；过长时自动截断。
- 质量结果写入 `metadata.qualityGates`（含规则与 warnings），便于观测与调试。
- `scripts/output-formatter.js` 会把 warnings 聚合为可读摘要（总量 + 类型计数），在输出头部展示“🧪 质量闸门”。

#### Breaking News 处理

**Breaking News 不是独立模板，而是一种叠加模式**。

当检测到重大事件（如安全漏洞、重要产品发布）时：
1. 使用 **Quick** 模板
2. 添加 [🔴突发] 标签
3. 前置行动建议
4. 评估影响范围和紧急程度

详见 `templates/README.md#Breaking-News-处理机制`

## 输出策略

### 1. 邮件输出

**格式**: HTML + 纯文本备选

**模板结构**:
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    /* 响应式设计 */
    @media (max-width: 600px) {
      .container { padding: 10px !important; }
      .highlight { padding: 12px !important; }
    }

    /* 深色模式支持 */
    @media (prefers-color-scheme: dark) {
      body { background: #1a1a1a; color: #e0e0e0; }
      .highlight { background: #2d2d2d; }
    }

    /* 基础样式 */
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    h1 { color: #1a1a1a; border-bottom: 2px solid #0066cc; padding-bottom: 10px; }
    .advice { background: #f0f7ff; border-left: 4px solid #0066cc; padding: 15px; margin: 20px 0; }
    .highlight { background: #fff8e1; border-radius: 8px; padding: 15px; margin: 15px 0; }
    .category { margin: 20px 0; }
    .article { margin: 10px 0; padding: 10px; background: #fafafa; border-radius: 4px; }
    .source { color: #666; font-size: 12px; }
    .reason { color: #d84315; font-size: 13px; margin-top: 5px; }
    .oneliner { color: #555; font-size: 13px; margin-top: 5px; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; color: #999; font-size: 12px; text-align: center; }
  </style>
</head>
<body>
  <h1>📰 每日科技阅读 ({{date}})</h1>
  <div class="advice">{{dailyAdvice}}</div>

  <h2>⭐ 深度推荐</h2>
  {{#each highlights}}
  <div class="highlight">
    <strong>#{{rank}}</strong> <a href="{{link}}">{{title}}</a>
    <div class="source">📰 {{source}}</div>
    <div class="reason">{{reason}}</div>
  </div>
  {{/each}}

  {{#each byCategory}}
  <div class="category">
    <h3>{{@key}} ({{this.length}}篇)</h3>
    {{#each this}}
    <div class="article">
      <a href="{{link}}">{{title}}</a>
      <div class="source">📰 {{source}}</div>
      <div class="oneliner">{{oneLiner}}</div>
    </div>
    {{/each}}
  </div>
  {{/each}}

  <div class="footer">
    由 RSS Digest 生成于 {{metadata.generatedAt}}<br>
    <a href="{{unsubscribeLink}}">取消订阅</a>
  </div>
</body>
</html>
```

### 2. 飞书输出

**格式**: 富文本消息卡片

**模板结构**:
```json
{
  "msg_type": "interactive",
  "card": {
    "config": { "wide_screen_mode": true },
    "header": {
      "title": { "tag": "plain_text", "content": "📰 每日科技阅读 ({{date}})" },
      "template": "blue"
    },
    "elements": [
      {
        "tag": "div",
        "text": { "tag": "lark_md", "content": "{{dailyAdvice}}" }
      },
      {
        "tag": "div",
        "text": { "tag": "lark_md", "content": "**⭐ 深度推荐**" }
      },
      {
        "tag": "hr"
      },
      {
        "tag": "div",
        "text": {
          "tag": "lark_md",
          "content": "**#1** [{{highlights.0.title}}]({{highlights.0.link}})\n📰 {{highlights.0.source}}\n💡 {{highlights.0.reason}}"
        }
      }
      // ... 更多文章
    ]
  }
}
```

### 3. 钉钉输出

**格式**: Markdown 消息

**模板结构**:
```markdown
# 📰 每日科技阅读 ({{date}})

> {{dailyAdvice}}

---

## ⭐ 深度推荐

{{#each highlights}}
**{{rank}}.** [{{title}}]({{link}})
📰 {{source}}
💡 {{reason}}

{{/each}}

---

{{#each byCategory}}
## {{@key}} ({{this.length}}篇)

{{#each this}}
- [{{title}}]({{link}}) — _{{oneLiner}}_
{{/each}}

{{/each}}
```

### 4. 企业微信输出

**格式**: Markdown 消息（企业微信支持有限，需简化）

### 5. WhatsApp 输出

**格式**: 纯文本消息（支持 `*bold*`、`_italic_`、`` `code` ``），超长自动分片

### 6. Webhook 输出

**格式**: 原始 JSON，供自定义处理

```json
{
  "version": "2.1.0",
  "timestamp": "2024-01-15T09:00:00Z",
  "data": { /* 完整摘要数据 */ }
}
```

## 自动化流程参考配置

### 流程结构

```
[定时触发] ──▶ [RSS 抓取脚本] ──▶ [数据处理] ──▶ [AI 摘要 LLM] ──▶ [格式化输出] ──▶ [投递模块 delivery.js] ──▶ [发送]
                                                  │
                                                  └──▶ [错误处理]
```

### 步骤 1: 定时触发

```yaml
type: trigger
trigger_type: schedule
config:
  timezone: Asia/Shanghai
  schedule: "0 9 * * *"  # 每天 9:00
```

### 步骤 2: RSS 抓取 (脚本)

**完整代码**: 见 `scripts/rss-fetcher.js`

**输入**: 无（使用内置 RSS 清单）

**输出**:
```json
{
  "topN": 5,
  "otherTopN": 30,
  "articles": [...],
  "topArticles": [...],
  "otherTopArticles": [...],
  "stats": {
    "totalFeeds": 90,
    "filteredFeeds": 90,
    "successFeeds": 85,
    "failedFeeds": 5,
    "totalArticles": 1200,
    "candidateArticles": 260,
    "filteredArticles": 5
  },
  "errors": [...]
}
```

### 步骤 3: AI 摘要 (LLM)

**模型**: Claude 3.5 Haiku（平衡成本和质量）

**系统提示词**: 使用 `templates/prompt.md`

**输出解析**: JSON 模式

### 步骤 4: 格式化输出 (脚本)

根据输出渠道格式化：
- 邮件 → HTML
- 飞书 → 消息卡片 JSON
- 钉钉 → Markdown
- 企业微信 → text（可分片）
- WhatsApp → text（可分片）

### 步骤 5: 发送

推荐使用 `scripts/delivery.js` 统一发送（含重试、分片、签名、dry-run）。

根据配置的渠道发送：
- 邮件 → 邮件节点
- 飞书 → `delivery.js` 调用 webhook
- 钉钉 → `delivery.js` 调用 webhook（可选签名）
- 企业微信 → `delivery.js` 调用 webhook（2048 bytes 自动分片）
- WhatsApp → `delivery.js` 调用 Meta Business API（4096 chars 自动分片）

#### 投递配置（delivery.js）

**1) 飞书 Feishu**
- 获取方式：群机器人 → 自定义机器人 → 复制完整 Webhook URL
- 必填参数：`webhookUrl` 或 `webhookId`（二选一）
- 示例：

```json
{
  "channel": "feishu",
  "config": {
    "webhookUrl": "https://open.feishu.cn/open-apis/bot/v2/hook/xxxx"
  }
}
```

**2) 钉钉 DingTalk**
- 获取方式：群机器人 → 自定义机器人 → 复制 `access_token`
- 可选安全：开启“加签”后，填入 `secret`
- 必填参数：`accessToken`
- 可选参数：`secret`
- 示例：

```json
{
  "channel": "dingtalk",
  "config": {
    "accessToken": "xxxx",
    "secret": "SECxxxx"
  }
}
```

**3) 企业微信 WeCom**
- 获取方式：群机器人 → Webhook，复制 `key`
- 必填参数：`key`
- 示例：

```json
{
  "channel": "wecom",
  "config": {
    "key": "xxxx"
  }
}
```

**4) WhatsApp (Meta Business API)**
- 获取方式：Meta 开发者后台获取 System User Access Token、Phone Number ID
- 必填参数：`accessToken`、`phoneNumberId`、`recipientPhone`（E.164 格式，如 `+8613800000000`）
- 示例：

```json
{
  "channel": "whatsapp",
  "config": {
    "accessToken": "EAA...",
    "phoneNumberId": "1234567890",
    "recipientPhone": "+8613800000000"
  }
}
```

**调试建议**
- 设置 `config.dryRun = true` 可只打印 payload 不实际发送
- 默认重试 3 次（指数退避），可通过 `retries/baseDelayMs/maxDelayMs` 调整

## 使用指南

### 基础使用

```bash
# 生成完整配置
/rss-digest setup

# 选择特定渠道
/rss-digest setup --channel email

# 选择特定分类
/rss-digest setup --category AI,编程
```

### 高级配置

```bash
# 自定义时间窗口
/rss-digest setup --hours 48

# 自定义主榜/次级榜数量
/rss-digest setup --topN 7 --otherTopN 20

# 自定义模型
/rss-digest setup --model claude-3-5-sonnet

# 组合配置
/rss-digest setup --channel feishu --category AI --topN 5 --otherTopN 15 --hours 24
```

### 一次性执行完整链路（抓取 + 摘要 + 格式化）

> 适用于被上层 Agent 直接调用，不依赖手工拼接中间步骤。

```bash
# 必填：LLM API Key（OpenAI 兼容）
export OPENAI_API_KEY="sk-..."

# 可选：模型与网关
export LLM_MODEL="gpt-4.1-mini"
# export OPENAI_BASE_URL="https://api.openai.com/v1"

# 运行 24h 链路（筛选后再摘要），输出到 tmp/
node scripts/run-digest-once.js \
  --hours 24 \
  --topN 7 \
  --otherTopN 20 \
  --curationTemplate templates/prompt-daily.md \
  --summaryTemplate templates/prompt-summarize-tiered.md \
  --channel email
```

输出文件（自动生成）：
- `tmp/digest-<timestamp>-fetch.json`
- `tmp/digest-<timestamp>-summary.json`（LLM 摘要核心产物）
- `tmp/digest-<timestamp>-formatted-<channel>.json`

可选降级（无外部 LLM 时不断流程）：

```bash
node scripts/run-digest-once.js \
  --hours 24 \
  --summaryTemplate templates/prompt-summarize-tiered.md \
  --allowHeuristicFallback \
  --channel wecom
```

### 更新 RSS 清单

```bash
# 添加自定义源
/rss-digest add-feed "https://example.com/feed.xml" --name "Example" --category "AI"

# 移除源
/rss-digest remove-feed "https://example.com/feed.xml"

# 查看当前清单
/rss-digest list-feeds
```

## 文件清单

```
rss-digest/
├── SKILL.md                          # 本文件
├── RSS_FEEDS.md                      # 完整 RSS 清单
├── RSS_FEEDS_CN.md                   # 中文 RSS 候选源（建议清单）
├── resources/
│   └── hn-popular-blogs-2025.opml   # 原始 OPML 导入文件
├── scripts/
│   ├── rss-fetcher.js               # RSS 抓取脚本
│   ├── ai-summarizer.js             # 摘要生成（Tier1/Tier2 + 兼容桥接）
│   ├── run-digest-once.js           # 一次性执行抓取→摘要→格式化
│   ├── output-formatter.js          # 输出格式化（含 WhatsApp/分片）
│   ├── delivery.js                  # 多平台投递（重试/签名/分片）
├── templates/
│   ├── README.md                    # 模板使用指南
│   ├── prompt-daily.md              # 日常阅读（默认）
│   ├── prompt-quick.md              # 快速扫描
│   ├── prompt-tech-dev.md           # 技术开发（选型+学习）
│   ├── prompt-product.md            # 产品经理/Product Hunter
│   ├── prompt-executive.md          # 高管/决策者
│   └── prompt-summarize-tiered.md   # 分层摘要（Tier1 深度 + Tier2 速览）
```

## 最佳实践

### 成本控制

1. **模型选择**: Haiku 足够，Sonnet 仅在需要深度分析时使用
2. **文章数量**: 限制每天最多 50 篇
3. **候选控制**: 使用 `topN` / `otherTopN` 控制输出规模，避免下游摘要过载
4. **时间窗口**: 24 小时足够，48 小时仅在周末后使用

### 质量保证

1. **来源筛选**: 优先高质量源，移除低信噪比源
2. **排序优先**: 轻量去重后交由评分排序，避免过度筛除导致漏读
3. **人工反馈**: 定期根据阅读反馈调整精选算法
4. **A/B 测试**: 尝试不同提示词模板，对比效果

### 稳定性

1. **错误隔离**: 单个 RSS 源失败不影响整体
2. **超时控制**: 每个源 10 秒超时
3. **降级策略**: AI 失败时返回原始列表
4. **监控告警**: 连续失败时通知管理员
