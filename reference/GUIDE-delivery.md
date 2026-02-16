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

- Email（Resend / SMTP）
- Feishu
- DingTalk
- WeCom
- WhatsApp

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

## 投递 CLI（delivery.js）

```bash
# dryRun
node scripts/delivery.js --input tmp/formatted-email.json --channel email --dryRun

# real send
node scripts/delivery.js --input tmp/formatted-email.json --channel email
```

CLI 会自动读取当前目录下的 `.env` / `.env.local`（仅在变量未设置时加载）。
支持渠道：`email` / `feishu` / `dingtalk` / `wecom` / `wechat-work` / `whatsapp`。

## 各渠道配置示例

### Email（Resend）

```json
{
  "channel": "email",
  "config": {
    "mode": "resend",
    "from": "RSS Digest <digest@yourdomain.com>",
    "to": ["you@example.com"],
    "resendApiKey": "re_xxxx",
    "dryRun": true
  }
}
```

### Email（SMTP）

```json
{
  "channel": "email",
  "config": {
    "mode": "smtp",
    "from": "your_email@qq.com",
    "to": ["you@example.com", "team@example.com"],
    "smtpHost": "smtp.qq.com",
    "smtpPort": 465,
    "smtpSecure": true,
    "smtpUser": "your_email@qq.com",
    "smtpPass": "your_app_password"
  }
}
```

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

1. 先执行格式化，确认 `tmp/formatted-<channel>.json` 结构正确
2. 再切换目标渠道并启用 `dryRun`
3. dryRun 通过后再真实发送
4. 若报超长，先降低 `topN/otherTopN`，再调分片参数
5. 首次接入渠道时，优先阅读 `reference/GUIDE-delivery-setup.md`

## 相关文件

- `scripts/output-formatter.js`
- `scripts/delivery.js`
- `reference/GUIDE-delivery-setup.md`
- `reference/TEMPLATE-delivery-onboarding.md`
- `reference/GUIDE-technical.md`
