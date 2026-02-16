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

**命令（示例）**

```bash
node scripts/delivery.js \
  --input tmp/formatted-email.json \
  --channel email \
  --dryRun
```

**支持渠道**

- `email`
- `feishu`
- `dingtalk`
- `wecom` / `wechat-work`
- `whatsapp`

**执行策略**

1. 先 `dryRun` 验证配置与 payload
2. 验证通过后再真实投递
3. 失败按渠道重试与排错

**重要**

- 首次配置渠道时，优先阅读 `reference/GUIDE-delivery-setup.md`
- 投递格式说明见 `reference/GUIDE-delivery.md`

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
- `reference/GUIDE-delivery-setup.md`
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
