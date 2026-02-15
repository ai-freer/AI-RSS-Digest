---
name: SKILL.md Refactor Plan
overview: 将工作区 SKILL.md（881 行）精简至 ~300 行主文档 + 4 个参考文档，不过度拆分，保持可维护性。
todos:
  - id: create-ref-dir
    content: 创建 reference/ 目录
    status: completed
  - id: guide-sources
    content: 创建 reference/GUIDE-sources.md（提取 64-138 行 RSS 源相关内容）
    status: completed
  - id: guide-technical
    content: 创建 reference/GUIDE-technical.md（提取 140-228 行抓取策略 + 总结策略 + 428-434 行质量闸门 + 860-881 行最佳实践）
    status: completed
  - id: guide-templates
    content: 创建 reference/GUIDE-templates.md（提取 230-427 行 Prompt 模板 + 436-446 行 Breaking News；修正 prompt.md 幽灵引用为 prompt-daily.md；整合 templates/README.md）
    status: completed
  - id: guide-delivery
    content: 创建 reference/GUIDE-delivery.md（提取 448-610 行输出格式 + 612-752 行自动化流程和投递配置；修正 663 行 prompt.md 引用）
    status: completed
  - id: rewrite-skill
    content: 重写 SKILL.md 为精简版（~300 行），保留总览/流程/快速开始/模板选择表/执行命令/文件索引；补充 feed-quality-monitor.js 到文件清单；添加子文档索引
    status: completed
  - id: cross-refs
    content: 验证所有文档间交叉引用和 scripts/templates 文件引用正确
    status: completed
  - id: verify
    content: 验收：SKILL.md 250-350 行，子文档内容完整无遗漏，所有文件引用对应实际存在的文件
    status: completed
isProject: false
---

# SKILL.md 重构计划（修正版）

## 现状

- 工作文件：[SKILL.md](SKILL.md)（881 行，v2.2.0）
- 内容已是最新（独立 Node.js 管道，6 个脚本，5+1 模板体系），无 Coze 残留
- 目标：精简至 ~300 行主文档 + 拆分出 4 个参考文档

## 已知的 SKILL.md 内容问题（重构时需修正）


| 问题                                        | 位置          | 修正方式                                             |
| ----------------------------------------- | ----------- | ------------------------------------------------ |
| `templates/prompt.md` 引用不存在               | 第 234、663 行 | 改为 `templates/prompt-daily.md`（实际默认 curation 模板） |
| `scripts/feed-quality-monitor.js` 未列入文件清单 | 第 835-858 行 | 补充到文件清单和 GUIDE-technical.md                      |
| 自动化步骤 3 模型写死 "Claude 3.5 Haiku"           | 第 661 行     | 改为"默认 gpt-4.1-mini（通过 LLM_MODEL 环境变量配置）"         |
| 测试文件未列入文件清单                               | 第 835-858 行 | 补充 `delivery.test.js`、`summary-pipeline.test.js` |


---

## 目标文档结构

```
rss-digest/
├── SKILL.md                     # ~300 行：总览、流程、快速开始、模板选择、文件索引
├── RSS_FEEDS.md                 # (已有，不动)
├── RSS_FEEDS_CN.md              # (已有，不动)
└── reference/
    ├── GUIDE-sources.md         # RSS 源清单 + 分类机制
    ├── GUIDE-technical.md       # 抓取策略 + 评分算法 + 分层摘要 + 质量闸门 + 最佳实践
    ├── GUIDE-templates.md       # Prompt 模板详解 + 选择指南 + Breaking News
    └── GUIDE-delivery.md        # 输出格式模板 + 自动化流程 + 投递配置
```

---

## 内容分配（精确行号和文件引用）

### SKILL.md（~300 行，精简重写）

保留内容（原文保留或轻微调整）：

- Header + 系统概述（1-28 行）
- 快速开始（30-62 行）
- 5 大模板选择表（352-393 行的简化版，只留总览表 + Quick vs Daily 关键区别）
- 一次性执行命令（785-820 行）
- 文件清单（835-858 行，**补充** `feed-quality-monitor.js` 和测试文件）
- 最佳实践摘要（860-881 行的精简版，详细内容移入 GUIDE-technical.md）

