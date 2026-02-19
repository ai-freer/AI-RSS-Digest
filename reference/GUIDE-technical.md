# 抓取、校验与质量闸门技术指南

## 技术范围

本指南覆盖：

- `scripts/rss-fetcher.js`
- `scripts/summary-utils.js`
- `scripts/prepare-prompt.js`
- `scripts/validate-summary.js`
- `scripts/output-formatter.js`
- `scripts/feed-quality-monitor.js`

## 端到端流程

```text
RSS 源 -> 抓取与排序 -> Prompt 组装 -> Agent 生成摘要 JSON -> 结构校验与质量修复 -> 格式化输出
```

说明：Agent 承担摘要生成，脚本层不调用外部 LLM API。

## 抓取策略（rss-fetcher）

核心配置：

- 并发：`CONCURRENCY = 5`
- 超时：`TIMEOUT = 10000ms`
- 重试：`RETRIES = 3`
- 时间窗口：`TIME_WINDOW_HOURS = 24`
- 内容裁剪：`MAX_CONTENT_LENGTH = 2000`

抓取质量控制：

1. DOM 解析优先，正则回退
2. 文本清洗与轻量去重
3. 评分排序后再分层输出

分层输出字段：

- `topArticles`
- `otherTopArticles`

## Prompt 组装（prepare-prompt + summary-utils）

`prepare-prompt.js` 会：

1. 读取抓取结果 JSON
2. 加载摘要模板（默认 `templates/prompt-summarize-tiered.md`）
3. 调用 `summary-utils.buildPromptArticles()` 与 `summary-utils.buildPrompt()`
4. 输出最终 Prompt 文本

常用命令：

```bash
node scripts/prepare-prompt.js --fetchFile tmp/fetch.json --template templates/prompt-summarize-tiered.md --outFile tmp/prompt.txt
```

## 摘要校验与归一化（validate-summary）

`validate-summary.js` 会：

1. 读取 Agent 生成文件（允许前后夹杂说明文字）
2. 用 `extractJson()` 提取 JSON 主体
3. 用 `ensureSummaryShape()` 归一化结构并修复质量

输出关键字段：

- `tier1` / `tier2`
- `highlights` / `byCategory`（兼容格式化层）
- `metadata.qualityGates`

常用命令：

```bash
node scripts/validate-summary.js --input tmp/summary-raw.json --fetchFile tmp/fetch.json --outFile tmp/summary.json
```

## 质量闸门规则

当前规则来自 `summary-utils.js`：

- Tier1：
  - `summary` 至少 3 句（不足会尝试由 `keyPoints` 重建）
  - `keyPoints` 至少 3 条（自动补齐）
  - `action` / `risk` 缺失时补默认文案
- Tier2：
  - `oneLiner` 过短时回退默认文案
  - 过长时自动截断

告警写入：

- `metadata.qualityGates.warnings`

## 输出格式化（output-formatter）

支持三种基础格式：

- `md`：Markdown 纯文本，可直接阅读或传给任意下游渠道
- `html`：完整 HTML，内置 CSS 自定义属性（`--rsd-*`）作为最佳实践底线，使用方可覆盖
- `json`：归一化 JSON 对象，供程序消费或自定义渠道适配

常用命令：

```bash
node scripts/output-formatter.js --input tmp/summary.json --format md --outFile tmp/output.md
node scripts/output-formatter.js --input tmp/summary.json --format html --outFile tmp/output.html
node scripts/output-formatter.js --input tmp/summary.json --format json --outFile tmp/output.json
```

渠道适配（email/feishu/dingtalk/wecom 等）由下游 skill（如 `universal-deliver`）负责。

## Feed 健康监控

脚本：`scripts/feed-quality-monitor.js`

作用：

- 批量检测 RSS 可达性与活跃度
- 输出最新快照与历史记录

默认输出：

- `tmp/feed-quality-latest.json`
- `tmp/feed-quality-history.jsonl`

## 相关文件

- `scripts/rss-fetcher.js`
- `scripts/summary-utils.js`
- `scripts/prepare-prompt.js`
- `scripts/validate-summary.js`
- `scripts/output-formatter.js`
- `scripts/feed-quality-monitor.js`
