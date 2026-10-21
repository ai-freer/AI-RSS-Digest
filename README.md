# AI-RSS-Digest

[中文说明](README.zh-CN.md) · [Complete Agent workflow](SKILL.md)

An Agent-driven RSS reading workflow: review reading value, group events, suppress cross-edition repetition, and produce deep reads and short summaries.

```text
RSS candidates → bounded body recovery → local preflight → Agent editorial review → validated selection
→ Tier1 full text + deep read → Tier2 summary → validate + format → edition ledger
```

## Features

- Type-specific scoring of significance, novelty, evidence, reader relevance and utility. Local code computes scores and enforces caps.
- Same-occurrence representatives, seven-day publication history and evidence-required follow-ups.
- Pending decisions for insufficient evidence or unverified publication dates; incomplete reviews fail closed.
- Versioned candidate/policy/prompt/history snapshots; complete decision receipts for replay and evaluation.
- Review every seven completed editions, human labels and offline calibration. No scheduler or external LLM API is installed.
- Chinese A-tier feeds enabled, including AIHOT official RSS. AIHOT pages are not scraped.

## Install and migration

Requires Node.js >=18. Install this repository into your Agent's skills directory under `ai-rss-digest`, then run:

```bash
npm ci --omit=dev --no-audit --no-fund
```

Display name: **AI-RSS-Digest**. Package/skill ID: `ai-rss-digest`. Version 4 replaces `ak-92rss-digest`. Verify the new installation before retiring the old discovery entry. Repository: [ai-freer/AI-RSS-Digest](https://github.com/ai-freer/AI-RSS-Digest). The development directory is named `AI-RSS-Digest`; store runtime data outside installed skills.

## Run

Follow [SKILL.md](SKILL.md), the single authoritative workflow. Set RUN to a unique absolute output directory:

```bash
node scripts/rss-fetcher.js --hours 24 --outFile "$RUN/fetch-raw.json"
node scripts/editorial-cli.js supplement --fetchFile "$RUN/fetch-raw.json" --bodyBudget 20 --outFile "$RUN/fetch-ready.json"
node scripts/editorial-cli.js prepare --fetchFile "$RUN/fetch-ready.json" --outFile "$RUN/editorial-packet.json" --promptFile "$RUN/editorial-prompt.md"
# Agent reviews ALL reviewable candidate IDs and writes editorial-review.json.
node scripts/editorial-cli.js select --packetFile "$RUN/editorial-packet.json" --reviewFile "$RUN/editorial-review.json" --outFile "$RUN/fetch-selected.json"
```

Subsequent steps use fetch-selected.json. Raw rankings are discovery aids, not editorial approval. Zero selected articles is valid; do not fill with rejected items.

Default history: `~/.local/share/ai-rss-digest/ledger.json`. Separate audiences/projects should pass the same explicit `--ledgerFile` to prepare, record and retrospective. Record only a validated, formatted local edition; this is not delivery confirmation.

## Verification

```bash
node --test scripts/editorial.test.js
npm test
```

These are offline behavior checks, not proof of improved editorial accuracy. The initial threshold of 65 needs real human labels. See [design and attribution](reference/EDITORIAL-DESIGN.md), [technical contracts](reference/GUIDE-technical.md) and [templates](reference/GUIDE-templates.md).

Version 4.1 uses XML DOM parsing, reports body coverage, and keeps local pending/deferred records outside model prompts. Every original candidate remains accountable. Low body coverage or pending-input is a collection/material issue, not evidence that no worthwhile articles exist.

4.1.1: AIHOT quotas follow original publishers from explicit RSS links, with a configurable unknown-publisher bucket. Scoring and event deduplication still apply.
