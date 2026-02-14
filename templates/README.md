# Prompt 模板使用指南

## 5 大模板总览

| 模板 | 文件 | 目标用户 | 核心场景 | 时间 | 内容量 | 特色 |
|------|------|---------|---------|------|--------|------|
| **Daily** | `prompt-daily.md` | 所有用户 | 日常阅读 | 20分钟 | 主榜 TopN + 分类速览 + 次级榜 | 适合人群标签 |
| **Quick** | `prompt-quick.md` | 忙碌用户 | 快速判断 | 3分钟 | 主榜 TopN（更少）+ 次级榜标题 | **不做详细摘要**，只给价值标签🔴🟡🟢 |
| **Tech Dev** | `prompt-tech-dev.md` | 开发者/架构师 | 技术选型/学习 | 30分钟 | 主榜 TopN + 次级榜 | 技术雷达(Adopt/Trial/Assess/Hold) |
| **Product** | `prompt-product.md` | PM/产品猎手 | 产品创新 | 20分钟 | 主榜 TopN + 次级榜 | 市场机会 + 可借鉴性评估 |
| **Executive** | `prompt-executive.md` | 高管/决策者 | 战略决策 | 15分钟 | 主榜 TopN + 次级榜 | 战略影响 + 行动建议 + 风险预警 |

### Quick vs Daily 核心区别

| 维度 | Daily | Quick |
|------|-------|-------|
| **主榜数量** | TopN（默认可设为 5） | TopN（默认可设为 3，更严格） |
| **次级内容** | 分类速览 + OtherTopN（可含摘要） | OtherTopN 标题速览（无详细摘要） |
| **核心目标** | 给你今日资讯摘要与阅读顺序 | 帮你快速决策先读哪几篇 |
| **阅读时间** | 20分钟 | **3分钟** |
| **使用场景** | 晚上深度阅读 | **早晨快速规划** |

**一句话区别**：
- **Daily**："给你主榜 + 次级榜的完整阅读地图"
- **Quick**："先给你最值得读的主榜，次级榜只做快速扫读"

---

## 如何选择模板

### 按时间场景

| 时间 | 推荐模板 | 理由 |
|------|---------|------|
| 早晨通勤 | **Quick** | 3分钟判断今日阅读计划 |
| 工作日晚间 | **Daily** | 标准深度，20分钟阅读 |
| 周末上午 | **Tech Dev** / **Product** | 深度学习，技术研究 |
| 周一晨会前 | **Executive** | 战略视角，制定计划 |

### 按角色场景

| 角色 | 推荐模板 | 关注重点 |
|------|---------|---------|
| 后端开发 | **Tech Dev** | 架构选型、性能优化 |
| 产品经理 | **Product** | 竞品分析、设计灵感 |
| 技术负责人 | **Tech Dev** + **Executive** | 技术 + 战略 |
| 创业者 | **Product** + **Executive** | 产品 + 商业 |
| CTO/CEO | **Executive** | 战略决策 |

### 按内容场景

| 内容类型 | 推荐模板 |
|---------|---------|
| 技术教程/新框架发布 | **Tech Dev** |
| 产品发布/设计案例 | **Product** |
| 融资/市场动态 | **Executive** |
| 安全漏洞/重要更新 | **Quick** (紧急) 或 **Executive** (影响评估) |

---

## Breaking News 处理机制

**Breaking News 不是独立模板，而是一种叠加模式**

### 触发条件
当检测到以下内容时，自动触发 Breaking News 模式：
- 重大安全漏洞（如 Log4j、HeartBleed 级别）
- 重要产品发布（如 GPT-4、iPhone 发布）
- 行业重大事件（如并购、政策变化）

### 处理方式
使用 **Quick** 模板 + 以下增强：

1. **时效性强调**
   - 在标题中添加 [🔴突发]
   - 优先展示时间敏感信息

2. **影响范围评估**
   - 添加 `impactScope`: 影响的用户/公司/行业
   - 添加 `urgency`: 紧急程度（立即处理/24小时内/本周内）

3. **行动建议前置**
   - 将 `action` 字段提前到最显眼位置
   - 给出具体可执行的建议

### 示例流程

```
检测到 "OpenAI 发布 GPT-5"
    ↓
使用 Quick 模板 + Breaking News 增强
    ↓
输出:
    🔴 [突发] OpenAI 发布 GPT-5
    影响范围: 所有 AI 应用开发者
    紧急程度: 本周内关注
    行动建议: 评估现有产品是否需要接入
```

