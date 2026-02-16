#!/usr/bin/env node

/**
 * Prepare prompt text for agent summarization.
 *
 * Usage:
 * node scripts/prepare-prompt.js \
 *   --fetchFile tmp/fetch.json \
 *   --template templates/prompt-summarize-tiered.md \
 *   --outFile tmp/prompt.txt
 */

const fs = require('fs');
const path = require('path');
const { buildPromptArticles, buildPrompt } = require('./summary-utils');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
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

function ensureValue(value, name) {
  if (value === undefined || value === null || value === '') {
    throw new Error(`Missing required value: ${name}`);
  }
}

function readJsonFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function writeOutput(text, outFile) {
  if (!outFile) {
    process.stdout.write(text);
    if (!text.endsWith('\n')) {
      process.stdout.write('\n');
    }
    return;
  }
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, text);
}

function run() {
  const args = parseArgs(process.argv);
  const fetchFile = path.resolve(args.fetchFile || '');
  const templateFile = path.resolve(
    args.template || path.join(__dirname, '..', 'templates', 'prompt-summarize-tiered.md')
  );
  const outFile = args.outFile ? path.resolve(args.outFile) : null;

  ensureValue(args.fetchFile, 'fetchFile');

  const fetchData = readJsonFile(fetchFile);
  const templateText = fs.readFileSync(templateFile, 'utf8');
  const articles = buildPromptArticles(fetchData);
  const prompt = buildPrompt(templateText, articles, fetchData);
  writeOutput(prompt, outFile);
}

try {
  run();
} catch (error) {
  process.stderr.write(`${String(error.message || error)}\n`);
  process.exit(1);
}
