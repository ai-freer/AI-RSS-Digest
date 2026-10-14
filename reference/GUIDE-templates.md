# AI-RSS-Digest 模板

| 模板 | 用途 |
|---|---|
| prompt-editorial.md | 全候选相关性、价值、事件归组与新增信息评审 |
| prompt-deep-read.md | Tier1 逐篇精读 |
| prompt-summarize-tiered.md | 已确定 Tier2 的忠实摘要 |
| prompt-retrospective.md | 每七期结合原始决策、人工标签和反馈复盘 |
| prompt-daily/quick/tech-dev/product/executive.md | 保留的阅读风格参考，不替代标准评审和精读 |

所有模式按 [SKILL.md](../SKILL.md) 同一流程进入。改变规则时更新 editorial-policy.json 的 version，重新 prepare 生成 promptHash/packetId，不能复用旧评审。发现证据错误返回选稿，不在摘要阶段悄悄换名单。
