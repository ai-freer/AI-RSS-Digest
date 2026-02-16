# 投递渠道配置引导（Agent Playbook）

## 适用范围

本指南用于指导 Agent 在 Cursor / Claude Code 中，帮助普通用户完成投递渠道配置。

- 目标：让用户从 0 到 1 配好自己的投递渠道
- 范围：Email / Feishu / DingTalk / WeCom / WhatsApp
- 原则：先 `dryRun`，后真实发送；先能通，再优化

快速入口：

- 首轮一键话术模板：`reference/TEMPLATE-delivery-onboarding.md`

## 总体流程

```text
选择渠道 -> 获取凭证 -> 写入 .env -> dryRun 验证 -> 真实发送 -> 故障排查
```

推荐对话节奏：

1. 确认用户想要的目标渠道
2. 明确该渠道所需最小配置项
3. 一步一步指导用户获取凭证
4. 指导用户写入 `.env`
5. 执行 dryRun 并解释结果
6. dryRun 通过后执行真实发送

---

## 通用准备

### 前置文件

- 输出文件：`tmp/formatted-<channel>.json`
- 投递脚本：`scripts/delivery.js`
- 配置样例：`.env.example`

### 通用验证命令

```bash
node scripts/delivery.js \
  --input tmp/formatted-email.json \
  --channel email \
  --dryRun
```

将 `--channel` 和 `--input` 替换为目标渠道。

### 常见错误（通用）

- `Missing required argument: --input`：缺少输入文件参数
- `Missing required argument: --channel`：缺少渠道参数
- `Missing required config: ...`：凭证未配置或配置名写错
- `Unknown channel: ...`：渠道值不在支持列表中

---

## Email 配置（重点）

Email 是最常见渠道，推荐提供两种方式：`resend` 和 `smtp`。

### Email 最小配置项

- `EMAIL_MODE`: `resend` 或 `smtp`
- `EMAIL_FROM`: 发件人
- `EMAIL_TO`: 收件人（支持逗号分隔多个）

---

### 方式一：Resend API（推荐）

优点：配置简单、无需额外依赖、适合快速上线。

#### 步骤 1：获取 Resend API Key

1. 注册 Resend 账号
2. 在控制台创建 API Key
3. 复制 Key（形如 `re_xxx`）

#### 步骤 2：写入 `.env`

```env
EMAIL_MODE=resend
EMAIL_FROM=RSS Digest <digest@yourdomain.com>
EMAIL_TO=you@example.com
RESEND_API_KEY=re_xxxx
```

#### 步骤 3：dryRun 验证

```bash
node scripts/delivery.js \
  --input tmp/formatted-email.json \
  --channel email \
  --dryRun
```

期望结果：返回 `success: true`、`mode: "resend"`，并展示将发送的 payload。

#### 步骤 4：真实发送

```bash
node scripts/delivery.js \
  --input tmp/formatted-email.json \
  --channel email
```

#### 常见问题

- 发件人域名未验证：先使用 Resend 默认测试发件人，后续再绑定自定义域名
- API Key 权限不足：重新创建 Key 并确认可发送邮件
- 邮件进垃圾箱：优化发件人名称、域名信誉、正文格式

---

### 方式二：SMTP（QQ/163/Gmail/企业邮箱）

优点：可复用现有企业邮件体系；适合已有 SMTP 服务的团队。

#### 步骤 1：准备 SMTP 凭证

- `SMTP_HOST`
- `SMTP_PORT`（常用 465 或 587）
- `SMTP_USER`
- `SMTP_PASS`（通常是授权码，不是登录密码）
- `SMTP_SECURE`（465 通常 `true`，587 常为 `false`）

#### 步骤 2：安装可选依赖

```bash
npm install nodemailer
```

#### 步骤 3：写入 `.env`

```env
EMAIL_MODE=smtp
EMAIL_FROM=your_email@qq.com
EMAIL_TO=you@example.com,team@example.com
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your_email@qq.com
SMTP_PASS=your_app_password
```

#### 步骤 4：dryRun 验证

```bash
node scripts/delivery.js \
  --input tmp/formatted-email.json \
  --channel email \
  --dryRun
```

#### 步骤 5：真实发送

```bash
node scripts/delivery.js \
  --input tmp/formatted-email.json \
  --channel email
```

#### 常见问题

- 报错 `SMTP mode requires nodemailer`：未安装 `nodemailer`
- 认证失败：确认使用授权码而非登录密码
- TLS/端口错误：465 常搭配 `SMTP_SECURE=true`；587 常搭配 `false`

---

## Feishu 配置

### 最小配置项

- `FEISHU_WEBHOOK_URL` 或 `FEISHU_WEBHOOK_ID`

