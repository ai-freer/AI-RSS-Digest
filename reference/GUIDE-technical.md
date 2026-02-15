# 抓取、摘要与质量闸门技术指南

## 技术范围

本指南覆盖以下模块：

- `scripts/rss-fetcher.js`
- `scripts/ai-summarizer.js`
- `scripts/output-formatter.js`
- `scripts/feed-quality-monitor.js`

## 端到端技术流程

```text
RSS 源 -> 抓取与候选准备 -> 评分排序与分层 -> LLM 摘要 -> 质量闸门 -> 格式化输出
```

## 抓取策略（rss-fetcher）

核心配置：

- 并发：`CONCURRENCY = 5`
- 超时：`TIMEOUT = 10000` ms
- 重试：`RETRIES = 3`（指数退避）
- 时间窗口：`TIME_WINDOW_HOURS = 24`
- 正文长度裁剪：`MAX_CONTENT_LENGTH = 2000`

抓取质量控制：

- 解析：DOM 解析优先，正则回退兜底。
- 内容清洗：移除 HTML 标签和多余空白。
- 候选准备：先做轻量去重，再交给排序层处理。

轻量去重策略：

1. 优先标准化 URL 去重。
2. 其次 GUID 去重。
3. 最后标题+内容指纹去重。

## 排序与分层（rss-fetcher）

评分维度与权重：

- 时效性：35%
- 来源权重：25%
- 内容长度质量：25%
- 内容完整性：15%

分层输出：

- `topArticles`：主榜（默认由 `topN` 控制）。
- `otherTopArticles`：候选榜（默认由 `otherTopN` 控制）。

多样性控制：

- `maxPerSource` 默认 3，避免单一源挤占。
- `allowSourceOverflow` 可在候选不足时放宽配额补齐。

## 分层摘要架构（ai-summarizer）

默认模板：

- `templates/prompt-summarize-tiered.md`

默认模型：

- `gpt-4.1-mini`（可通过 `LLM_MODEL` 覆盖）

输出结构：

- Tier1（深度）：`summary`、`keyPoints`、`action`、`risk`
- Tier2（速览）：`oneLiner`
- 桥接字段：`highlights`、`byCategory`（兼容格式化层）

## 摘要质量闸门

`scripts/ai-summarizer.js` 会在输出阶段执行规则校验与自动修复：

- Tier1：
  - 摘要句数不足时尝试由 key points 重建。
  - `keyPoints` 不足会补齐到最小条数。
  - `action`/`risk` 为空时补默认建议。
- Tier2：
  - `oneLiner` 过短时兜底默认文案。
  - 过长时自动截断。

校验结果会写入：

- `metadata.qualityGates`
  - `applied`
  - `rules`
  - `warnings`

`scripts/output-formatter.js` 会把 warnings 聚合成可读摘要，并在渠道输出中展示 `🧪 质量闸门`。

## 无 LLM 时降级策略

`scripts/run-digest-once.js` 支持：

- `--allowHeuristicFallback`

开启后，当 LLM 调用失败，`ai-summarizer` 使用启发式摘要继续出结果，避免流程中断。

## Feed 健康监控（feed-quality-monitor）

脚本：

- `scripts/feed-quality-monitor.js`

能力：

- 批量探测 RSS 源健康状态与延迟。
- 自动分类失败原因（如超时、限流、鉴权、404）。
- 尝试发现替代 feed URL（主页与常见后缀探测）。
- 记录最新报告与历史快照。

输出文件默认路径：

- `tmp/feed-quality-latest.json`
- `tmp/feed-quality-history.jsonl`

建议定期运行（如每日/每周），只做“观测+建议”，不自动删源。

## 运行参数速查

抓取链路常用参数：

- `--hours`
- `--topN`
- `--otherTopN`
- `--includeCN`
- `--cnTier`
- `--languageFilter`

健康检测常用参数：

- `--include-cn`
- `--cn-tier`
- `--timeout-ms`
- `--concurrency`
- `--low-item-threshold`

## 最佳实践

成本控制：

- 优先使用 `gpt-4.1-mini`。
- 用 `topN` + `otherTopN` 控制摘要规模。
- 默认 24 小时时窗，避免过量历史内容。

质量保证：

- 保持源多样性，不追求极限去重。
- 定期复盘 `metadata.qualityGates` 警告类型。
- 依据阅读反馈调整 `maxPerSource` 和模板。

稳定性：

- 保持超时与重试配置默认值，避免过激参数。
- 启用 `--allowHeuristicFallback` 增强鲁棒性。
- 使用 feed 健康报告提前处理不稳定源。

## 相关文件

- `scripts/rss-fetcher.js`
- `scripts/ai-summarizer.js`
- `scripts/output-formatter.js`
- `scripts/feed-quality-monitor.js`
- `scripts/run-digest-once.js`
