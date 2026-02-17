# RSS Digest

[English](README.md)

面向 Cursor 和 Claude Code 的 Agent 驱动 RSS 每日摘要 Skill。

## 功能概述

本项目是一个纯 Skill 模式的流水线——脚本负责抓取、Prompt 组装、校验、格式化与投递；Agent 本身负责生成摘要 JSON。

**基础流程（6 步）：**

```text
抓取 → 组装 Prompt → Agent 生成摘要 → 校验归一化 → 渠道格式化 → 投递（可选）
```

**精读增强流程（9 步，可选）：**

```text
抓取 → 全文回源 → 逐篇精读 Prompt → Agent 精读 → Tier2 Prompt → Agent Tier2 → 合并结果 → 格式化 → 投递（可选）
```

本仓库中的脚本不直接调用外部 LLM API。

## 环境要求

- Node.js `>=18`
- 网络访问（用于 RSS 抓取和可选的投递 Webhook）

## 安装为 Skill

Cursor（全局）：

```bash
git clone <repo> ~/.cursor/skills/rss-digest
```

Claude Code（全局）：

```bash
git clone <repo> ~/.claude/skills/rss-digest
```

仅当前项目：

```bash
git clone <repo> .cursor/skills/rss-digest
```

克隆后安装依赖：

```bash
cd <skill-目录>
npm install
```

## 快速开始

### 基础模式

```bash
# 1) 抓取并排序文章
node scripts/rss-fetcher.js --hours 24 --topN 7 --otherTopN 20 --outFile tmp/fetch.json

# 2) 组装摘要 Prompt
node scripts/prepare-prompt.js \
  --fetchFile tmp/fetch.json \
  --template templates/prompt-summarize-tiered.md \
  --outFile tmp/prompt.txt

# 3) Agent 读取 tmp/prompt.txt，输出 JSON 到 tmp/summary-raw.json

# 4) 校验与归一化
node scripts/validate-summary.js \
  --input tmp/summary-raw.json \
  --fetchFile tmp/fetch.json \
  --outFile tmp/summary.json

# 5) 渠道格式化
node scripts/output-formatter.js --input tmp/summary.json --channel email --outFile tmp/formatted-email.json

# 6) 可选投递
node scripts/delivery.js --input tmp/formatted-email.json --channel email --dryRun
```

### 精读增强模式

```bash
# 1) 抓取
node scripts/rss-fetcher.js --hours 24 --topN 7 --otherTopN 20 --outFile tmp/fetch.json

# 2) 回源抓取 Top 文章全文
node scripts/full-content-fetcher.js --fetchFile tmp/fetch.json --outFile tmp/fetch-enriched.json

# 3) 生成逐篇精读 Prompt
node scripts/prepare-deep-read.js --fetchFile tmp/fetch-enriched.json --template daily --outFile tmp/deep-read-prompts.json

# 4) Agent 读取 tmp/deep-read-prompts.json，输出 tmp/deep-read-results.json

# 5) 组装 Tier2 Prompt
node scripts/prepare-prompt.js \
  --fetchFile tmp/fetch.json \
  --template templates/prompt-summarize-tiered.md \
  --deepReadResults tmp/deep-read-results.json \
  --outFile tmp/prompt-tier2.txt

# 6) Agent 读取 tmp/prompt-tier2.txt，输出 tmp/tier2-raw.json

# 7) 合并最终摘要
node scripts/assemble-summary.js \
  --deepReadResults tmp/deep-read-results.json \
  --tier2Raw tmp/tier2-raw.json \
  --fetchFile tmp/fetch.json \
  --outFile tmp/summary.json

# 8-9) 格式化与投递（同基础模式步骤 5-6）
```

## 投递

`scripts/delivery.js` 支持将格式化结果投递到：

- **Email**（Resend API 或 SMTP）
- **飞书**
- **钉钉**
- **企业微信**
- **WhatsApp**

将 `.env.example` 复制为 `.env` 并填入凭证。首次请务必使用 `--dryRun` 验证。

详见 `reference/GUIDE-delivery.md`（payload 示例）和 `reference/GUIDE-delivery-setup.md`（分步配置指南）。

## 测试

```bash
npm test
```

运行 4 套测试：

- `summary-pipeline.test.js` — 核心管线、格式化器、质量闸门
- `delivery.test.js` — 投递重试、dryRun、字节分片
- `rss-fetcher.test.js` — Feed 解析、评分、排序
- `feed-quality-monitor.test.js` — 故障分类、源发现

## 项目结构

```text
rss-digest/
├── SKILL.md                              # Skill 入口（Agent 读取此文件）
├── README.md                             # 英文说明
├── README.zh-CN.md                       # 中文说明（本文件）
├── package.json
├── .env.example
├── RSS_FEEDS.md
├── RSS_FEEDS_CN.md
├── resources/
│   └── hn-popular-blogs-2025.opml
├── scripts/
│   ├── cli-utils.js                      # 公共 CLI 参数解析与文件 I/O
│   ├── project-meta.js                   # 从 package.json 读取版本与 User-Agent
│   ├── rss-fetcher.js                    # 步骤 1：抓取与排序
│   ├── full-content-fetcher.js           # 精读：回源抓取全文
│   ├── prepare-deep-read.js              # 精读：生成逐篇 Prompt
│   ├── prepare-prompt.js                 # 步骤 2：组装摘要 Prompt
│   ├── summary-utils.js                  # Prompt 组装、JSON 提取、质量闸门
│   ├── validate-summary.js               # 步骤 4：校验与归一化
│   ├── assemble-summary.js               # 精读：合并 Tier1 + Tier2
│   ├── output-formatter.js               # 步骤 5：渠道格式化（邮件/飞书/钉钉/企微/WhatsApp）
│   ├── delivery.js                       # 步骤 6：平台投递
│   ├── feed-quality-monitor.js           # RSS 源健康检测
│   ├── summary-pipeline.test.js          # 测试：管线与格式化
│   ├── delivery.test.js                  # 测试：投递模块
│   ├── rss-fetcher.test.js               # 测试：Feed 解析与排序
│   └── feed-quality-monitor.test.js      # 测试：监控辅助函数
├── templates/
│   ├── prompt-summarize-tiered.md        # 主分层摘要模板
│   ├── prompt-deep-read.md               # 单篇全文精读模板
│   ├── prompt-daily.md
│   ├── prompt-quick.md
│   ├── prompt-tech-dev.md
│   ├── prompt-product.md
│   ├── prompt-executive.md
│   └── README.md
└── reference/
    ├── GUIDE-technical.md
    ├── GUIDE-delivery.md
    ├── GUIDE-delivery-setup.md
    ├── GUIDE-templates.md
    ├── GUIDE-sources.md
    └── TEMPLATE-delivery-onboarding.md
```

## 许可证

本仓库尚未附带许可证文件。
