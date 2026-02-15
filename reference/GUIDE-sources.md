# RSS 源与分类机制指南

## 目的

本指南说明 RSS 源清单、动态分类逻辑、语言/标签筛选参数，以及相关脚本文件之间的关系。

## 关键结论

- RSS 源分为两组：基础国际源 + 中文候选源。
- 最终文章分类由内容决定，不依赖源预分类标签。
- `tagFilter`、`includeCN`、`cnTier`、`languageFilter` 在抓取层生效。

## 源清单结构

抓取脚本位置：`scripts/rss-fetcher.js`

- `BASE_RSS_FEEDS`：国际/英文为主，当前 92 个。
- `CN_RSS_FEEDS`：中文候选源，当前 13 个，分 A/B 两级。
- `buildFeedList({ includeCN, cnTier })`：按参数组装最终源列表。

完整清单文档：

- `RSS_FEEDS.md`：英文/国际源清单（主清单）。
- `RSS_FEEDS_CN.md`：中文候选源清单。

## 7 大动态分类

动态分类类别（用于摘要与输出统计）：

- 编程
- AI
- 系统
- 硬件
- 安全
- 创业
- 综合

说明：

- RSS 源上的 `tags` 主要用于“源筛选”，不是最终文章分类。
- 最终分类由摘要侧模型/规则根据标题和正文内容判定。

## 分类示例

| 文章主题 | 源标签 | 最终分类 |
|---|---|---|
| React 新特性 | AI | 编程 |
| 树莓派集群搭建 | AI | 硬件 |
| LLM 漏洞分析 | AI | 安全 |
| 独立开发者收入复盘 | 编程 | 创业 |

## 抓取层筛选参数

这些参数由 `scripts/rss-fetcher.js` 的 `main({ params })` 接收：

- `tagFilter`：按源标签筛选，支持逗号分隔（如 `AI,安全`）。
- `includeCN`：是否启用中文源，默认 `false`。
- `cnTier`：中文源等级，`A` / `B` / `ALL`。
- `languageFilter`：`all` / `zh` / `global`。

补充：

- 当 `languageFilter=zh` 时，会自动启用中文源。
- 源筛选仅影响候选集合，不改变后续动态分类规则。

## 与后续模块关系

数据流中的“源侧”职责如下：

1. `scripts/rss-fetcher.js`
   - 负责源列表构建、抓取、筛选、排序分层。
2. `scripts/ai-summarizer.js`
   - 负责基于内容的分类推断和摘要结构化。
3. `scripts/output-formatter.js`
   - 使用摘要阶段给出的分类结果生成各渠道输出。

## 常见配置组合

只看中文源（A 级）：

```bash
node scripts/run-digest-once.js \
  --languageFilter zh \
  --cnTier A \
  --channel email
```

看国际源并按标签筛选：

```bash
node scripts/run-digest-once.js \
  --languageFilter global \
  --channel feishu
```

启用中英文混合并扩大中文覆盖：

```bash
node scripts/run-digest-once.js \
  --includeCN \
  --cnTier ALL \
  --channel dingtalk
```

## 相关文件

- `scripts/rss-fetcher.js`
- `RSS_FEEDS.md`
- `RSS_FEEDS_CN.md`
- `SKILL.md`