---

## 模板字段对照表

### 通用字段（所有模板）
- `date`: 日期
- `summary.totalArticles`: 文章总数
- `summary.categories`: 各分类数量
- `highlights`: 精选推荐数组
- `topArticles`: 主榜文章数组（来自 RSS 排序层）
- `otherTopArticles`: 次级推荐数组（来自 RSS 排序层）
- `byCategory`: 分类文章列表
- `metadata`: 元信息

### 特有字段

#### Quick 模板
- `highlights[].value`: 🔴🟡🟢 价值判断
- `highlights[].judgement`: 一句话价值判断
- `highlights[].readTime`: 预估阅读时间
- `quickList`: 速览列表（建议由 `otherTopArticles` 映射生成）

#### Tech Dev 模板
- `highlights[].techRadar`: 技术雷达评估
  - `ring`: Adopt/Trial/Assess/Hold
  - `useCase`: 适用场景
  - `risk`: 风险评估
- `highlights[].learning`: 学习路径分析
  - `prerequisites`: 前置知识
  - `difficulty`: 难度
  - `duration`: 学习时间
  - `practice`: 实践建议
- `highlights[].decision`: 决策支持
  - `mustRead`: 必读人群
  - `niceToRead`: 选读人群
  - `value`: ⭐1-5 参考价值
- `trendInsight`: 技术趋势洞察

#### Product 模板
- `highlights[].product`: 产品价值
  - `type`: 产品类型
  - `innovation`: 创新点
  - `ux`: 体验亮点
  - `businessModel`: 商业模式
- `highlights[].market`: 市场机会
  - `targetUser`: 目标用户
  - `marketSize`: 市场规模
  - `competition`: 竞争格局
  - `advantage`: 差异化优势
- `highlights[].hunter`: 产品猎手视角
  - `borrowable`: 可借鉴性 ⭐
  - `inspiration`: 灵感提取
  - `risk`: 风险提示
- `trendInsight`: 产品趋势观察

#### Executive 模板
- `highlights[].strategy`: 战略影响
  - `level`: 影响层级
  - `area`: 影响领域
  - `timeframe`: 时间维度
  - `certainty`: 确定程度
- `highlights[].business`: 商业价值
  - `marketImpact`: 市场影响
  - `competition`: 竞争格局
  - `opportunity`: 商业机会
  - `investment`: 投资启示
- `highlights[].action`: 行动建议
  - `mustRead`: 必读人群
  - `strategy`: 应对策略
  - `decision`: 决策要点
- `highlights[].risk`: 风险预警
  - `potential`: 潜在风险
  - `mitigation`: 应对预案
- `strategicAdvice`: 战略性建议
- `riskAlert`: 风险提示

---

## 使用示例

### 场景 1：技术选型
**用户**: 后端架构师，考虑是否采用某新数据库

**推荐模板**: Tech Dev

**关注字段**:
- `techRadar.ring`: 是否达到 Adopt 级别
- `learning.difficulty`: 团队学习成本
- `decision.value`: 是否值得投入

### 场景 2：产品决策
**用户**: PM，寻找产品灵感

**推荐模板**: Product

**关注字段**:
- `hunter.borrowable`: 能否借鉴
- `hunter.inspiration`: 具体可应用的功能点
- `market.competition`: 竞争态势

### 场景 3：战略规划
**用户**: CTO，制定下季度技术规划

**推荐模板**: Executive

**关注字段**:
- `strategy.timeframe`: 中长期趋势
- `business.opportunity`: 技术投入方向
- `action.strategy`: 具体行动建议

---

## 自定义模板

可以基于现有模板进行修改：

```bash
# 复制基础模板
cp prompt-daily.md prompt-custom.md

# 修改特定部分
# - 调整 Top N 数量
# - 添加/删除字段
# - 改变分析角度
```

### 推荐修改点

1. **调整精选数量**
   - 调整 `topN`：如 3（更精简）或 7（更详细）
   - 调整 `otherTopN`：控制次级榜长度，避免输出过长

2. **添加关注领域**
   - 在 Tech Dev 中添加特定技术栈关注（如 Go/云原生）

3. **定制输出格式**
   - 修改 `dailyAdvice` 为特定角色的建议（如"给后端开发的今日建议"）