新增内容：

- 子文档索引（指向 4 个 reference/GUIDE-*.md）
- 核心流程一句话描述

移除/迁移的内容：

- 64-138 行 -> GUIDE-sources.md
- 140-228 行 -> GUIDE-technical.md
- 230-446 行 -> GUIDE-templates.md
- 448-752 行 -> GUIDE-delivery.md
- 754-833 行 -> 精简后部分保留（一次性执行命令保留，基础/高级配置命令可删）

---

### reference/GUIDE-sources.md

来源：SKILL.md 64-138 行

内容：

- AI 动态分类机制说明 + 7 大分类表（70-81 行）
- 分类示例表（82-89 行）
- RSS 源标签参考列表（91-132 行）
- `tagFilter` 参数说明（134 行备注）
- 完整清单指向 `RSS_FEEDS.md` / `RSS_FEEDS_CN.md`（136-138 行）

引用的实际文件：

- `RSS_FEEDS.md` -- 92 个英文 RSS 源完整清单
- `RSS_FEEDS_CN.md` -- 13 个中文候选源
- `scripts/rss-fetcher.js` -- 源定义和 `tagFilter` / `includeCN` / `cnTier` 参数的实现位置

---

### reference/GUIDE-technical.md

来源：SKILL.md 140-228 行 + 428-434 行 + 860-881 行

内容：

- 抓取核心功能代码块（142-176 行）：并发 5 / 超时 10s / 重试 3 次 / 去重 / 排序分层 / 错误处理
- 分层摘要架构 5 Level 图（180-202 行）
- 文章评分算法代码（204-228 行）
- 摘要质量闸门（428-434 行）：Tier1 修复 / Tier2 截断 / metadata.qualityGates / 输出展示
- Feed 健康监控说明（**新增**，SKILL.md 中未展开描述）
- 最佳实践（860-881 行）：成本控制 / 质量保证 / 稳定性

引用的实际文件：


| 引用                                     | 实际文件 | 角色                          |
| -------------------------------------- | ---- | --------------------------- |
| `scripts/rss-fetcher.js`               | 存在   | 抓取、去重、评分、排序分层               |
| `scripts/ai-summarizer.js`             | 存在   | Tier1/Tier2 摘要生成 + 质量闸门     |
| `scripts/output-formatter.js`          | 存在   | 质量闸门 warnings 展示            |
| `scripts/feed-quality-monitor.js`      | 存在   | Feed 健康监控（SKILL.md 未提及，需补充） |
| `templates/prompt-summarize-tiered.md` | 存在   | ai-summarizer.js 的默认摘要模板    |


---

### reference/GUIDE-templates.md

来源：SKILL.md 230-427 行 + 436-446 行

注意：428-434 行（质量闸门）划归 GUIDE-technical.md，不在此文档。

内容：

- 主提示词模板全文（232-346 行）：**修正**文件引用 `templates/prompt.md` -> `templates/prompt-daily.md`（原 prompt.md 不存在，prompt-daily.md 是实际替代品，内容一致）
- 5 大模板总览表 + Quick vs Daily 区别 + 选择指南（348-393 行）
- 如何使用各模板 bash 命令（396-415 行）
- 分层摘要模板说明（417-427 行）
- Breaking News 处理机制（436-446 行）

引用的实际文件：


