---
name: Skill publish 机制
overview: 建立通用的 skill-publish 工具，实现从项目目录带版本发布到中央 hub，并修复 rss-digest 和 landing-page-generator 的 symlink 问题。
todos:
  - id: create-publish-script
    content: 创建 ~/.agents/bin/skill-publish 脚本（rsync + 版本提取 + dry-run + list）
    status: completed
  - id: setup-path
    content: 确保 ~/.agents/bin 在 PATH 中（检查 .zshrc）
    status: completed
  - id: publish-rss-digest
    content: 首次执行 skill-publish 将 rss-digest 发布到 hub
    status: completed
  - id: fix-rss-symlinks
    content: 删除 claude 独立拷贝，创建 claude/cursor/codex 三处 symlink 指向 hub
    status: completed
  - id: fix-landingpage-symlink
    content: 修复 codex landing-page-generator symlink 改为指向 hub
    status: completed
  - id: verify
    content: 验证所有工具目录能正确读到 hub 中的 SKILL.md
    status: completed
isProject: false
---

# Skill Publish 机制与 Symlink 修复

## 现状问题

- `~/.agents/skills/` 作为中央 hub，cursor/claude 通过 symlink 读取
- `rss-digest`：claude 里是独立拷贝（非 symlink），cursor/codex 里完全没有
- `landing-page-generator`：codex 里直接 symlink 到项目目录 `/Users/danielpan/AI_Workspace/Landingpages`，不经过 hub
- 缺少从项目目录发布到 hub 的机制

## 一、创建通用 `skill-publish` 脚本

放在 `~/.agents/bin/skill-publish`，可被任何 skill 项目复用。

**核心逻辑：**

- 输入：项目目录路径（默认当前目录）
- 从 SKILL.md 第一行提取 skill 名称，从 `version:` 行提取版本号
- 用 rsync 同步到 `~/.agents/skills/<name>/`，排除开发文件
- 排除列表：`.git/`, `node_modules/`, `tmp/`, `.cursor/`, `.env`, `.env.*`, `.DS_Store`, `*.log`, `coverage/`, `package-lock.json`
- 同步后在 hub 目标目录写入 `.publish-meta.json`，记录：版本号、发布时间、来源项目路径
- 支持 `--dry-run` 预览模式
- 支持 `--list` 查看所有已发布 skill 及版本

**用法示例：**

```bash
skill-publish                          # 在项目目录内执行
skill-publish /path/to/project         # 指定项目路径
skill-publish --dry-run                # 预览，不实际同步
skill-publish --list                   # 列出 hub 中所有 skill 版本
```

**版本提取方式**：从 SKILL.md 中匹配 `version: x.y.z` 格式（当前 rss-digest 为 `version: 2.3.1`）。

## 二、修复 symlink

**rss-digest（3 处操作）：**

- 删除 `~/.claude/skills/rss-digest/`（当前是独立拷贝目录）
- 创建 symlink：`~/.claude/skills/rss-digest` -> `../../.agents/skills/rss-digest`
- 创建 symlink：`~/.cursor/skills/rss-digest` -> `../../.agents/skills/rss-digest`
- 创建 symlink：`~/.codex/skills/rss-digest` -> `~/.agents/skills/rss-digest`（codex 用绝对路径，因为 codex 目录层级不同）

**landing-page-generator（1 处修复）：**

- 删除 `~/.codex/skills/landing-page-generator`（当前直接指向项目目录）
- 创建 symlink：`~/.codex/skills/landing-page-generator` -> `~/.agents/skills/landing-page-generator`（指向 hub，与 cursor/claude 一致）

## 三、首次发布 rss-digest 到 hub

在 hub 里创建 `~/.agents/skills/rss-digest/` 后，执行首次 publish 将项目内容同步过去。

**发布范围**（项目全部内容，排除开发文件）：

- 包含：SKILL.md, scripts/, templates/, reference/, resources/, RSS_FEEDS.md, RSS_FEEDS_CN.md, README.md, README.zh-CN.md, package.json, .env.example
- 排除：.git/, node_modules/, tmp/, .cursor/, .env, .DS_Store, *.log, coverage/, package-lock.json

## 四、让 `skill-publish` 全局可用

- 创建 `~/.agents/bin/` 目录
- 将脚本设为可执行
- 在用户的 shell 配置（`.zshrc`）中添加 `export PATH="$HOME/.agents/bin:$PATH"`（如尚未添加）

## 执行顺序

1. ~~创建 `~/.agents/bin/skill-publish` 脚本~~ — 已完成（Codex 执行，168 行）
2. ~~设置 PATH~~ — 已完成（`.zshrc` 第 32 行）
3. ~~首次 publish rss-digest 到 hub~~ — 已完成（v2.3.1，含 .env.example 修复）
4. ~~修复 rss-digest 的 3 处 symlink~~ — 已完成（claude/cursor/codex 均指向 hub）
5. ~~修复 landing-page-generator 的 codex symlink~~ — 已完成（改为指向 hub）
6. ~~验证：各工具目录都能正确读到 hub 中的 SKILL.md~~ — 已完成

## 执行后修复

- 修复 rsync 排除规则：`.env.*` 误排除了 `.env.example`，在 `--exclude '.env.*'` 前增加 `--include '.env.example'`，并重新发布
