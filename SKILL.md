---
name: rss-digest
description: |
  Agent 驱动的 RSS 每日摘要 Skill。脚本只做抓取、prompt 组装、摘要校验、
  格式化与投递；摘要生成由 Agent 本身完成。
version: 2.3.1
---

# RSS Digest Skill (Agent Mode)

## 一句话说明

这是一个“**Agent 编排 + 本地脚本执行**”的 RSS 摘要流水线：  
`fetch -> prepare-prompt -> Agent summarize -> validate -> format -> deliver(optional)`。

## 使用原则

1. Agent 不调用外部 LLM API，直接在 Step 3 生成摘要 JSON。
2. 每一步都要落盘中间文件，便于回放和排错。
3. 先校验再格式化，避免不合规 JSON 进入渠道层。
4. 投递前优先 `dryRun` 验证 payload。

## 标准目录约定

建议统一使用 `tmp/` 作为中间产物目录：

- `tmp/fetch.json`
- `tmp/prompt.txt`
- `tmp/summary-raw.json`
- `tmp/summary.json`
- `tmp/formatted-<channel>.json`

## 标准执行流程（6 步）

### Step 1: 抓取与排序 (`rss-fetcher.js`)

**输入**

- RSS 源配置（内置）
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

### Step 2: 组装摘要 Prompt (`prepare-prompt.js`)

**输入**

- `tmp/fetch.json`
- `templates/prompt-summarize-tiered.md`

**命令**

```bash
node scripts/prepare-prompt.js \
  --fetchFile tmp/fetch.json \
  --template templates/prompt-summarize-tiered.md \
  --outFile tmp/prompt.txt
```

**输出**

- `tmp/prompt.txt`

**通过条件**

- 文件存在且非空

**失败处理**

- 检查 `--fetchFile` 路径
- 检查模板文件是否存在

---

### Step 3: Agent 生成摘要 JSON（核心）

**输入**

- `tmp/prompt.txt`

**Agent 指令（建议原样执行）**

1. 读取 `tmp/prompt.txt`
2. 严格按照模板要求生成 JSON
3. 仅输出 JSON 内容并写入 `tmp/summary-raw.json`
4. 不要输出代码块包裹符号

**推荐结构**

- `date`
- `tier1[]`（深度摘要：`summary`/`keyPoints`/`action`/`risk`）
- `tier2[]`（一句话速览：`oneLiner`）
- 可选：`dailyAdvice`、`metadata`

**通过条件**

- `tmp/summary-raw.json` 能被 JSON 解析

**失败处理**

- 若输出混入说明文字，保留原文件，交给 Step 4 自动提取 JSON

---

### Step 4: 校验与归一化 (`validate-summary.js`)

**输入**

- `tmp/summary-raw.json`
- `tmp/fetch.json`

**命令**

```bash
node scripts/validate-summary.js \
  --input tmp/summary-raw.json \
  --fetchFile tmp/fetch.json \
  --outFile tmp/summary.json
```

**输出**

- `tmp/summary.json`
- 关键字段：`tier1`、`tier2`、`highlights`、`byCategory`、`metadata.qualityGates`

**通过条件**

- 结构完整，且 `metadata.qualityGates.applied = true`

**失败处理**

- 若报 `Input does not contain valid JSON object`，回到 Step 3 重新生成

---

### Step 5: 格式化输出 (`output-formatter.js`)

**输入**

- `tmp/summary.json`
- 渠道参数 `--channel`

**命令（示例）**

```bash
node scripts/output-formatter.js \
  --input tmp/summary.json \
  --channel email \
  --outFile tmp/formatted-email.json
```

**输出**

- `tmp/formatted-email.json`（或其他渠道格式）

**支持渠道**

- `email`
- `feishu`
- `dingtalk`
- `wecom` / `wechat-work`
- `whatsapp`
- `webhook`

**通过条件**

- 输出文件存在，且包含渠道所需核心字段

---

### Step 6: 可选投递 (`delivery.js`)

**输入**

