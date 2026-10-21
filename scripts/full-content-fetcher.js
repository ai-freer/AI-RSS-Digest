#!/usr/bin/env node

/**
 * Fetch full webpage content for top articles.
 *
 * Usage:
 * node scripts/full-content-fetcher.js \
 *   --fetchFile tmp/fetch.json \
 *   --outFile tmp/fetch-enriched.json
 */

const path = require('path');
const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');
const { USER_AGENT } = require('./project-meta');
const {
  parseCliArgs,
  ensureValue,
  readJsonFile,
  writeJsonOutput
} = require('./cli-utils');

const CONFIG = {
  CONCURRENCY: 5,
  TIMEOUT_MS: 15000,
  USER_AGENT
};

function safeText(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

async function fetchHtml(url, timeoutMs = CONFIG.TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': CONFIG.USER_AGENT
      }
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timeoutId);
  }
}

function extractReadableText(html, url) {
  const dom = new JSDOM(html, { url });
  try {
    const reader = new Readability(dom.window.document);
    const parsed = reader.parse();
    const text = safeText(parsed?.textContent, '');
    if (!text) {
      throw new Error('Readability returned empty content');
    }
    return text;
  } finally {
    dom.window.close();
  }
}

function withFallbackContent(article, fetchedFrom = 'rss-fallback') {
  const fallbackContent = safeText(article.content || article.rawContent, '');
  return {
    ...article,
    fullContent: fallbackContent,
    fullContentMeta: {
      fetchedFrom,
      charCount: fallbackContent.length
    }
  };
}

function isAihotArticle(article) {
  if (article.source === 'AIHOT') return true;
  try {
    const hostname = new URL(safeText(article.link)).hostname;
    return hostname === 'aihot.news' || hostname === 'aihot.virxact.com';
  } catch {
    return false;
  }
}

async function enrichArticle(article) {
  if (isAihotArticle(article)) {
    return withFallbackContent(article, 'rss');
  }
  if (article.contentMeta?.fetchedFrom === 'web' && article.contentMeta.url === article.link && safeText(article.content)) {
    return { ...article, fullContent: article.content, fullContentMeta: article.contentMeta };
  }

  const link = safeText(article.link, '');
  if (!link) {
    return withFallbackContent(article);
  }

  try {
    const html = await fetchHtml(link, CONFIG.TIMEOUT_MS);
    const fullContent = extractReadableText(html, link);
    return {
      ...article,
      fullContent,
      fullContentMeta: {
        fetchedFrom: 'web',
        charCount: fullContent.length
      }
    };
  } catch (error) {
    return {
      ...withFallbackContent(article),
      fullContentMeta: {
        fetchedFrom: 'rss-fallback',
        charCount: safeText(article.content || article.rawContent, '').length,
        error: safeText(error.message, 'Unknown error')
      }
    };
  }
}

async function mapWithConcurrency(items, mapper, concurrency = CONFIG.CONCURRENCY) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const output = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const current = cursor;
      cursor += 1;
      output[current] = await mapper(items[current], current);
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  const workers = Array.from({ length: workerCount }, () => worker());
  await Promise.all(workers);
  return output;
}

async function main({ params }) {
  const fetchData = params?.fetchData || {};
  const topArticles = Array.isArray(fetchData.topArticles) ? fetchData.topArticles : [];
  const otherTopArticles = Array.isArray(fetchData.otherTopArticles) ? fetchData.otherTopArticles : [];

  const enrichedTopArticles = await mapWithConcurrency(topArticles, enrichArticle, CONFIG.CONCURRENCY);

  const enriched = {
    ...fetchData,
    topArticles: enrichedTopArticles,
    otherTopArticles,
    metadata: {
      ...(fetchData.metadata && typeof fetchData.metadata === 'object' ? fetchData.metadata : {}),
      fullContent: {
        enabled: true,
        concurrency: CONFIG.CONCURRENCY,
        timeoutMs: CONFIG.TIMEOUT_MS,
        fetchedFromWeb: enrichedTopArticles.filter(a => a.fullContentMeta?.fetchedFrom === 'web').length,
        fromRss: enrichedTopArticles.filter(a => a.fullContentMeta?.fetchedFrom === 'rss').length,
        fallbackToRss: enrichedTopArticles.filter(a => a.fullContentMeta?.fetchedFrom === 'rss-fallback').length
      }
    }
  };

  return { result: enriched };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    main,
    CONFIG,
    enrichArticle,
    isAihotArticle,
    extractReadableText,
    mapWithConcurrency
  };
}

if (require.main === module) {
  (async () => {
    const args = parseCliArgs(process.argv);
    ensureValue(args.fetchFile, 'fetchFile');
    const fetchFile = path.resolve(args.fetchFile);
    const outFile = args.outFile ? path.resolve(args.outFile) : null;
    const fetchData = readJsonFile(fetchFile);
    const { result } = await main({ params: { fetchData } });
    writeJsonOutput(result, outFile);
    if (outFile) {
      process.stdout.write(`${outFile}\n`);
    }
  })().catch((error) => {
    process.stderr.write(`${String(error.message || error)}\n`);
    process.exit(1);
  });
}
