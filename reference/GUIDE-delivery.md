# 输出格式与投递配置指南

## 范围

本指南覆盖：

- 输出格式化：`scripts/output-formatter.js`
- 渠道投递：`scripts/delivery.js`

## 推荐流程

```text
summary.json -> output-formatter -> channel payload -> delivery(可选) -> 平台回执
```

建议先在格式化阶段检查 payload，再进入真实投递。

## 支持渠道

格式化层（`output-formatter.js`）支持：

- `email`
- `feishu`
- `dingtalk`
- `wecom` / `wechat-work`
- `whatsapp`
- `webhook`

投递层（`delivery.js`）支持：

- Feishu
- DingTalk
- WeCom
- WhatsApp

说明：Email 通常由外部邮件服务发送，不在 `delivery.js` 内直接发信。

## 格式化 CLI

```bash
node scripts/output-formatter.js --input tmp/summary.json --channel email --outFile tmp/formatted-email.json
```

其中：

- `--input`：校验后的摘要 JSON
- `--channel`：目标渠道
- `--outFile`：可选，缺省时输出到 stdout

## 质量闸门展示

格式化阶段会读取：

- `summaryData.metadata.qualityGates`

并在各渠道消息中渲染质量闸门摘要，便于发现自动修复情况。

## 投递重试与可靠性

`delivery.js` 内置重试与退避能力，可通过 `config` 调整：

- `retries`
- `baseDelayMs`
- `maxDelayMs`

联调建议开启：

- `dryRun: true`

## 各渠道配置示例

### Feishu

```json
{
  "channel": "feishu",
  "config": {
    "webhookUrl": "https://open.feishu.cn/open-apis/bot/v2/hook/xxxx",
    "dryRun": true
  }
}
```

### DingTalk

```json
{
  "channel": "dingtalk",
  "config": {
    "accessToken": "xxxx",
    "secret": "SECxxxx"
  }
}
```

### WeCom

```json
{
  "channel": "wecom",
  "config": {
    "key": "xxxx",
    "maxBytes": 2048
  }
}
```

### WhatsApp

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

## 调试建议

1. 先用 `channel=webhook` 查看结构
2. 再切换目标渠道并启用 `dryRun`
3. 若报超长，先降低 `topN/otherTopN`，再调分片参数

## 相关文件

- `scripts/output-formatter.js`
- `scripts/delivery.js`
- `reference/GUIDE-technical.md`
