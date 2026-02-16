# Prompt 模板与选择指南

## 模板体系总览

模板目录：`templates/`

- `prompt-daily.md`
- `prompt-quick.md`
- `prompt-tech-dev.md`
- `prompt-product.md`
- `prompt-executive.md`
- `prompt-summarize-tiered.md`

注意：项目中没有 `templates/prompt.md`。

## 模板分工

### 5 个策展模板（用于阅读策略）

| 模板 | 文件 | 场景 |
|---|---|---|
| Daily | `prompt-daily.md` | 日常完整阅读 |
| Quick | `prompt-quick.md` | 快速扫描 |
| Tech Dev | `prompt-tech-dev.md` | 技术选型/学习 |
| Product | `prompt-product.md` | 产品洞察 |
| Executive | `prompt-executive.md` | 决策视角 |

### 1 个摘要模板（用于结构化输出）

| 模板 | 文件 | 场景 |
|---|---|---|
| Tiered Summary | `prompt-summarize-tiered.md` | Tier1/Tier2 JSON 摘要 |

## 在新流程中的使用方式

1. `rss-fetcher` 产出 `fetch.json`
2. `prepare-prompt` + `prompt-summarize-tiered.md` 组装摘要 Prompt
3. Agent 根据 Prompt 生成 `summary-raw.json`
4. `validate-summary` 校验并归一化

示例：

```bash
node scripts/prepare-prompt.js \
  --fetchFile tmp/fetch.json \
  --template templates/prompt-summarize-tiered.md \
  --outFile tmp/prompt.txt
```

## 模板选择建议

- 时间很少：`prompt-quick.md`
- 常规工作日：`prompt-daily.md`
- 技术深度学习：`prompt-tech-dev.md`
- 产品分析：`prompt-product.md`
- 管理决策摘要：`prompt-executive.md`

## Breaking News 说明

Breaking News 不是独立文件，可在 Quick 场景中叠加：

- 突发标记
- 影响范围
- 优先行动建议

## 与脚本关系

- `scripts/prepare-prompt.js`：把摘要模板与抓取数据组装成最终 Prompt
- `scripts/summary-utils.js`：提供 Prompt 组装函数
- `scripts/validate-summary.js`：对 Agent 产出的摘要结构做校验
- `scripts/output-formatter.js`：消费校验后的结构化摘要

## 相关文件

- `templates/README.md`
- `templates/prompt-daily.md`
- `templates/prompt-quick.md`
- `templates/prompt-tech-dev.md`
- `templates/prompt-product.md`
- `templates/prompt-executive.md`
- `templates/prompt-summarize-tiered.md`
