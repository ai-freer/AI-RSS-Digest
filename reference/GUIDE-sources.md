# RSS 源与筛选机制指南

## 目的

说明 RSS 源清单结构、筛选参数与下游模块的职责边界。

## 源清单结构

抓取脚本：`scripts/rss-fetcher.js`

- `BASE_RSS_FEEDS`：国际/英文主清单
- `CN_RSS_FEEDS`：中文候选源（分 A/B）
- `buildFeedList({ includeCN, cnTier })`：默认包含 A 级中文源，可按参数调整

源清单文档：

- `RSS_FEEDS.md`
- `RSS_FEEDS_CN.md`

## 分类与筛选

动态分类类别（用于摘要和统计）：

- 编程
- AI
- 系统
- 硬件
- 安全
- 创业
- 综合

说明：

- 源上的 `tags` 主要用于筛选
- 最终分类由摘要阶段按内容推断

## 抓取层参数

`scripts/rss-fetcher.js` 支持：

- `--tagFilter`：按源标签过滤（逗号分隔）
- `--includeCN`：是否接入中文源（默认 `true`，可传 `false` 关闭）
- `--cnTier`：`A` / `B` / `ALL`
- `--languageFilter`：`all` / `zh` / `global`
- `--hours`：时间窗口
- `--topN` / `--otherTopN`：分层输出数量

## 常见组合

只看中文源：

```bash
node scripts/rss-fetcher.js --languageFilter zh --cnTier A --topN 7 --otherTopN 20 --outFile tmp/fetch-zh.json
```

国际源快速扫描：

```bash
node scripts/rss-fetcher.js --languageFilter global --topN 5 --otherTopN 15 --outFile tmp/fetch-global.json
```

混合源（默认基础源 + 中文 A 级）：

```bash
node scripts/rss-fetcher.js --hours 24 --outFile tmp/fetch-mixed.json
```

混合源（包含中文 A/B 级）：

```bash
node scripts/rss-fetcher.js --cnTier ALL --hours 24 --outFile tmp/fetch-mixed-all.json
```

## 与后续模块关系

1. `rss-fetcher`：抓取、筛选、排序、分层
2. `prepare-prompt`：把抓取结果转为摘要 Prompt
3. Agent：按 Prompt 生成摘要 JSON
4. `validate-summary`：归一化结构与质量修复
5. `output-formatter`：按渠道生成消息 payload

## 相关文件

- `scripts/rss-fetcher.js`
- `scripts/prepare-prompt.js`
- `scripts/validate-summary.js`
- `scripts/summary-utils.js`
- `RSS_FEEDS.md`
- `RSS_FEEDS_CN.md`
- `SKILL.md`
