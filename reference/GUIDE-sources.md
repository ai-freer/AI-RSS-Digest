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

## 暂停的源

`enabled: false` 保留条目及 `disabledReason`，默认 `buildFeedList`、日报抓取和质量监测跳过；审计可调用 `buildFeedList({ includeDisabled: true })` 查看完整配置，不代表恢复抓取。日报及健康检测结果的 `skippedFeeds` 保留跳过原因，`stats.disabledFeeds` 为当前语言/标签范围内停用数量。

- **paulgraham.com**：2026-10-21 检查官网链接的 `http://www.aaronsw.com/2002/feeds/pgessays.rss`，219 条仅含 title/link，无日期及正文，列表落后于官网。暂停该 feed，保留名称、URL、标签及权重；不影响其他源，旧 feed 不恢复；官网通过独立增量采集接入。原始 OPML 作为来源清单保留，不是运行时启用配置。

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

## Paul Graham 官网增量采集

`scripts/paul-graham.js` 读取 `https://paulgraham.com/articles.html` 的文章列表。首次存储全部已有链接基线、零正文请求；后续新增 URL 入持久待处理队列，每次最多获取 3 篇正文，失败保留、轮转重试。请求超时 15 秒。索引为空/异常缩小或状态损坏时停止并报告，不自动重建基线；文件锁避免并发覆盖，原子写入保存状态。

默认状态 `~/.local/share/ai-rss-digest/paul-graham.json`，可通过抓取 CLI 的 `--paulGrahamStateFile` 覆盖，`--includePaulGraham false` 关闭。仅中文、无匹配标签、健康检测不运行此采集器。抓取输出 `paulGraham` 单独报告采集状态，不把官网请求混入 RSS 成功源计数。

成功正文缓存七天，在获取后的 --hours 窗口内重用以支持同日重跑；已发现链接永久保留，因此不回填基线历史，也不反复抓旧文。发现和正文获取时间分别记录，不能冒充发表时间。新发现长文只按 analysis/tutorial 评审；原文年月原样保留，pubDate 为空。摘要校验层添加【新发现长文】标题标记。
