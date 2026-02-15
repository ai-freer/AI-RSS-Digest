# Prompt 模板与选择指南

## 模板体系总览

当前模板目录：`templates/`

- `prompt-daily.md`
- `prompt-quick.md`
- `prompt-tech-dev.md`
- `prompt-product.md`
- `prompt-executive.md`
- `prompt-summarize-tiered.md`
- `README.md`

注意：

- 项目中**没有** `templates/prompt.md`。
- 过去文档中的 `prompt.md` 引用应统一改为 `prompt-daily.md`。

## 5 个策展模板（前置）

| 模板 | 文件 | 目标用户 | 场景 | 典型时长 |
|---|---|---|---|---|
| Daily | `prompt-daily.md` | 全部用户 | 日常阅读 | 20 分钟 |
| Quick | `prompt-quick.md` | 忙碌用户 | 快速判断 | 3 分钟 |
| Tech Dev | `prompt-tech-dev.md` | 开发者/架构师 | 技术选型/学习 | 30 分钟 |
| Product | `prompt-product.md` | PM/产品猎手 | 产品创新 | 20 分钟 |
| Executive | `prompt-executive.md` | 高管/决策者 | 战略决策 | 15 分钟 |

Quick 与 Daily 的关键差异：

- Quick 更强调“快速决策是否要读”，不做详细摘要。
- Daily 更强调“完整阅读地图”，保留主榜与分类速览。

## 分层摘要模板（后置）

文件：

- `prompt-summarize-tiered.md`

用途：

- 供 `scripts/ai-summarizer.js` 使用。
- 把抓取后的分层结果组织为：
  - Tier1 深度摘要
  - Tier2 一句话速览

## 使用方式

在运行链路中，建议区分“策展模板”和“摘要模板”：

```bash
node scripts/run-digest-once.js \
  --curationTemplate templates/prompt-daily.md \
  --summaryTemplate templates/prompt-summarize-tiered.md \
  --channel email
```

可替换为其它策展模板：

```bash
# 早晨快速扫描
--curationTemplate templates/prompt-quick.md

# 技术深度
--curationTemplate templates/prompt-tech-dev.md

# 产品洞察
--curationTemplate templates/prompt-product.md

# 战略决策
--curationTemplate templates/prompt-executive.md
```

## 场景推荐

按时间场景：

- 早晨通勤：Quick
- 工作日晚间：Daily
- 周末深度学习：Tech Dev / Product
- 周会前决策：Executive

按角色场景：

- 后端开发：Tech Dev
- 产品经理：Product
- 技术负责人：Tech Dev + Executive
- 创业者：Product + Executive

## Breaking News 叠加模式

Breaking News 不是独立模板，而是在 Quick 上叠加规则：

- 加 `[🔴突发]` 标记
- 前置行动建议
- 增加影响范围与紧急程度说明

详见：`templates/README.md` 的 Breaking News 章节。

## 字段与扩展能力

完整字段对照（包括 Quick/Tech/Product/Executive 专属字段）见：

- `templates/README.md`

建议：

- `GUIDE-templates.md` 放“选择与关系”
- `templates/README.md` 放“字段与示例细节”

这样可以避免重复维护相同信息。

## 与脚本关系

- `scripts/run-digest-once.js`
  - 接收 `--curationTemplate` / `--summaryTemplate`。
- `scripts/ai-summarizer.js`
  - 默认读取 `templates/prompt-summarize-tiered.md`。
- `scripts/output-formatter.js`
  - 消费摘要后的结构化字段，不直接读取模板文件。

## 常见错误与修正

错误引用：

- `templates/prompt.md`（不存在）

正确引用：

- `templates/prompt-daily.md`

如果你在旧文档中看到 `prompt.md`，统一替换为 `prompt-daily.md`。

## 相关文件

- `templates/README.md`
- `templates/prompt-daily.md`
- `templates/prompt-quick.md`
- `templates/prompt-tech-dev.md`
- `templates/prompt-product.md`
- `templates/prompt-executive.md`
- `templates/prompt-summarize-tiered.md`
- `scripts/run-digest-once.js`
- `scripts/ai-summarizer.js`
