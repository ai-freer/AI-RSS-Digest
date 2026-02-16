# RSS Digest

Agent-driven RSS daily digest skill for Cursor and Claude Code.

## What It Does

This project is a pure skill-mode pipeline:

1. fetch RSS articles
2. assemble summarization prompt
3. let the Agent generate JSON summary
4. validate and normalize summary shape
5. format output by channel
6. optionally deliver to Feishu/DingTalk/WeCom/WhatsApp

No script in this repo calls external LLM APIs directly.

## Requirements

- Node.js `>=18`
- Network access for RSS fetching and optional delivery webhooks

## Install As Skill

Cursor (global):

```bash
git clone <repo> ~/.cursor/skills/rss-digest
```

Claude Code (global):

```bash
git clone <repo> ~/.codex/skills/rss-digest
```

Project-only install:

```bash
git clone <repo> .cursor/skills/rss-digest
```

## Quick Start

```bash
# 1) Fetch ranked articles
node scripts/rss-fetcher.js --hours 24 --topN 7 --otherTopN 20 --outFile tmp/fetch.json

# 2) Build prompt for Agent
node scripts/prepare-prompt.js \
  --fetchFile tmp/fetch.json \
  --template templates/prompt-summarize-tiered.md \
  --outFile tmp/prompt.txt

# 3) Agent reads tmp/prompt.txt and writes JSON to tmp/summary-raw.json

# 4) Validate and normalize
node scripts/validate-summary.js \
  --input tmp/summary-raw.json \
  --fetchFile tmp/fetch.json \
  --outFile tmp/summary.json

# 5) Format output
node scripts/output-formatter.js --input tmp/summary.json --channel email --outFile tmp/formatted.json
```

## Optional Delivery

`scripts/delivery.js` can send formatted payloads to:

- Feishu
- DingTalk
- WeCom
- WhatsApp

Check `reference/GUIDE-delivery.md` for payload examples.

## Project Structure

```text
rss-digest/
├── SKILL.md
├── README.md
├── package.json
├── .env.example
├── RSS_FEEDS.md
├── RSS_FEEDS_CN.md
├── resources/
├── scripts/
│   ├── rss-fetcher.js
│   ├── summary-utils.js
│   ├── prepare-prompt.js
│   ├── validate-summary.js
│   ├── output-formatter.js
│   ├── delivery.js
│   ├── feed-quality-monitor.js
│   ├── summary-pipeline.test.js
│   └── delivery.test.js
├── templates/
└── reference/
```

## License

No license file is bundled in this repository yet.