| 引用                                     | 实际文件      | 说明                                           |
| -------------------------------------- | --------- | -------------------------------------------- |
| ~~`templates/prompt.md`~~              | **不存在**   | 需修正为 `templates/prompt-daily.md`             |
| `templates/prompt-daily.md`            | 存在        | 日常阅读（默认 curation 模板）                         |
| `templates/prompt-quick.md`            | 存在        | 快速扫描                                         |
| `templates/prompt-tech-dev.md`         | 存在        | 技术开发                                         |
| `templates/prompt-product.md`          | 存在        | 产品经理                                         |
| `templates/prompt-executive.md`        | 存在        | 高管/决策者                                       |
| `templates/prompt-summarize-tiered.md` | 存在        | 分层摘要模板（summary 阶段）                           |
| `templates/README.md`                  | 存在（237 行） | 模板详细使用指南（含字段对照表、使用示例、自定义指南）                  |
| `scripts/ai-summarizer.js`             | 存在        | 使用 summarize-tiered 模板                       |
| `scripts/run-digest-once.js`           | 存在        | 接受 --curationTemplate / --summaryTemplate 参数 |


与 `templates/README.md` 的关系：

- `templates/README.md` 已有 237 行详细内容（字段对照表、场景示例、自定义指南等）
- GUIDE-templates.md 侧重 SKILL.md 中的 Prompt 模板全文和总览选择
- 避免重复：GUIDE-templates.md 对 README.md 已有的详细内容（如字段对照表）做引用，不复制

---

### reference/GUIDE-delivery.md

来源：SKILL.md 448-752 行

内容：

- 输出格式模板代码（448-610 行）：邮件 HTML（450-518）/ 飞书 JSON（520-557）/ 钉钉 Markdown（559-590）/ 企业微信（592-594）/ WhatsApp（596-598）/ Webhook JSON（600-610）
- 自动化流程参考配置（612-685 行）：流程结构图 + 5 步骤说明
- 投递配置详细 JSON 示例（687-752 行）：飞书 / 钉钉 / 企业微信 / WhatsApp 的 webhook 获取方式和配置
- 调试建议（750-752 行）：dryRun / 重试参数

引用的实际文件：


| 引用                            | 实际文件    | 说明                                                     |
| ----------------------------- | ------- | ------------------------------------------------------ |
| `scripts/output-formatter.js` | 存在      | 6 种渠道格式化（email/feishu/dingtalk/wecom/whatsapp/webhook） |
| `scripts/delivery.js`         | 存在      | 多平台投递（重试/签名/分片/dry-run）                                |
| `scripts/rss-fetcher.js`      | 存在      | 自动化步骤 2                                                |
| ~~`templates/prompt.md`~~     | **不存在** | 第 663 行引用，需修正为 `templates/prompt-daily.md`（或"任一角色模板"）  |
| `scripts/run-digest-once.js`  | 存在      | 一次性完整链路执行                                              |


---

## 与原计划的差异

原计划（[skill-refactor.plan.md](.cursor/plans/skill-refactor.plan.md)）大体方向正确，修正点：

1. **SKILL.md 行数**：原计划写 "500+ 行"，实际 881 行
2. **GUIDE-usage.md 拆分**：原计划把 230-753 行全塞一个文件，拆为 GUIDE-templates.md（230-427 + 436-446）+ GUIDE-delivery.md（448-752），更聚焦
3. **GUIDE-operations.md 合并**：原计划独立 operations 文档，内容较少，自动化流程并入 GUIDE-delivery.md（612-685），最佳实践并入 GUIDE-technical.md（860-881）
4. **质量闸门归属**：428-434 行划归 GUIDE-technical.md（技术实现），不放在 GUIDE-templates.md
5. **幽灵引用修正**：SKILL.md 两处引用不存在的 `templates/prompt.md`，需改为 `templates/prompt-daily.md`
6. **缺失文件补充**：`scripts/feed-quality-monitor.js` 和测试文件需补入文件清单

---

## 验收标准

1. SKILL.md 行数在 250-350 之间
2. 能从 SKILL.md 快速定位到各专题文档（有清晰的子文档索引）
3. 各 `reference/GUIDE-*.md` 文档内容完整、无遗漏
4. 文档间链接正确
5. **所有 `scripts/xxx.js` 和 `templates/xxx.md` 引用对应实际存在的文件**
6. `templates/README.md` 的内容不重复复制，GUIDE-templates.md 做引用
7. SKILL.md 阅读时间 < 2 分钟

