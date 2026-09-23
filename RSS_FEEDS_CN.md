# 中文 RSS 候选源（AK 视角）

面向中文技术阅读场景的候选清单。目标是遵循 Andrej Karpathy 偏好的选源思路：

1. 优先原创一手观点，而不是新闻搬运。
2. 优先技术细节和方法论，而不是情绪化评论。
3. 保持覆盖面（编程/AI/系统/安全/创业），但每类只保留高信噪比源。

> A 级中文源默认启用；B 级按需接入。继续通过健康检测观察可用性与信噪比。

## A 级（优先接入）

| 分类 | 名称 | RSS/订阅地址 | 推荐理由 |
|------|------|--------------|----------|
| 编程 | 阮一峰科技爱好者周刊 | https://www.ruanyifeng.com/blog/atom.xml | 稳定、覆盖面广、筛选质量高 |
| 编程 | 云风 BLOG | https://blog.codingnow.com/atom.xml | 系统/引擎/工程实践深度高 |
| 编程 | 面向信仰编程 | https://draveness.me/atom.xml | Go/分布式/工程文章质量稳定 |
| 前端 | 张鑫旭博客 | https://www.zhangxinxu.com/wordpress/feed/ | 前端 CSS/浏览器细节非常扎实 |
| AI | 机器之心 | https://www.jiqizhixin.com/rss | 中文 AI 资讯中质量相对稳定 |
| AI 聚合 | AIHOT | https://aihot.news/feed/all.xml | 高质量中文 AI 动态聚合，适合早读；与一手信源去重 |
| AI | 量子位 | https://www.qbitai.com/feed | 行业动态更新快，适合早读 |
| 综合 | 少数派 | https://sspai.com/feed | 工具和方法论内容可读性强 |
| 创业 | 36氪 | https://www.36kr.com/feed | 商业与产品信息密度高 |
| 安全 | FreeBuf | https://www.freebuf.com/feed | 中文安全资讯覆盖度高 |
| 开源 | Linux 中国 | https://linux.cn/rss.xml | 开源生态和系统向内容较多 |

AIHOT 站点现为 https://aihot.news；旧域名 `aihot.virxact.com` 会重定向至新域名。其 [公开使用规则](https://aihot.news/terms) 允许个人非商业使用；对外商业使用需先取得授权。

## B 级（按需接入）

| 分类 | 名称 | RSS/订阅地址 | 使用建议 |
|------|------|--------------|----------|
| 社区 | V2EX 热门 | https://www.v2ex.com/index.xml | 仅做"热点雷达"，不宜高权重 |
| 创业 | 人人都是产品经理 | https://www.woshipm.com/feed | 需配合去重与质量过滤 |
| 安全 | 先知社区 | https://xz.aliyun.com/feed | 专题质量不均，建议低频观察 |
| 综合 | InfoQ 中文 | https://www.infoq.cn/feed | 可补充企业技术实践案例 |
| 综合 | 爱范儿 | https://www.ifanr.com/feed | 偏消费科技，建议低权重 |

## 选源与评分建议

建议在抓取端给中文源单独增加 `sourceWeightCN`，初始参考：

- A 级源：`1.1 - 1.2`
- B 级源：`0.9 - 1.0`
- 社区聚合类（如论坛热门）：`0.8 - 0.9`

## 接入前检查清单

1. RSS 是否稳定可访问（连续 7 天成功率 > 95%）。
2. 单源日均新内容是否过载（建议上限 15）。
3. 标题党/转载占比是否过高（建议 < 30%）。
4. 是否和现有英文源高度重复（避免噪声叠加）。

## 与现有英文源的组合建议

- 早晨：中文源 + Quick 模板（决策导向）。
- 晚间：英文深度源 + Daily/Tech Dev 模板（学习导向）。
- 周报：中文商业 + 英文技术，做跨域摘要。

## 当前脚本接入方式

已在抓取脚本 `scripts/rss-fetcher.js` 中接入中文源管理：

- `includeCN`：是否启用中文源（默认 `true`；传 `false` 可关闭）。
- `cnTier`：中文源等级筛选（`A` / `B` / `ALL`，默认 `A`）。
- `languageFilter`：语言筛选（`all` / `zh` / `global`，默认 `all`）。

示例参数：

```json
{
  "includeCN": true,
  "cnTier": "A",
  "languageFilter": "zh",
  "tagFilter": "AI,编程,中文",
  "hours": 24,
  "maxArticles": 50
}
```
