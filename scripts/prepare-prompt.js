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
const { buildPromptArticles, buildPrompt, extractJson } = require('./summary-utils');
const {
  parseCliArgs,
  ensureValue,
  readJsonFile,
  writeTextOutput
} = require('./cli-utils');

function hasTier1Candidates(fetchData) {
  return Array.isArray(fetchData?.topArticles) && fetchData.topArticles.length > 0;
}

function shouldRequireDeepRead(args, fetchData) {
  // Tier1 deep-read is mandatory for all templates/modes.
  if (!hasTier1Candidates(fetchData)) return false;
  return !args.deepReadResults;
}

function ensureDeepReadRequirement(args, fetchData) {
  if (!shouldRequireDeepRead(args, fetchData)) return;
  throw new Error(
    'Tier1 deep-read is required: please provide --deepReadResults before preparing tier2 prompt.'
  );
}

function parseJsonLoose(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = extractJson(raw);
  if (!parsed) {
    throw new Error(`Input does not contain valid JSON object: ${filePath}`);
  }
  return parsed;
}

function run() {
  const args = parseCliArgs(process.argv);
  const fetchFile = path.resolve(args.fetchFile || '');
  const templateFile = path.resolve(
    args.template || path.join(__dirname, '..', 'templates', 'prompt-summarize-tiered.md')
  );
  const outFile = args.outFile ? path.resolve(args.outFile) : null;

  ensureValue(args.fetchFile, 'fetchFile');

  const fetchData = readJsonFile(fetchFile);
  ensureDeepReadRequirement(args, fetchData);
  let promptFetchData = fetchData;
  if (args.deepReadResults) {
    const deepReadPath = path.resolve(args.deepReadResults);
    const deepReadData = parseJsonLoose(deepReadPath);
    const deepReadCount = Array.isArray(deepReadData?.results)
      ? deepReadData.results.length
      : Array.isArray(deepReadData?.tier1)
        ? deepReadData.tier1.length
        : Array.isArray(deepReadData)
          ? deepReadData.length
          : 0;
    promptFetchData = {
      ...fetchData,
      topArticles: [],
      metadata: {
        ...(fetchData.metadata && typeof fetchData.metadata === 'object' ? fetchData.metadata : {}),
        deepRead: {
          enabled: true,
          deepReadCount
        }
      }
    };
  }
  const templateText = fs.readFileSync(templateFile, 'utf8');
  const articles = buildPromptArticles(promptFetchData);
  const prompt = buildPrompt(templateText, articles, promptFetchData);
  writeTextOutput(prompt, outFile);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    hasTier1Candidates,
    shouldRequireDeepRead,
    ensureDeepReadRequirement
  };
}

if (require.main === module) {
  try {
    run();
  } catch (error) {
    process.stderr.write(`${String(error.message || error)}\n`);
    process.exit(1);
  }
}
