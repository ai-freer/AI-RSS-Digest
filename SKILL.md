---
name: rss-digest
description: |
  完整的 RSS 每日摘要系统生成器。当用户需要：
  - 搭建 RSS 订阅和每日摘要系统
  - 使用高质量技术 RSS 清单
  - 运行抓取 -> 摘要 -> 格式化 -> 投递链路
  - 配置邮件/飞书/钉钉/企业微信/WhatsApp 输出
  - 快速选择不同角色的 Prompt 模板

  该 Skill 提供可复用脚本、模板与参考指南，支持本地执行与自动化集成。
version: 2.3.0
---

# RSS Digest - 精简总览

## 系统概览

本项目是一个独立 Node.js 管道，核心链路如下：

```text
RSS 源 -> rss-fetcher -> ai-summarizer -> output-formatter -> delivery
```

核心模块：

| 模块 | 文件 | 作用 |
|---|---|---|
| 源与抓取 | `scripts/rss-fetcher.js` | 并发抓取、筛选、排序分层 |
| AI 摘要 | `scripts/ai-summarizer.js` | Tier1/Tier2 摘要 + 质量闸门 |
| 输出格式化 | `scripts/output-formatter.js` | 生成 email/feishu/dingtalk/wecom/whatsapp/webhook |
| 消息投递 | `scripts/delivery.js` | 各平台发送、重试、签名、分片 |
| 一次性执行 | `scripts/run-digest-once.js` | 串联抓取 -> 摘要 -> 格式化 |
| 源健康监控 | `scripts/feed-quality-monitor.js` | 可达性和活跃度检测 |

## 快速开始

### Skill 调用入口

```text
/rss-digest setup
/rss-digest setup --channel email
/rss-digest setup --channel feishu
/rss-digest setup --channel dingtalk
/rss-digest setup --channel wecom
```

### 本地一键执行（推荐）

```bash
# 必填
export OPENAI_API_KEY="sk-..."

# 可选
export LLM_MODEL="gpt-4.1-mini"
# export OPENAI_BASE_URL="https://api.openai.com/v1"

node scripts/run-digest-once.js \
  --hours 24 \
  --topN 7 \
  --otherTopN 20 \
  --curationTemplate templates/prompt-daily.md \
  --summaryTemplate templates/prompt-summarize-tiered.md \
  --channel email
```

输出文件：

- `tmp/digest-<timestamp>-fetch.json`
- `tmp/digest-<timestamp>-summary.json`
- `tmp/digest-<timestamp>-formatted-<channel>.json`

可选降级（LLM 失败不中断）：

```bash
node scripts/run-digest-once.js \
  --hours 24 \
  --summaryTemplate templates/prompt-summarize-tiered.md \
  --allowHeuristicFallback \
  --channel wecom
```

## 模板选择（精简版）

### 5 个策展模板

| 模板 | 文件 | 适用场景 | 时长 |
|---|---|---|---|
| Daily | `templates/prompt-daily.md` | 日常完整阅读 | 20 分钟 |
| Quick | `templates/prompt-quick.md` | 快速判断优先级 | 3 分钟 |
| Tech Dev | `templates/prompt-tech-dev.md` | 技术选型/学习 | 30 分钟 |
| Product | `templates/prompt-product.md` | 产品创新/竞品观察 | 20 分钟 |
| Executive | `templates/prompt-executive.md` | 战略与决策 | 15 分钟 |

### 摘要模板（后置步骤）

- `templates/prompt-summarize-tiered.md`
  - Tier1：深度摘要（summary/keyPoints/action/risk）
  - Tier2：一两句速览（oneLiner）

注意：

- 不存在 `templates/prompt.md`。
- 旧文档中若出现 `prompt.md`，统一替换为 `templates/prompt-daily.md`。

## 关键配置参数

抓取参数（`rss-fetcher`）：

- `hours`
- `topN`
- `otherTopN`
- `tagFilter`
- `includeCN`
- `cnTier`
- `languageFilter`
- `maxPerSource`
- `allowSourceOverflow`

摘要参数（`ai-summarizer`）：

- `templatePath`（默认 `templates/prompt-summarize-tiered.md`）
- `model`（默认 `gpt-4.1-mini`）
- `allowHeuristicFallback`

投递参数（`delivery`）：

- `channel`: `feishu` / `dingtalk` / `wecom` / `whatsapp`
- `config.dryRun`
- `config.retries` / `baseDelayMs` / `maxDelayMs`

## 渠道与配置速查

