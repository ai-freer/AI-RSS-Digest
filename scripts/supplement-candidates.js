const { enrichArticle, isAihotArticle, mapWithConcurrency } = require('./full-content-fetcher');
const { localReason, coverageDiagnostics } = require('./candidate-readiness');

async function supplement(fetchData, budget = 20, enrich = enrichArticle, now = new Date().toISOString()) {
  if (!Array.isArray(fetchData.candidates)) throw new Error('Full candidates array required');
  if (!Number.isInteger(budget) || budget < 0 || budget > 100) throw new Error('bodyBudget must be an integer between 0 and 100');
  const candidates = fetchData.candidates.map(a => ({ ...a }));
  const buckets = new Map();
  for (const article of candidates) {
    if (localReason(article, now) !== 'missing-body') continue;
    if (isAihotArticle(article)) {
      article.supplementation = { status: 'rss-only' };
      continue;
    }
    const source = article.source || 'unknown';
    if (!buckets.has(source)) buckets.set(source, []);
    buckets.get(source).push(article);
    article.supplementation = { status: 'budget-deferred' };
  }
  const chosen = [];
  while (chosen.length < budget) {
    let progress = false;
    for (const queue of buckets.values()) {
      if (chosen.length >= budget) break;
      if (queue.length) { chosen.push(queue.shift()); progress = true; }
    }
    if (!progress) break;
  }
  await mapWithConcurrency(chosen, async article => {
    try {
      const result = await enrich(article);
      if (result.fullContentMeta?.fetchedFrom === 'web' && /[\p{L}\p{N}]/u.test(result.fullContent || '')) {
        article.content = result.fullContent;
        article.contentMeta = { ...result.fullContentMeta, url: article.link };
        article.supplementation = { status: 'recovered' };
      } else {
        article.supplementation = { status: 'failed', error: result.fullContentMeta?.error || 'No usable webpage body' };
      }
    } catch (error) {
      article.supplementation = { status: 'failed', error: error.message };
    }
  }, 3);
  return {
    ...fetchData, candidates,
    diagnostics: fetchData.diagnostics || coverageDiagnostics(fetchData.candidates),
    supplementation: {
      budget, attempted: chosen.length,
      recovered: chosen.filter(a => a.supplementation.status === 'recovered').length,
      failed: chosen.filter(a => a.supplementation.status === 'failed').length,
      deferred: candidates.filter(a => a.supplementation?.status === 'budget-deferred').length,
      after: coverageDiagnostics(candidates)
    }
  };
}

module.exports = { supplement };
