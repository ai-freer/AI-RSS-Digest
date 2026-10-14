# 编辑流程借鉴与边界

2026-10-14 参考 [KKKKhazix/AIHOT](https://github.com/KKKKhazix/AIHOT)，固定审阅版本 e57da5a4f151892a217529744cd68803aec580df。本项目独立实现适配单用户、本地 Agent 的流程，未复制其运行平台、生产信源清单或运营数据。

- [筛选机制](https://github.com/KKKKhazix/AIHOT/blob/e57da5a4f151892a217529744cd68803aec580df/docs/selection.md)：区分相关性与价值，类型化评审、失败不放行、金标评测。
- [评分提示词](https://github.com/KKKKhazix/AIHOT/blob/e57da5a4f151892a217529744cd68803aec580df/industry/prompts/selection-score.md)：事件价值、证据边界、读者对象、宣传与例行更新上限。
- [归组定义](https://github.com/KKKKhazix/AIHOT/blob/e57da5a4f151892a217529744cd68803aec580df/industry/prompts/group-definitions.md)：同次发生、同一故事、无关、盘点的区别；新进展不等于重复报道。

## 适配取舍

1. 无外部评分 API，Agent 结构化判断、本地计算分数。先采用一次明确评审，不把同一上下文重复评分声称为独立复核。
2. 面向开发者、产品与长期知识阅读，保留 AI 之外的重要技术内容，不移植来源分级阈值。
3. 不扩源、不复制服务集群，使用 JSON 快照和持久 ledger。
4. 出刊记录和每七期复盘由运行流程触发，不默认部署定时服务；复盘必须结合完整决策与用户反馈。
5. 阈值和权重是初始方案，尚无人类金标证明优于旧排序。逐步积累 100–200 条难例，分开发/留出集，先改规则再调阈值。

暂未实现自动来源质量学习、独立参与方热度、向量召回、多模型自动交叉评审；需要实际错例和评测收益后再考虑。
