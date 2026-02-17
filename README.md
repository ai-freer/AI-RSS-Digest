# RSS Digest

[中文版](README.zh-CN.md)

Agent-driven RSS daily digest skill for Cursor and Claude Code.

## What It Does

This project is a pure skill-mode pipeline — scripts handle fetching, prompt assembly, validation, formatting and delivery; the Agent itself generates the summary JSON.

**Basic flow (6 steps):**

```text
fetch → prepare-prompt → Agent summarize → validate → format → deliver (optional)
```

**Deep-read enhanced flow (9 steps, optional):**

```text
fetch → fetch-full → prepare-deep-read → Agent deep-read → prepare-prompt (tier2) → Agent tier2 → assemble → format → deliver (optional)
```

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
git clone <repo> ~/.claude/skills/rss-digest
```

Project-only install:

```bash
git clone <repo> .cursor/skills/rss-digest
```

After cloning, install dependencies:

```bash
cd <skill-directory>
npm install
```

## Quick Start

### Basic Mode

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
node scripts/output-formatter.js --input tmp/summary.json --channel email --outFile tmp/formatted-email.json

# 6) Optional delivery
node scripts/delivery.js --input tmp/formatted-email.json --channel email --dryRun
```

### Deep-Read Enhanced Mode

```bash
# 1) Fetch
node scripts/rss-fetcher.js --hours 24 --topN 7 --otherTopN 20 --outFile tmp/fetch.json

# 2) Fetch full content for top articles
node scripts/full-content-fetcher.js --fetchFile tmp/fetch.json --outFile tmp/fetch-enriched.json

# 3) Generate per-article deep-read prompts
node scripts/prepare-deep-read.js --fetchFile tmp/fetch-enriched.json --template daily --outFile tmp/deep-read-prompts.json

# 4) Agent reads tmp/deep-read-prompts.json, outputs tmp/deep-read-results.json

# 5) Build Tier2-only prompt
node scripts/prepare-prompt.js \
  --fetchFile tmp/fetch.json \
  --template templates/prompt-summarize-tiered.md \
  --deepReadResults tmp/deep-read-results.json \
  --outFile tmp/prompt-tier2.txt

# 6) Agent reads tmp/prompt-tier2.txt, outputs tmp/tier2-raw.json

# 7) Assemble final summary
node scripts/assemble-summary.js \
  --deepReadResults tmp/deep-read-results.json \
  --tier2Raw tmp/tier2-raw.json \
  --fetchFile tmp/fetch.json \
  --outFile tmp/summary.json

# 8-9) Format and deliver (same as basic mode steps 5-6)
```

## Delivery

`scripts/delivery.js` can send formatted payloads to:

- **Email** (Resend API or SMTP)
- **Feishu**
- **DingTalk**
- **WeCom**
- **WhatsApp**

Copy `.env.example` to `.env` and fill in your credentials. Always run with `--dryRun` first.

See `reference/GUIDE-delivery.md` for payload examples and `reference/GUIDE-delivery-setup.md` for step-by-step setup.

## Testing

```bash
npm test
```

Runs 4 test suites:

- `summary-pipeline.test.js` — core pipeline, formatters, quality gates
- `delivery.test.js` — delivery retry, dryRun, byte splitting
- `rss-fetcher.test.js` — feed parsing, scoring, ranking
- `feed-quality-monitor.test.js` — failure classification, feed discovery

## Project Structure

```text
rss-digest/
├── SKILL.md                              # Skill entry point (Agent reads this)
├── README.md
├── README.zh-CN.md                       # Chinese version
├── package.json
├── .env.example
├── RSS_FEEDS.md
├── RSS_FEEDS_CN.md
├── resources/
│   └── hn-popular-blogs-2025.opml
├── scripts/
│   ├── cli-utils.js                      # Shared CLI arg parsing & file I/O
│   ├── project-meta.js                   # Version & User-Agent from package.json
│   ├── rss-fetcher.js                    # Step 1: fetch & rank articles
│   ├── full-content-fetcher.js           # Deep-read: fetch full web content
│   ├── prepare-deep-read.js              # Deep-read: build per-article prompts
│   ├── prepare-prompt.js                 # Step 2: assemble summarization prompt
│   ├── summary-utils.js                  # Prompt building, JSON extraction, quality gates
│   ├── validate-summary.js               # Step 4: validate & normalize summary
│   ├── assemble-summary.js               # Deep-read: merge tier1 + tier2
│   ├── output-formatter.js               # Step 5: format for email/feishu/dingtalk/wecom/whatsapp
│   ├── delivery.js                       # Step 6: deliver to platforms
│   ├── feed-quality-monitor.js           # RSS source health checker
│   ├── summary-pipeline.test.js          # Tests: pipeline & formatters
│   ├── delivery.test.js                  # Tests: delivery module
│   ├── rss-fetcher.test.js               # Tests: feed parsing & ranking
│   └── feed-quality-monitor.test.js      # Tests: monitor helpers
├── templates/
│   ├── prompt-summarize-tiered.md        # Main tiered summary template
│   ├── prompt-deep-read.md               # Single-article deep-read template
│   ├── prompt-daily.md
│   ├── prompt-quick.md
│   ├── prompt-tech-dev.md
│   ├── prompt-product.md
│   ├── prompt-executive.md
│   └── README.md
└── reference/
    ├── GUIDE-technical.md
    ├── GUIDE-delivery.md
    ├── GUIDE-delivery-setup.md
    ├── GUIDE-templates.md
    ├── GUIDE-sources.md
    └── TEMPLATE-delivery-onboarding.md
```

## License

No license file is bundled in this repository yet.