- Step 5 的格式化结果
- 渠道配置（Webhook / Access Token 等）

**建议策略**

1. 先 `dryRun`
2. 确认 payload 再真实发送
3. 失败时按渠道重试策略处理

**渠道配置示例**

```env
# FEISHU_WEBHOOK_URL=https://open.feishu.cn/open-apis/bot/v2/hook/xxxx
# DINGTALK_ACCESS_TOKEN=xxxx
# DINGTALK_SECRET=SECxxxx
# WECOM_KEY=xxxx
```

## 三个常用剧本

### 剧本 A：日常完整版（Email）

```bash
node scripts/rss-fetcher.js --hours 24 --topN 7 --otherTopN 20 --outFile tmp/fetch.json
node scripts/prepare-prompt.js --fetchFile tmp/fetch.json --template templates/prompt-summarize-tiered.md --outFile tmp/prompt.txt
# Agent: 读取 tmp/prompt.txt，输出 tmp/summary-raw.json
node scripts/validate-summary.js --input tmp/summary-raw.json --fetchFile tmp/fetch.json --outFile tmp/summary.json
node scripts/output-formatter.js --input tmp/summary.json --channel email --outFile tmp/formatted-email.json
```

### 剧本 B：中文优先（WeCom）

```bash
node scripts/rss-fetcher.js --languageFilter zh --cnTier A --topN 5 --otherTopN 15 --outFile tmp/fetch-zh.json
node scripts/prepare-prompt.js --fetchFile tmp/fetch-zh.json --template templates/prompt-summarize-tiered.md --outFile tmp/prompt-zh.txt
# Agent: 输出 tmp/summary-raw-zh.json
node scripts/validate-summary.js --input tmp/summary-raw-zh.json --fetchFile tmp/fetch-zh.json --outFile tmp/summary-zh.json
node scripts/output-formatter.js --input tmp/summary-zh.json --channel wecom --outFile tmp/formatted-wecom.json
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

注意：项目中没有 `templates/prompt.md`。

## 参考文档

- `reference/GUIDE-technical.md`
- `reference/GUIDE-delivery.md`
- `reference/GUIDE-templates.md`
- `reference/GUIDE-sources.md`

## 故障排查速查

1. `Missing required value: fetchFile`  
   - 检查参数是否传入 `--fetchFile`
2. `Input does not contain valid JSON object`  
   - Step 3 输出格式错误，重新生成 `summary-raw.json`
3. 渠道拒绝（长度/格式）  
   - 先降低 `topN/otherTopN`，再调整渠道参数
4. 源质量下降  
   - 运行 `scripts/feed-quality-monitor.js` 并更新源策略
---
name: rss-digest
description: |
  Agent 驱动的 RSS 每日摘要 Skill。脚本只负责抓取、prompt 组装、摘要校验、格式化与投递，
  不直接调用外部 LLM API。适用于 Cursor 与 Claude Code。
version: 2.3.0
---

# RSS Digest Skill

## 系统概览

这是一个纯 Skill 模式的 RSS 管道：

```text
Agent -> rss-fetcher -> prepare-prompt -> Agent 生成摘要 JSON -> validate-summary -> output-formatter -> delivery(可选)
```

核心原则：**Agent 本身就是模型，仓库脚本不再负责模型调用。**

## 工作流程（核心）

### Step 1 - 抓取与排序

```bash
node scripts/rss-fetcher.js --hours 24 --topN 7 --otherTopN 20 --outFile tmp/fetch.json
```

### Step 2 - 组装摘要 Prompt

```bash
node scripts/prepare-prompt.js   --fetchFile tmp/fetch.json   --template templates/prompt-summarize-tiered.md   --outFile tmp/prompt.txt
```

### Step 3 - Agent 生成摘要 JSON

Agent 读取 `tmp/prompt.txt`，输出严格 JSON 到 `tmp/summary-raw.json`。

### Step 4 - 校验与归一化摘要

```bash
node scripts/validate-summary.js   --input tmp/summary-raw.json   --fetchFile tmp/fetch.json   --outFile tmp/summary.json
```

### Step 5 - 格式化渠道输出

```bash
node scripts/output-formatter.js --input tmp/summary.json --channel email --outFile tmp/formatted.json
```

支持渠道：`email` / `feishu` / `dingtalk` / `wecom` / `whatsapp` / `webhook`。

### Step 6 - 可选投递

使用 `scripts/delivery.js` 对格式化结果做真实发送。联调建议开启 `dryRun`。

## 模板选择

| 类型 | 文件 | 说明 |
|---|---|---|
| 策展模板 | `templates/prompt-daily.md` | 日常完整阅读 |
| 策展模板 | `templates/prompt-quick.md` | 快速扫描 |
| 策展模板 | `templates/prompt-tech-dev.md` | 技术深度 |
| 策展模板 | `templates/prompt-product.md` | 产品洞察 |
| 策展模板 | `templates/prompt-executive.md` | 管理决策 |
| 摘要模板 | `templates/prompt-summarize-tiered.md` | Tier1/Tier2 摘要结构 |

注意：项目里没有 `templates/prompt.md`。

## 关键参数速查

抓取阶段（`rss-fetcher`）：

- `--hours`
- `--topN`
- `--otherTopN`
- `--maxPerSource`
- `--allowSourceOverflow`
- `--includeCN`
- `--cnTier`
- `--languageFilter`

摘要准备阶段（`prepare-prompt`）：

- `--fetchFile`
- `--template`
- `--outFile`

摘要校验阶段（`validate-summary`）：

- `--input`
- `--fetchFile`
- `--outFile`

格式化阶段（`output-formatter`）：

- `--input`
- `--channel`
- `--outFile`

## 渠道配置速查

仅在投递时需要（`delivery.js`）：

```env
# FEISHU_WEBHOOK_URL=https://open.feishu.cn/open-apis/bot/v2/hook/xxxx
# DINGTALK_ACCESS_TOKEN=xxxx
# DINGTALK_SECRET=SECxxxx
# WECOM_KEY=xxxx
```

## 常用场景

### 1) 日常标准摘要（Email）

```bash
node scripts/rss-fetcher.js --hours 24 --topN 7 --otherTopN 20 --outFile tmp/fetch.json
node scripts/prepare-prompt.js --fetchFile tmp/fetch.json --template templates/prompt-summarize-tiered.md --outFile tmp/prompt.txt
# Agent: 输出 tmp/summary-raw.json
node scripts/validate-summary.js --input tmp/summary-raw.json --fetchFile tmp/fetch.json --outFile tmp/summary.json
node scripts/output-formatter.js --input tmp/summary.json --channel email --outFile tmp/formatted-email.json
```

### 2) 中文优先扫描（WeCom）

```bash
node scripts/rss-fetcher.js --languageFilter zh --cnTier A --topN 5 --otherTopN 15 --outFile tmp/fetch-zh.json
node scripts/prepare-prompt.js --fetchFile tmp/fetch-zh.json --template templates/prompt-summarize-tiered.md --outFile tmp/prompt-zh.txt
# Agent: 输出 tmp/summary-zh-raw.json
node scripts/validate-summary.js --input tmp/summary-zh-raw.json --fetchFile tmp/fetch-zh.json --outFile tmp/summary-zh.json
node scripts/output-formatter.js --input tmp/summary-zh.json --channel wecom --outFile tmp/formatted-wecom.json
```

## 参考文档索引

- `reference/GUIDE-sources.md`：源清单与筛选
- `reference/GUIDE-technical.md`：抓取、校验、质量闸门
- `reference/GUIDE-templates.md`：模板选择
- `reference/GUIDE-delivery.md`：格式化与投递

## 故障排查

1. `Missing required value: fetchFile`：检查是否传了 `--fetchFile`
2. `Input does not contain valid JSON object`：Step 3 输出不是合法 JSON
3. 输出过长：降低 `topN/otherTopN` 或调整渠道分片
4. 源连续失败：运行 `scripts/feed-quality-monitor.js` 排查
