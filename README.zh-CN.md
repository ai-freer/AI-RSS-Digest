# AI-RSS-Digest

[English](README.md) · [完整执行流程](SKILL.md)

Agent 驱动的 RSS 阅读工作流：先评审“值不值得读”，再做精读和摘要。

## 4.0 的变化

- 抓取保留完整候选池，Agent 评审相关性、重要性、信息增量、证据和可用性，程序按类型计算分数。
- 同事件只选一篇代表，近七天出刊历史抑制重复，后续进展需说明新增事实并引用正文。
- 正文不足或时间未核实保留 pending；漏评、非法分数、虚构引文、快照失配会报错，不自动退回旧榜单。
- 每七期复盘；支持人工标注和离线评测，不自动创建后台任务或调用外部 LLM API。
- 中文 A 级源继续启用，AIHOT 沿用官方 RSS，不解析新旧网页。

## 安装与更名

需要 Node.js >=18。安装到 Agent skills 目录下的 `ai-rss-digest` 后执行：

```bash
npm ci --omit=dev --no-audit --no-fund
```

展示名 **AI-RSS-Digest**，机器标识 `ai-rss-digest`，版本 4.0.0。验证新入口后退役旧 ak-92rss-digest。仓库已统一为 [ai-freer/AI-RSS-Digest](https://github.com/ai-freer/AI-RSS-Digest)，开发目录为 `AI-RSS-Digest`；运行数据放在安装目录外。

## 使用

唯一标准命令见 [SKILL.md](SKILL.md)：

```text
抓取 → 编辑评审 → 校验选稿 → Tier1 全文与精读
→ Tier2 汇总 → 合并校验 → 格式化 → 出刊记录
```

RUN 设置为每期独立绝对路径，后续步骤使用 fetch-selected.json。零入选是正常结果，不凑数。

默认历史为 `~/.local/share/ai-rss-digest/ledger.json`，本机客户端共享。不同读者/项目指定独立 --ledgerFile。本地完成与外部发送分开，不隐式发送消息。

## 验证与局限

`npm test` 运行离线行为与回归测试。语义评分、来源归属和事件 ID 仍由 Agent 判断，字符串校验不能保证事实正确。初始门槛 65 待用户金标校准，测试通过不等于已证明选稿效果提升。

- [设计与借鉴](reference/EDITORIAL-DESIGN.md)
- [技术合同](reference/GUIDE-technical.md)
- [模板](reference/GUIDE-templates.md)
- [信源](reference/GUIDE-sources.md)
