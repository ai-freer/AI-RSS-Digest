#!/usr/bin/env node

/**
 * Prepare per-article deep-read prompts for top articles.
 *
 * Usage:
 * node scripts/prepare-deep-read.js \
 *   --fetchFile tmp/fetch-enriched.json \
 *   --template daily \
 *   --outFile tmp/deep-read-prompts.json
 */

const fs = require('fs');
const path = require('path');
const {
  buildDeepReadPrompt,
  normalizeTemplateName
} = require('./summary-utils');
const {
  parseCliArgs,
  ensureValue,
  readJsonFile,
  writeJsonOutput
} = require('./cli-utils');

function main({ params }) {
  const fetchData = params?.fetchData || {};
  const templateText = params?.templateText || '';
  const templateName = normalizeTemplateName(params?.templateName || 'daily');
  const topArticles = Array.isArray(fetchData?.topArticles) ? fetchData.topArticles : [];

  const prompts = topArticles.map((article, index) => ({
    rank: index + 1,
    title: article.title || 'Untitled',
    link: article.link || '',
    source: article.source || 'unknown',
    templateName,
    prompt: buildDeepReadPrompt(templateText, article, templateName)
  }));

  return {
    result: {
      date: fetchData.date || new Date().toISOString().slice(0, 10),
      templateName,
      count: prompts.length,
      prompts
    }
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { main };
}

if (require.main === module) {
  try {
    const args = parseCliArgs(process.argv);
    ensureValue(args.fetchFile, 'fetchFile');
    const fetchFile = path.resolve(args.fetchFile);
    const templateName = args.template || 'daily';
    const templatePath = path.resolve(
      args.templateFile || path.join(__dirname, '..', 'templates', 'prompt-deep-read.md')
    );
    const outFile = args.outFile ? path.resolve(args.outFile) : null;

    const fetchData = readJsonFile(fetchFile);
    const templateText = fs.readFileSync(templatePath, 'utf8');
    const { result } = main({ params: { fetchData, templateText, templateName } });
    writeJsonOutput(result, outFile);
    if (outFile) {
      process.stdout.write(`${outFile}\n`);
    }
  } catch (error) {
    process.stderr.write(`${String(error.message || error)}\n`);
    process.exit(1);
  }
}
