---
name: ak-92rss-digest
description: |
  Agent 驱动的 RSS 每日摘要 Skill。脚本只做抓取、prompt 组装、摘要校验、
  格式化与输出；摘要生成由 Agent 本身完成。
version: 3.0.0
---

# RSS Digest Skill (Agent Mode)

## 一句话说明

这是一个"**Agent 编排 + 本地脚本执行**"的 RSS 摘要流水线：
统一流程：`fetch -> fetch-full(tier1) -> prepare-deep-read -> Agent deep-read(tier1) -> prepare-prompt(tier2) -> Agent tier2 -> assemble -> validate -> format`。
说明：Tier1 精读是必经步骤，不因模板（daily/quick/tech-dev/product/executive）而省略。

## 使用原则

1. Agent 不调用外部 LLM API，按流程完成 Tier1 精读和 Tier2 汇总 JSON。
2. 每一步都要落盘中间文件，便于回放和排错。
3. 先校验再格式化，避免不合规 JSON 进入输出层。
4. 生成"详细摘要/重点推荐"页面时，展示层必须以 `tier1` 为主数据源；`highlights` 仅作兼容字段，不可替代 `tier1`。

## 标准目录约定

建议统一使用 `tmp/` 作为中间产物目录：

- `tmp/fetch.json`
- `tmp/fetch-enriched.json`
- `tmp/deep-read-prompts.json`
- `tmp/deep-read-results.json`
- `tmp/prompt-tier2.txt`
- `tmp/tier2-raw.json`
- `tmp/summary.json`
- `tmp/output.md` / `tmp/output.html` / `tmp/output.json`

## 核心执行流程（Tier1 精读必经）

### Step 1: 抓取与排序 (`rss-fetcher.js`)

**输入**

- RSS 源配置（内置）
- 默认包含中文 A 级源（含 AIHOT）；`--includeCN false` 可关闭，`--cnTier ALL` 可加入 B 级
- 可选参数：时间窗、语言筛选、榜单数量

**命令**

```bash
node scripts/rss-fetcher.js \
  --hours 24 \
  --topN 7 \
  --otherTopN 20 \
  --languageFilter all \
  --outFile tmp/fetch.json
```

**输出**

- `tmp/fetch.json`
- 关键字段：`topArticles`、`otherTopArticles`、`stats`

**通过条件**

- `topArticles` 或 `otherTopArticles` 至少一个非空

**失败处理**

- 拉长时间窗：`--hours 48`
- 放宽筛选：`--languageFilter all`
- 降低要求：`--topN 5 --otherTopN 10`

---

### Step 2: 回源抓取 Tier1 全文 (`full-content-fetcher.js`)

**输入**

- `tmp/fetch.json`

**命令**

```bash
node scripts/full-content-fetcher.js \
  --fetchFile tmp/fetch.json \
  --outFile tmp/fetch-enriched.json
```

**输出**

- `tmp/fetch-enriched.json`

**通过条件**

- `topArticles` 中每篇都有 `fullContent`（若部分失败，需在后续精读中显式标注信息不足）
- AIHOT 条目直接使用官方 RSS 内容，不解析其新旧域名的条目网页

---

### Step 3: 生成逐篇精读 Prompt (`prepare-deep-read.js`)

**输入**

- `tmp/fetch-enriched.json`
- `templates/prompt-deep-read.md`

**命令**

```bash
node scripts/prepare-deep-read.js \
  --fetchFile tmp/fetch-enriched.json \
  --template daily \
  --outFile tmp/deep-read-prompts.json
```

**输出**

- `tmp/deep-read-prompts.json`

**通过条件**

- `prompts` 条数与 `topArticles` 条数一致（Tier1 每篇都必须精读）

---

### Step 4: Agent 执行 Tier1 逐篇精读（核心）

**输入**

- `tmp/deep-read-prompts.json`

**Agent 指令（建议原样执行）**

1. 逐条读取 `prompts[]`
2. 对每篇文章输出合法 JSON（`summary`/`keyPoints`/`action`/`risk`/`category` 等）
3. 聚合写入 `tmp/deep-read-results.json`
4. 输出条数必须与 Tier1 条数一致，不允许跳篇

**通过条件**

- `tmp/deep-read-results.json` 可解析，且覆盖所有 Tier1 文章

---

### Step 5: 组装 Tier2 Prompt (`prepare-prompt.js`)

**输入**

- `tmp/fetch.json`
- `tmp/deep-read-results.json`
- `templates/prompt-summarize-tiered.md`

**命令**

```bash
node scripts/prepare-prompt.js \
  --fetchFile tmp/fetch.json \
  --template templates/prompt-summarize-tiered.md \
  --deepReadResults tmp/deep-read-results.json \
  --outFile tmp/prompt-tier2.txt
```

**输出**

- `tmp/prompt-tier2.txt`

**通过条件**

- 文件存在且非空
- 未传 `--deepReadResults` 时，脚本会直接报错（用于强制 Tier1 精读）

---

### Step 6: Agent 生成 Tier2 JSON

**输入**

- `tmp/prompt-tier2.txt`

**Agent 指令**

1. 读取 `tmp/prompt-tier2.txt`
2. 输出 Tier2 结果到 `tmp/tier2-raw.json`
3. 仅外说明

**通过条件**

- `tmp/tier2-raw.json` 能被 JSON 解析

---

### Step 7: 合并 Tier1 精读 + Tier2 (`assemble-summary.js`)

**命令**

```bash
node scripts/assemble-summary.js \
  --deepReadResults tmp/deep-read-results.json \
  --tier2Raw tmp/tier2-raw.json \
  --fetchFile tmp/fetch.json \
  --outFile tmp/summary.json
```

