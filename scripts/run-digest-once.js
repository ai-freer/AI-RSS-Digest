#!/usr/bin/env node
/**
 * Run RSS digest pipeline once:
 * 1) fetch
 * 2) summarize
 * 3) format
 *
 * 用于被上层 Agent 直接调用，输出标准中间文件。
 */

const fs = require('fs');
const path = require('path');
const { main: fetchMain } = require('./rss-fetcher');
const { main: summarizeMain } = require('./ai-summarizer');
const { main: formatMain } = require('./output-formatter');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const part = argv[i];
    if (!part.startsWith('--')) continue;
    const key = part.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function toNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function run() {
  const argv = parseArgs(process.argv);
  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, '-');

  const outDir = path.resolve(argv.outDir || path.join(__dirname, '..', 'tmp'));
  const curationTemplatePath = path.resolve(
    argv.curationTemplate || path.join(__dirname, '..', 'templates', 'prompt-daily.md')
  );
  const summaryTemplatePath = path.resolve(
    argv.summaryTemplate || argv.template || path.join(__dirname, '..', 'templates', 'prompt-summarize-tiered.md')
  );
  const channel = argv.channel || 'email';
  const allowHeuristicFallback = Boolean(argv.allowHeuristicFallback);

  ensureDir(outDir);

  const fetchResult = await fetchMain({
    params: {
      hours: toNumber(argv.hours, 24),
      topN: toNumber(argv.topN, 7),
      otherTopN: toNumber(argv.otherTopN, 20),
      includeCN: Boolean(argv.includeCN),
      cnTier: argv.cnTier || 'A',
      languageFilter: argv.languageFilter || 'all'
    }
  });

  const fetched = fetchResult.result;
  const fetchFile = path.join(outDir, `digest-${stamp}-fetch.json`);
  fs.writeFileSync(fetchFile, JSON.stringify(fetched, null, 2));

  const summaryResult = await summarizeMain({
    params: {
      fetchData: fetched,
      templatePath: summaryTemplatePath,
      model: argv.model || process.env.LLM_MODEL || 'gpt-4.1-mini',
      allowHeuristicFallback
    }
  });

  const summaryData = summaryResult.result;
  const summaryFile = path.join(outDir, `digest-${stamp}-summary.json`);
  fs.writeFileSync(summaryFile, JSON.stringify(summaryData, null, 2));

  const formattedResult = await formatMain({
    params: {
      summaryData,
      channel
    }
  });

  const formatted = formattedResult.result;
  const formattedFile = path.join(outDir, `digest-${stamp}-formatted-${channel}.json`);
  fs.writeFileSync(formattedFile, JSON.stringify(formatted, null, 2));

  console.log(JSON.stringify({
    ok: true,
    channel,
    templates: {
      curation: curationTemplatePath,
      summary: summaryTemplatePath
    },
    files: {
      fetch: fetchFile,
      summary: summaryFile,
      formatted: formattedFile
    },
    stats: fetched.stats || null
  }, null, 2));
}

run().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: String(error.message || error)
  }, null, 2));
  process.exit(1);
});
