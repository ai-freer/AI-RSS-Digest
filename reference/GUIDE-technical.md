# AI-RSS-Digest 技术合同

命令以 [SKILL.md](../SKILL.md) 为准。Node >=18，无新增运行依赖。

| 产物 | 合同 |
|---|---|
| fetch-raw.json | 全部 candidates；旧榜单仅发现排序，editorialStatus=unreviewed |
| editorial-packet.json | 候选/策略/提示词哈希/近七天历史/ledgerHash/packetId |
| editorial-review.json | 可评审 candidates 的所有 ID 恰好一次，真实 reviewer/reviewedAt，与 packetId 匹配 |
| fetch-selected.json | 兼容 topArticles/otherTopArticles；完整 editorial.decisions 和统计 |
| fetch-enriched.json | Tier1 全文；AIHOT 按明确原文链接补抓，失败回退 RSS 并标注仅基于摘要 |
| deep-read-results.json / tier2-raw.json | 精读和速览；保持链接/层级/顺序 |
| summary.json / output.* | 经质量闸门的摘要和格式化产物 |
| ledger.json | 安装目录外持久历史，成功后原子写入 |

## 身份与时间

时间窗默认 24 小时。缺失发布时间保持 null；未来日期和缺失时间在选稿时 pending。URL 只移除已知追踪参数，保留业务查询和 fragment；备用 GUID 去重按源隔离，指纹保留 Unicode 字母数字。

保留所有候选及正文，不按旧榜单截断。SHA-256 packetId 绑定内容/规则/提示词哈希/历史；这不是数字签名，不能阻止主动伪造整个文件。

## 评分与归组

分数 = round(20 * sum(axisScore * axisWeight) / sum(axisWeight))，再应用 cap。每项整数 0–5。类型权重和门槛由 policy 指定，不按来源 A/B 自动加分。

同 eventId 优先有正文依据的 primary，再按分数和稳定 ID 选代表。事件按分数排序并执行单源/本期容量限制。history 相同事件或 URL 被抑制；同故事 update 需引用既有事件、具体新事实和正文证据。语义仍依赖 Agent，需抽查误合并与漏合并。

## 历史与失败

prepare/select 不写历史。record 校验 qualityGates.applied、两层名单的数量/链接/顺序，排他锁加同目录临时文件原子替换。历史变动需重新评审；同 packet 同 summary 重复记录幂等。不要不检查进程就删除锁。

历史保留全部期次，去重窗口按 recordedAt 的最近七天。每七期返回 retrospectiveDue，本地出刊不代表外部投递成功。

## 评测

evaluate 接受人工 [{id,label}]，label=select/reject/either。对象是最终入选，包含事件抑制和名额限制；比较规则时固定候选、历史、容量和标签语义。

本地待定/延期、Agent pending、缺失计 failure，降低 coverage 和全量准确率；precision/recall/F1 基于已决案例，必须同时报告前两者，either 不计。测试夹具是合成行为测试，不是金标。归组另建成对人工检查。

## 4.1 采集与本地预筛

XML 使用已有 jsdom 依赖统一解析，支持属性、命名空间、CDATA、Atom XHTML/HTML 实体；优先 content:encoded/content，回退 description/summary。格式错误抛错交给既有源错误记录，不静默当作空源。

supplement 产出 fetch-ready.json，默认 bodyBudget=20，按来源轮转补正文；缺时间/未来日期/无 HTTP(S) URL 不请求，AIHOT RSS-only。失败和超预算均留记录，已有短正文不因长度受罚。补充后的 content/contentMeta 与 packet 一起绑定，精读复用成功网页正文。

packet schemaVersion=2：candidates 为可评审项，localDecisions 保存其余原始条目及处理原因，candidateCount 为二者总数。prompt 不复制 localDecisions 正文，仅附计数。select 校验 ID 总数守恒且互不重复，最终 decisions 合并两种来源。旧 schemaVersion=1 packet 仍按原完整评审合同回放；不得修改旧 packet 强行迁移。

coverageDiagnostics 在至少 10 条且正文覆盖率低于 20% 时告警；原始采集诊断与补充后诊断分别保留。outcome=pending-input 表示零入选且还有待定/延期，不能视为质量评审后无好文章；no-selection 表示无候选或无入选。

## 4.1.1 聚合源配额

policy 1.1.0 将发现渠道与发布方配额分开。AIHOT 仅从 RSS HTML 中唯一且明确标为“阅读原文”的外部 HTTP(S) 链接提取 origin；普通引用链接、歧义链接和站内链接不推测归属。按 hostname（去 www）计数，X/Twitter 的明确 status 链接按账号计数。相同发布方直采与聚合共享 maxPerSource=3；未知 AIHOT 发布方的独立桶默认上限 6，可配置。不同子域暂不推断为同一媒体集团，跨账号同一实体也不自动合并，仍以事件去重约束重复报道。

每条参与配额的决策保存 sourceQuota.key/limit/basis 供审计。旧策略没有 aggregatorSources 时沿用 source 字段配额，以保持旧快照可回放。抓取兼容榜单仍是发现排序，正式选稿必须使用完整 candidates，不能把它当成最终配额结果。

AIHOT 原文补抓仅适用于已评审 Tier1，单次请求、15 秒超时、禁止自动重定向及重试。fullContentMeta 记录原文链接、发现链接、抓取状态与失败原因；同一 enriched 快照可复用。后续合并与摘要校验须使用 fetch-enriched.json 保留来源边界；record 继续使用原选稿文件。网页与 RSS 的语义一致性由精读 Agent 复核，发现矛盾返回评审，不自动修改已绑定 packet。

正文质量判定见 scripts/content-quality.js：识别安全检测页与 X 明确截断信号，错误码 challenge-page / x-truncated 经 fullContentMeta 传到精读与最终摘要。普通源回退也标注“仅基于摘要”。scripts/fixtures/content-quality-2026-10-25.json 保存实跑提取文本（非原始 HTML），测试用合成 HTML 包装复现提取链路。短文本不等于截断，检测不替代人工语义核验。