### 获取方式

1. 进入目标群
2. 打开群设置 -> 群机器人
3. 添加自定义机器人
4. 复制 Webhook 地址

### `.env` 示例

```env
FEISHU_WEBHOOK_URL=https://open.feishu.cn/open-apis/bot/v2/hook/xxxx
```

### 验证命令

```bash
node scripts/delivery.js \
  --input tmp/formatted-feishu.json \
  --channel feishu \
  --dryRun
```

---

## DingTalk 配置

### 最小配置项

- `DINGTALK_ACCESS_TOKEN`
- `DINGTALK_SECRET`（若机器人开启了加签）

### 获取方式

1. 进入群设置 -> 智能群助手
2. 添加自定义机器人
3. 记录 AccessToken 和 Secret

### `.env` 示例

```env
DINGTALK_ACCESS_TOKEN=xxxx
DINGTALK_SECRET=SECxxxx
```

### 验证命令

```bash
node scripts/delivery.js \
  --input tmp/formatted-dingtalk.json \
  --channel dingtalk \
  --dryRun
```

---

## WeCom 配置

### 最小配置项

- `WECOM_KEY`

### 获取方式

1. 进入企业微信群
2. 添加群机器人
3. 复制机器人 Key

### `.env` 示例

```env
WECOM_KEY=xxxx
WECOM_MAX_BYTES=2048
```

### 验证命令

```bash
node scripts/delivery.js \
  --input tmp/formatted-wecom.json \
  --channel wecom \
  --dryRun
```

说明：企业微信单条消息长度有限，脚本会自动分片。

---

## WhatsApp 配置

### 最小配置项

- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_RECIPIENT_PHONE`

### `.env` 示例

```env
WHATSAPP_ACCESS_TOKEN=EA...
WHATSAPP_PHONE_NUMBER_ID=1234567890
WHATSAPP_RECIPIENT_PHONE=+8613800000000
WHATSAPP_MAX_CHARS=4096
```

### 验证命令

```bash
node scripts/delivery.js \
  --input tmp/formatted-whatsapp.json \
  --channel whatsapp \
  --dryRun
```

---

## Agent 对话引导协议（必须遵循）

当用户提到“投递 / 发送 / 推送 / 通知”时，按下列顺序引导。

### Step A：确认目标

标准提问：

1. 你想发到哪个渠道？（Email / Feishu / DingTalk / WeCom / WhatsApp）
2. 你是先做联调（dryRun）还是直接实发？

### Step B：收集最小必填项

使用“动态追问”而不是一次性分渠道展开：

1. 先确认用户已选渠道（可多选）
2. 每次只追问当前渠道的最小必填项
3. 收到后立即进入 `.env` 核对与 dryRun

推荐直接复用：`reference/TEMPLATE-delivery-onboarding.md` 的模板 B。

按渠道只问必须项，减少用户负担。

- Email(resend)：`EMAIL_FROM`、`EMAIL_TO`、`RESEND_API_KEY`
- Email(smtp)：`EMAIL_FROM`、`EMAIL_TO`、`SMTP_HOST`、`SMTP_PORT`、`SMTP_SECURE`、`SMTP_USER`、`SMTP_PASS`
- Feishu：`FEISHU_WEBHOOK_URL`
- DingTalk：`DINGTALK_ACCESS_TOKEN`（可选 `DINGTALK_SECRET`）
- WeCom：`WECOM_KEY`
- WhatsApp：`WHATSAPP_ACCESS_TOKEN`、`WHATSAPP_PHONE_NUMBER_ID`、`WHATSAPP_RECIPIENT_PHONE`

### Step C：配置写入与核对

引导用户写入 `.env` 后，逐项核对字段名和是否有多余空格。

### Step D：执行 dryRun

先 dryRun，检查：

- `success: true`
- `channel` 是否正确
- payload 是否符合预期（收件人、标题、消息体）

### Step E：执行真实发送

dryRun 通过后再实发。实发失败时优先查看 `error` 字段并按渠道排错。

### Step F：成功闭环

确认用户已在目标渠道看到消息，并记录最终可复用配置。

---

## 排错决策树（简版）

```text
success=false?
  ├─ Missing required config
  │   └─ 检查 .env 字段名、值是否为空
  ├─ HTTP xxx
  │   └─ 检查网络、凭证、平台限流
  ├─ business code 非 0
  │   └─ 检查平台安全策略/签名配置
  └─ 其他
      └─ 打印完整 result 并逐段定位
```

## 相关文件

- `scripts/output-formatter.js`
- `scripts/delivery.js`
- `.env.example`
- `reference/GUIDE-delivery.md`
- `reference/TEMPLATE-delivery-onboarding.md`
