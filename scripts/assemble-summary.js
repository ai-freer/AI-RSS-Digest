#!/usr/bin/env node

/**
 * Assemble deep-read tier1 results with tier2 batch summary.
 *
 * Usage:
 * node scripts/assemble-summary.js \
 *   --deepReadResults tmp/deep-read-results.json \
 *   --tier2Raw tmp/tier2-raw.json \
 *   --fetchFile tmp/fetch.json \
 *   --outFile tmp/summary.json
 */

const fs = require('fs');
const path = require('path');
const {
  extractJson,
  ensureSummaryShape,
  normalizeDeepReadResult
} = require('./summary-utils');
const {
  parseCliArgs,
  ensureValue,
  readJsonFile,
  writeJsonOutput
} = require('./cli-utils');

function parseJsonLoose(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = extractJson(raw);
  if (!parsed) {
    throw new Error(`Input does not contain valid JSON object: ${filePath}`);
  }
  return parsed;
}

function pickDeepReadItems(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.tier1)) return data.tier1;
  return [];
}

function main({ params }) {
  const deepReadData = params?.deepReadData || {};
  const tier2Data = params?.tier2Data || {};
  const fetchData = params?.fetchData || {};

  const rawDeepItems = pickDeepReadItems(deepReadData);
  const tier1 = rawDeepItems.map((item, index) => normalizeDeepReadResult(item, index + 1));

  const merged = {
    date: tier2Data.date || fetchData.date || new Date().toISOString().slice(0, 10),
    tier1,
    tier2: Array.isArray(tier2Data.tier2) ? tier2Data.tier2 : [],
    byCategory: (tier2Data.byCategory && typeof tier2Data.byCategory === 'object')
      ? tier2Data.byCategory
      : undefined,
    dailyAdvice: tier2Data.dailyAdvice,
    metadata: {
      ...(tier2Data.metadata && typeof tier2Data.metadata === 'object' ? tier2Data.metadata : {}),
      pipeline: {
        mode: 'deep-read-tiered',
        deepReadCount: tier1.length
      }
    }
  };

  return { result: ensureSummaryShape(merged, fetchData) };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { main, pickDeepReadItems };
}

if (require.main === module) {
  try {
    const args = parseCliArgs(process.argv);
    ensureValue(args.deepReadResults, 'deepReadResults');
    ensureValue(args.tier2Raw, 'tier2Raw');
    ensureValue(args.fetchFile, 'fetchFile');
    const deepReadData = parseJsonLoose(path.resolve(args.deepReadResults));
    const tier2Data = parseJsonLoose(path.resolve(args.tier2Raw));
    const fetchData = readJsonFile(path.resolve(args.fetchFile));
    const outFile = args.outFile ? path.resolve(args.outFile) : null;
    const { result } = main({ params: { deepReadData, tier2Data, fetchData } });
    writeJsonOutput(result, outFile);
    if (outFile) {
      process.stdout.write(`${outFile}\n`);
    }
  } catch (error) {
    process.stderr.write(`${String(error.message || error)}\n`);
    process.exit(1);
  }
}