---

### Step 8: 校验与归一化 (`validate-summary.js`)

**输入**

- `tmp/summary.json`（可原地覆盖，补齐质量闸门）
- `tmp/fetch.json`

**命令**

```bash
node scripts/validate-summary.js \
  --input tmp/summary.json \
  --fetchFile tmp/fetch.json \
  --outFile tmp/summary.json
``输出**

- `tmp/summary.json`
- 关键字段：`tier1`、`tier2`、`highlights`、`byCategory`、`metadata.qualityGates`

**通过条件**

- 结构完整，且 `metadata.qualityGates.applied = true`

**失败处理**

- 若报 `Input does not contain valid JSON object`，优先检查 `deep-read-results` / `tier2-raw` 的 JSON 合法性

---

### Step 9: 格式化输出 (`output-formatter.js`)

**输入**

- `tmp/summary.json`
- 格式参数 `--format`

**命令**

```bash
# Markdown（默认，通用文本）
node scripts/output-formatter.js \
  --input tmp/summary.json \
  --format md \
  --outFile tmp/output.md

# HTML（内置最佳实践样式，CSS 变量可覆盖）
node scripts/output-formatter.js \
  --input tmp/summary.json \
  --format html \
  --outFile tmp/output.html

# JSON（归一化结构，供程序消费）
node scripts/output-formatter.js \
  --input tmp/summary.json \
  --format json \
  --outFile tmp/output.json
```

**支持格式**

- `md` / `markdown`：Markdown 纯文本
- `html`：完整 HTML，CSS 自定义属性（`--rsd-*`）可覆盖
- `json`：归一化 JSON 对象

**通过条件**

- 输出文件存在且非空

---

### Step 10: 可选投递

投递能力由独立 skill `universal-deliver` 负责，本项目不内置投递逻辑。将 `tmp/output.*` 传给 `universal-deliver` 即可。

---

## 常用剧本

### 剧本 A：日常完整版

```bash
node scripts/rss-fetcher.js --hours 24 --topN 7 --otherTopN 20 --outFile tmp/fetch.json
node scripts/full-content-fetcher.js --fetchFile tmp/fetch.json --outFile tmp/fetch-enriched.json
node scripts/prepare-deep-read.js --fetchFile tmp/fetch-enriched.json --template daily --outFile tmp/deep-read-prompts.json
# Agent: 读取 tmp/deep-read-prompts.json，输出 tmp/deep-read-results.json
node scripts/prepare-prompt.js --fetchFile tmp/fetch.json --template templates/prompt-summarize-tiered.md --deepReadResults tmp/deep-read-results.json --outFile tmp/prompt-tier2.txt
# Agent: 读取 tmp/prompt-tier2.txt，输出 tmp/tier2-raw.json
node scripts/assemble-summary.js --deepReadResults tmp/deep-read-results.json --tier2Raw tmp/tier2-raw.json --fetchFile tmp/fetch.json --outFile tmp/summary.json
node scripts/validate-summary.js --input tmp/summary.json --fetchFile tmp/fetch.json --outFile tmp/summary.json
node scripts/output-formatter.js --input tmp/summary.json --format md --outFile tmp/output.md
```

### 剧本 B：中文优先

```bash
node scripts/rss-fetcher.js --languageFiltTier A --topN 5 --otherTopN 15 --outFile tmp/fetch-zh.json
node scripts/full-content-fetcher.js --fetchFile tmp/fetch-zh.json --outFile tmp/fetch-zh-enriched.json
node scripts/prepare-deep-read.js --fetchFile tmp/fetch-zh-enriched.json --template daily --outFile tmp/deep-read-prompts-zh.json
# Agent: 输出 tmp/deep-read-results-zh.json
node scripts/prepare-prompt.js --fetchFile tmp/fetch-zh.json --template templates/prompt-summarize-tiered.md --deepReadResults tmp/deep-read-results-zh.json --outFile tmp/prompt-tier2-zh.txt
# Agent: 输出 tmp/tier2-raw-zh.json
node scripts/assemble-summary.js --deepReadResults tmp/deep-read-results-zh.json --tier2Raw tmp/th.json --fetchFile tmp/fetch-zh.json --outFile tmp/summary-zh.json
node scripts/validate-summary.js --input tmp/summary-zh.json --fetchFile tmp/fetch-zh.json --outFile tmp/summary-zh.json
node scripts/output-formatter.js --input tmp/summary-zh.json --format html --outFile tmp/output-zh.html
```

### 剧本 C：仅检查源健康

```bash
node scripts/feed-quality-monitor.js
```

## 模板速查

- `templates/prompt-daily.md`
- `templates/prompt-quick.md`
- `templates/prompt-tech-dev.md`
- `templates/prompt-product.md`
- `templates/prompt-executive.md`
- `templates/prompt-summarize-tiered.md`（摘要模板）
- `templates/prompt-deep-read.md`（单篇全文精读模板）

注意：项目中没有 `templates/prompt.md`。

## 参考文档

- `reference/GUIDE-technical.md`
- `reference/GUIDE-templates.md`
- `reference/GUIDE-sources.md`

## 故障排查速查

1. `Missing required value: fetchFile`
   - 检查参数是否传入 `--fetchFile`
2. `Input does not contain valid JSON object`
   - 检查 `tmp/deep-read-results.json` 与 `tmp/tier2-raw.json` 是否为合法 JSON，再重新组装
3. 输出内容过长
   - 先降低 `topN/otherTopN`，再重新格式化
4. 源质量下降
   - 运行 `scripts/feed-quality-monitor.js` 并更新源策略
