# Delivery 一键引导话术模板（面向普通用户）

## 用途

当用户第一次说“想把摘要发到邮箱/飞书/其他平台”时，Agent 可直接使用本模板进行首轮收集与引导。

配套文档：

- 详细配置与排错：`reference/GUIDE-delivery-setup.md`
- 格式与投递接口：`reference/GUIDE-delivery.md`

---

## 模板 A：首轮统一开场（可直接复制）

```text
我来帮你把投递配置一次性跑通。先收集最少信息，我会先做 dryRun 验证，确认通过再实发。

请回复下面 4 项：
1) 目标渠道：email / feishu / dingtalk / wecom / whatsapp（可多选）
2) 你想先做：dryRun 还是直接实发（建议 dryRun）
3) 目标接收位置：
   - email: 收件邮箱
   - feishu/dingtalk/wecom: 目标群
   - whatsapp: 接收手机号
4) 你当前是否已拿到渠道凭证（如 webhook / token / key）？
   - 已拿到：请直接贴字段名和值（可打码前后几位）
   - 未拿到：我会按渠道一步步带你获取
```

---

## 模板 B：二轮动态追问（基于用户已选渠道）

```text
收到，你选择的是：<channel>。
为了继续，我只收集这个渠道的最小必填配置：
<required_fields>

请按下面格式回复（可打码前后几位）：
<field_1>=...
<field_2>=...
...

如果你还没拿到这些配置，我可以立刻一步步带你获取，拿到后我们先做 dryRun 再实发。
```

`<required_fields>` 填充规则（仅给 Agent 参考，不直接发给用户）：

- `email(resend)`：`EMAIL_FROM`、`EMAIL_TO`、`RESEND_API_KEY`
- `email(smtp)`：`EMAIL_FROM`、`EMAIL_TO`、`SMTP_HOST`、`SMTP_PORT`、`SMTP_SECURE`、`SMTP_USER`、`SMTP_PASS`
- `feishu`：`FEISHU_WEBHOOK_URL`（或 `FEISHU_WEBHOOK_ID`）
- `dingtalk`：`DINGTALK_ACCESS_TOKEN`（可选 `DINGTALK_SECRET`）
- `wecom`：`WECOM_KEY`
- `whatsapp`：`WHATSAPP_ACCESS_TOKEN`、`WHATSAPP_PHONE_NUMBER_ID`、`WHATSAPP_RECIPIENT_PHONE`

---

## 模板 C：配置写入确认（可直接复制）

```text
我将按你提供的信息写入 `.env`（你可先手动填写，我再帮你核对）。
写完后请把以下内容发我（可打码）：
- 涉及字段名是否齐全
- 每个字段是否有值
- 是否存在多余空格或换行

确认后我会执行 dryRun：
node scripts/delivery.js --input tmp/formatted-<channel>.json --channel <channel> --dryRun
```

---

## 模板 D：dryRun 结果解读（可直接复制）

### D1. 成功

```text
dryRun 通过了：
- success: true
- channel: <channel>
- payload 结构正常

下一步我建议执行真实发送。你确认后我就继续。
```

### D2. 失败

```text
dryRun 失败了，我来帮你定位。请把错误完整贴给我（尤其是 error 字段）。
我会按这三步排查：
1) 字段名是否匹配（例如 FEISHU_WEBHOOK_URL / EMAIL_TO）
2) 凭证是否为空或失效
3) 渠道限制（签名、长度、频率）
```

---

## 模板 E：实发确认与闭环（可直接复制）

```text
已完成实发。请你现在确认目标渠道是否已收到消息。

如果收到：
- 我会给你保存一份“可复用配置清单”
- 下次可直接复用同一套命令

如果未收到：
- 我会继续按渠道日志与回执逐项排查，直到打通为止
```

---

## 建议使用策略（给 Agent）

- 一次只问“最小必填项”，减少用户负担
- 强制先 dryRun，再实发
- 用户说“不会配”时，不要只给字段名，要给“去哪里点、怎么拿”的路径
- 如果用户跨多个渠道，按 “Email -> Feishu/WeCom/DingTalk -> WhatsApp” 顺序逐个打通
