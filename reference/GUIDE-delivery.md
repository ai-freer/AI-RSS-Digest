# 输出格式与投递配置指南

## 范围

本指南覆盖：

- 输出格式化：`scripts/output-formatter.js`
- 渠道投递：`scripts/delivery.js`
- 一次性执行入口：`scripts/run-digest-once.js`

## 总体流程

```text
summaryData -> output-formatter -> channel payload -> delivery -> 平台回执
```

## 支持渠道

格式化层（`output-formatter.js`）支持：

- `email`（HTML + 纯文本）
- `feishu`（交互卡片）
- `dingtalk`（Markdown）
- `wecom` / `wechat-work`（text）
- `whatsapp`（Meta 文本消息）
- `webhook`（原始 JSON）

投递层（`delivery.js`）支持：

- Feishu
- DingTalk
- WeCom
- WhatsApp

说明：Email 通常由上游邮件服务发送，不通过 `delivery.js` 直接投递。

## 输出格式能力

### Email

- 响应式 HTML 样式
- 深色模式适配
- 同时生成 text 备选正文

### Feishu

- `interactive` 卡片结构
- 自动拼接统计、建议、深度推荐、分类速览

### DingTalk

- Markdown 结构输出
- 分节清晰，适合长文阅读

### WeCom / WhatsApp

- 纯文本输出
- 自动分片避免超长失败

### Webhook

- 保留结构化摘要数据，便于二次处理

## 质量闸门信息展示

`output-formatter.js` 会读取：

- `summaryData.metadata.qualityGates`

并在各渠道插入 `🧪 质量闸门` 摘要（告警总数和主要类型）。

## 投递重试与可靠性

`delivery.js` 内置统一重试策略：

- 默认 `retries = 3`
- 指数退避（`baseDelayMs`, `maxDelayMs`）

可通过 `config` 覆盖：

- `retries`
- `baseDelayMs`
- `maxDelayMs`

`dryRun`：

- 各渠道支持 `dryRun=true`，仅输出 payload，不真实发送。

## 各渠道配置

### 1) 飞书 Feishu

必填：

- `webhookUrl` 或 `webhookId`（二选一）

示例：

```json
{
  "channel": "feishu",
  "config": {
    "webhookUrl": "https://open.feishu.cn/open-apis/bot/v2/hook/xxxx",
    "retries": 3,
    "baseDelayMs": 800,
    "maxDelayMs": 5000
  }
}
```

### 2) 钉钉 DingTalk

必填：

- `accessToken`

可选：

- `secret`（开启加签时）

示例：

```json
{
  "channel": "dingtalk",
  "config": {
    "accessToken": "xxxx",
    "secret": "SECxxxx"
  }
}
```

### 3) 企业微信 WeCom

必填：

- `key`

可选：

- `maxBytes`（默认 2048）

示例：

```json
{
  "channel": "wecom",
  "config": {
    "key": "xxxx",
    "maxBytes": 2048
  }
}
```

### 4) WhatsApp（Meta API）

必填：

- `accessToken`
- `phoneNumberId`
- `recipientPhone`（E.164，如 `+8613800000000`）

可选：

- `maxChars`（默认 4096）

示例：

```json
{
  "channel": "whatsapp",
  "config": {
    "accessToken": "EAA...",
    "phoneNumberId": "1234567890",
    "recipientPhone": "+8613800000000",
    "maxChars": 4096
  }
}
```

## 自动化流程参考

推荐链路：

1. `rss-fetcher` 抓取与分层
2. `ai-summarizer` 生成 Tier1/Tier2
3. `output-formatter` 产出渠道 payload
4. `delivery` 发送到目标平台

一键执行：

```bash
node scripts/run-digest-once.js \
  --hours 24 \
  --topN 7 \
  --otherTopN 20 \
  --curationTemplate templates/prompt-daily.md \
  --summaryTemplate templates/prompt-summarize-tiered.md \
  --channel email
```

重要修正：

- 文档中的 `templates/prompt.md` 引用应改为 `templates/prompt-daily.md`（实际存在文件）。
- 模型默认值是 `gpt-4.1-mini`，由 `LLM_MODEL` 可覆盖。

## 输出文件

`run-digest-once.js` 默认写入 `tmp/`：

- `digest-<timestamp>-fetch.json`
- `digest-<timestamp>-summary.json`
- `digest-<timestamp>-formatted-<channel>.json`

## 调试建议

- 先用 `--channel webhook` 检查数据结构再接入平台。
- 平台联调期使用 `dryRun`。
- 若渠道报超长，优先减少 `topN` / `otherTopN`，再调分片参数。

## 相关文件

- `scripts/output-formatter.js`
- `scripts/delivery.js`
- `scripts/run-digest-once.js`
- `scripts/ai-summarizer.js`