| 渠道 | 格式化输出 | 投递方式 | 必填配置 |
|---|---|---|---|
| email | HTML + text | 外部邮件服务 | 由上层系统决定 |
| feishu | interactive card | `delivery.js` | `webhookUrl` 或 `webhookId` |
| dingtalk | markdown | `delivery.js` | `accessToken`（`secret` 可选） |
| wecom | text | `delivery.js` | `key` |
| whatsapp | text | `delivery.js` | `accessToken` + `phoneNumberId` + `recipientPhone` |
| webhook | json | 上层系统消费 | 自定义 URL |

### 投递配置片段

飞书：

```json
{
  "channel": "feishu",
  "config": {
    "webhookUrl": "https://open.feishu.cn/open-apis/bot/v2/hook/xxxx",
    "dryRun": true
  }
}
```

钉钉：

```json
{
  "channel": "dingtalk",
  "config": {
    "accessToken": "xxxx",
    "secret": "SECxxxx"
  }
}
```

企业微信：

```json
{
  "channel": "wecom",
  "config": {
    "key": "xxxx",
    "maxBytes": 2048
  }
}
```

WhatsApp：

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

## 常用运行场景

### 1) 日常标准版（推荐）

```bash
node scripts/run-digest-once.js \
  --hours 24 \
  --topN 7 \
  --otherTopN 20 \
  --curationTemplate templates/prompt-daily.md \
  --summaryTemplate templates/prompt-summarize-tiered.md \
  --channel email
```

### 2) 早晨快速版（Quick）

```bash
node scripts/run-digest-once.js \
  --hours 24 \
  --topN 3 \
  --otherTopN 15 \
  --curationTemplate templates/prompt-quick.md \
  --summaryTemplate templates/prompt-summarize-tiered.md \
  --channel feishu
```

### 3) 中文优先版

```bash
node scripts/run-digest-once.js \
  --languageFilter zh \
  --cnTier A \
  --channel wecom
```

## 参考文档索引

详细内容已拆分到 `reference/`：

- `reference/GUIDE-sources.md`
  - RSS 源清单、动态分类、标签/语言筛选
- `reference/GUIDE-technical.md`
  - 抓取策略、评分算法、质量闸门、健康监控
- `reference/GUIDE-templates.md`
  - 模板体系、选择策略、Breaking News、常见错误
- `reference/GUIDE-delivery.md`
  - 输出格式、投递配置、自动化流程

## 文件清单

```text
rss-digest/
├── SKILL.md
├── RSS_FEEDS.md
├── RSS_FEEDS_CN.md
├── resources/
│   └── hn-popular-blogs-2025.opml
├── scripts/
│   ├── rss-fetcher.js
│   ├── ai-summarizer.js
│   ├── output-formatter.js
│   ├── delivery.js
│   ├── run-digest-once.js
│   ├── feed-quality-monitor.js
│   ├── delivery.test.js
│   └── summary-pipeline.test.js
├── templates/
│   ├── README.md
│   ├── prompt-daily.md
│   ├── prompt-quick.md
│   ├── prompt-tech-dev.md
│   ├── prompt-product.md
│   ├── prompt-executive.md
│   └── prompt-summarize-tiered.md
└── reference/
    ├── GUIDE-sources.md
    ├── GUIDE-technical.md
    ├── GUIDE-templates.md
    └── GUIDE-delivery.md
```

## 最佳实践（精简）

成本控制：

1. 默认 `gpt-4.1-mini`，仅在必要时升级模型。
2. 控制 `topN`/`otherTopN`，避免下游摘要过载。
3. 默认 24h 时间窗，减少噪音与冗余。

质量保证：

1. 保持多源输入，避免单一来源偏置。
2. 关注 `metadata.qualityGates` 警告分布。
3. 用模板 A/B 测试验证不同读者场景效果。

稳定性：

1. 保留默认超时与重试，避免过激参数。
2. 关键任务开启 `--allowHeuristicFallback`。
3. 定期运行 `feed-quality-monitor.js` 监控源健康。

## 故障排查速查

1. 提示 `Missing required value: OPENAI_API_KEY`
   - 设置 `OPENAI_API_KEY` 后重试。
2. 渠道投递失败
   - 先设 `dryRun=true` 打印 payload，确认字段后再真实发送。
3. 消息过长被渠道拒绝
   - 降低 `topN` / `otherTopN`，或按渠道调整分片参数。
4. 摘要质量不稳定
   - 查看 `metadata.qualityGates`，定位是 Tier1 还是 Tier2 被修复。
5. 某些 RSS 源长期失败
   - 运行 `scripts/feed-quality-monitor.js`，根据报告更新源配置。
