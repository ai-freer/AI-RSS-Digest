const { linkIssue } = require('./content-contract');
const { localReason, coverageDiagnostics, isDiscoveredLongform } = require('./candidate-readiness');
const { hash, articleId, canonicalUrl } = require('./article-identity');

const { quotaIdentity } = require('./source-quota');

const AXES = ['significance', 'novelty', 'evidence', 'relevance', 'utility'];
const EMPTY_LEDGER = { schemaVersion: 1, editions: [] };
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const nonempty = value => typeof value === 'string' && value.trim().length > 0;

function validatePolicy(policy) {
  assert(nonempty(policy.version) && nonempty(policy.audience), 'Policy needs version and audience');
  for (const key of ['threshold', 'historyDays', 'reviewEveryEditions', 'topN', 'otherTopN', 'maxPerSource']) {
    assert(Number.isInteger(policy[key]) && policy[key] >= (key === 'otherTopN' ? 0 : 1), `Invalid policy ${key}`);
  }
  for (const config of Object.values(policy.aggregatorSources || {})) {
    assert(Number.isInteger(config.unknownPublisherLimit) && config.unknownPublisherLimit > 0, 'Invalid unknown publisher quota');
  }
  assert(policy.threshold <= 100, 'Invalid threshold');
  assert(policy.weights && Object.keys(policy.weights).length > 0, 'Missing weights');
  for (const weights of Object.values(policy.weights)) {
    assert(AXES.every(axis => Number.isFinite(weights[axis]) && weights[axis] >= 0), 'Invalid weights');
    assert(AXES.reduce((sum, axis) => sum + weights[axis], 0) > 0, 'Empty weights');
  }
  assert(policy.caps && policy.caps.none === 100, 'Missing score caps');
  assert(Object.values(policy.caps).every(n => Number.isFinite(n) && n >= 0 && n <= 100), 'Invalid score caps');
}

function validateLedger(ledger) {
  assert(ledger?.schemaVersion === 1 && Array.isArray(ledger.editions), 'Invalid ledger; do not reset unreadable history');
  for (const edition of ledger.editions) {
    assert(nonempty(edition.id) && Number.isFinite(Date.parse(edition.recordedAt)) && Array.isArray(edition.events), 'Invalid edition');
    for (const event of edition.events) assert(nonempty(event.eventId) && nonempty(event.storyId) && nonempty(event.link), 'Invalid recorded event');
  }
}

function sealPacket(packet) {
  const { packetId, ...payload } = packet;
  return hash(payload);
}

function prepare(fetchData, policy, template, ledger = EMPTY_LEDGER, now = new Date().toISOString(), ledgerDiagnostics = null) {
  validatePolicy(policy);
  validateLedger(ledger);
  assert(Array.isArray(fetchData.candidates), 'Fetch again with v4: full candidates array is required');
  assert(Number.isFinite(Date.parse(now)), 'Invalid clock');
  for (const row of fetchData.candidates) {
    if (linkIssue(row.link) === 'placeholder-article-url') throw new Error(`placeholder-article-url: ${row.link}; correct input before deduplication`);
  }
  const cutoff = Date.parse(now) - policy.historyDays * 86400000;
  const history = ledger.editions.filter(e => Date.parse(e.recordedAt) >= cutoff).flatMap(e => e.events);
  const candidates = fetchData.candidates.map(article => ({
    origin: article.origin || null, id: articleId(article), title: article.title || '', link: article.link || '', source: article.source || 'unknown',
    readingClass: article.readingClass || null, acquisitionKind: article.acquisitionKind || null,
    discoveredAt: article.discoveredAt || null, acquiredAt: article.acquiredAt || null, publicationDateText: article.publicationDateText || null,
    pubDate: article.pubDate || null, hasValidPubDate: article.hasValidPubDate === true,
    // Keep all supplied content. The Agent may batch IDs, but may not silently omit them.
    content: article.content || '', language: article.language || 'unknown',
    contentMeta: article.contentMeta || null, supplementation: article.supplementation || null
  }));
  assert(new Set(candidates.map(a => a.id)).size === candidates.length, 'Duplicate candidate IDs');
  const localDecisions = candidates.filter(a => localReason(a, now)).map(a => ({
    ...a, status: a.supplementation?.status === 'budget-deferred' ? 'deferred' : 'pending',
    reason: localReason(a, now), decisionOrigin: 'local', editorialScore: null
  }));
  const reviewable = candidates.filter(a => !localReason(a, now));
  const packet = {
    schemaVersion: 2, createdAt: now, date: fetchData.date || now.slice(0, 10),
    policy, promptHash: hash(template), ledgerHash: hash(ledger), history, candidates: reviewable, localDecisions,
    candidateCount: candidates.length, diagnostics: coverageDiagnostics(candidates),
    acquisitionDiagnostics: fetchData.diagnostics || null, ledgerDiagnostics
  };
  return { ...packet, packetId: sealPacket(packet) };
}

function scoreReview(review, policy) {
  assert(Object.hasOwn(policy.weights, review.type), `Unknown type: ${review.type}`);
  const weights = policy.weights[review.type];
  assert(Object.hasOwn(policy.caps, review.cap), `Unknown cap: ${review.cap}`);
  assert(AXES.every(axis => Number.isInteger(review.scores?.[axis]) && review.scores[axis] >= 0 && review.scores[axis] <= 5), 'Scores must be integers 0..5');
  const weighted = AXES.reduce((sum, axis) => sum + review.scores[axis] * weights[axis], 0);
  const total = AXES.reduce((sum, axis) => sum + weights[axis], 0);
  return Math.min(policy.caps[review.cap], Math.round(20 * weighted / total));
}

function select(packet, response) {
  assert(packet.packetId === sealPacket(packet), 'Packet changed after preparation');
  validatePolicy(packet.policy);
  assert(response.packetId === packet.packetId, 'Review belongs to a different packet');
  assert(nonempty(response.reviewer) && nonempty(response.reviewedAt) && Number.isFinite(Date.parse(response.reviewedAt)), 'Reviewer and reviewedAt required');
  assert(Array.isArray(response.reviews) && response.reviews.length === packet.candidates.length, 'Review must cover every candidate exactly once');
  const reviewMap = new Map(response.reviews.map(r => [r.id, r]));
  assert(reviewMap.size === packet.candidates.length, 'Duplicate review IDs');
  const history = new Map(packet.history.map(event => [event.eventId, event]));
  const historyLinks = new Set(packet.history.map(event => canonicalUrl(event.link)));
  const eventStories = new Map(packet.history.map(event => [event.eventId, event.storyId]));
  if (packet.schemaVersion === 2) {
    assert(Array.isArray(packet.localDecisions), 'Missing local decisions');
    const allIds = [...packet.candidates, ...packet.localDecisions].map(a => a.id);
    assert(allIds.length === packet.candidateCount && new Set(allIds).size === allIds.length, 'Candidate accounting mismatch');
  }
  const decisions = packet.candidates.map(article => {
    const review = reviewMap.get(article.id);
    assert(review, `Missing review: ${article.id}`);
    assert(['pass', 'block', 'unknown'].includes(review.relevance), 'Invalid relevance');
    assert(['sufficient', 'insufficient'].includes(review.material), 'Invalid material');
    assert(nonempty(review.reason), 'A concise review reason is required');
    if (isDiscoveredLongform(article, packet.createdAt)) assert(['analysis', 'tutorial'].includes(review.type), 'Newly discovered longform must be analysis or tutorial, never daily news');
    const score = scoreReview(review, packet.policy);
    let status = 'eligible';
    let reason = 'score-pass';
    if (review.relevance === 'block') { status = 'rejected'; reason = 'irrelevant'; }
    else if (review.relevance === 'unknown' || review.material === 'insufficient') { status = 'pending'; reason = 'insufficient-evidence'; }
    else if (!isDiscoveredLongform(article, packet.createdAt) && (!article.hasValidPubDate || !Number.isFinite(Date.parse(article.pubDate)) || Date.parse(article.pubDate) > Date.parse(packet.createdAt))) {
      status = 'pending'; reason = 'unverified-publication-time';
    } else if (!canonicalUrl(article.link)) { status = 'pending'; reason = 'missing-article-url'; }
    else if (score < packet.policy.threshold) { status = 'rejected'; reason = 'below-threshold'; }

    if (status === 'eligible') {
      assert(Array.isArray(review.evidence) && review.evidence.length > 0 && review.evidence.every(q => nonempty(q) && article.content.includes(q)), `Evidence must quote supplied body: ${article.id}`);
      assert(nonempty(review.eventId) && nonempty(review.storyId) && nonempty(review.eventSummary), 'Missing event identity');
      assert(['new', 'repeat', 'update', 'roundup'].includes(review.novelty), 'Invalid novelty');
      assert(['primary', 'secondary', 'unknown'].includes(review.provenance), 'Invalid provenance');
      if (review.provenance === 'primary') assert(nonempty(review.provenanceEvidence) && article.content.includes(review.provenanceEvidence), 'Primary provenance needs body evidence');
      assert(!eventStories.has(review.eventId) || eventStories.get(review.eventId) === review.storyId, 'Conflicting story for same occurrence');
      eventStories.set(review.eventId, review.storyId);
      if (history.has(review.eventId) || historyLinks.has(canonicalUrl(article.link)) || review.novelty === 'repeat') {
        status = 'suppressed'; reason = 'already-published';
      } else if (review.novelty === 'roundup') { status = 'suppressed'; reason = 'roundup-not-an-occurrence'; }
      else if (review.novelty === 'update') {
        const previous = history.get(review.previousEventId);
        assert(previous && previous.storyId === review.storyId, 'Update must reference a recorded event in the same story');
        assert(nonempty(review.newInformation) && nonempty(review.noveltyEvidence) && article.content.includes(review.noveltyEvidence), 'Update requires concrete new information with body evidence');
        if (previous.newInformation === review.newInformation || previous.noveltyEvidence === review.noveltyEvidence) {
          status = 'suppressed'; reason = 'no-new-information';
        }
      } else {
        assert(!packet.history.some(e => e.storyId === review.storyId), 'Known story requires update/repeat judgment');
      }
    }
    return { ...article, review, editorialScore: score, status, reason, decisionOrigin: 'agent' };
  });

  decisions.push(...(packet.localDecisions || []));

  // One representative per occurrence, then rank events by reading value.
  const groups = new Map();
  for (const row of decisions.filter(d => d.status === 'eligible')) {
    if (!groups.has(row.review.eventId)) groups.set(row.review.eventId, []);
    groups.get(row.review.eventId).push(row);
  }
  const representatives = [];
  for (const group of groups.values()) {
    group.sort((a, b) => Number(b.review.provenance === 'primary') - Number(a.review.provenance === 'primary') || b.editorialScore - a.editorialScore || a.id.localeCompare(b.id));
    representatives.push(group[0]);
    for (const row of group.slice(1)) { row.status = 'suppressed'; row.reason = 'same-occurrence'; }
  }
  representatives.sort((a, b) => b.editorialScore - a.editorialScore || a.id.localeCompare(b.id));
  const selected = [];
  const sourceCounts = new Map();
  for (const row of representatives) {
    const quota = packet.policy.aggregatorSources ? quotaIdentity(row, packet.policy) : { key: row.source, limit: packet.policy.maxPerSource, basis: 'legacy-source' };
    row.sourceQuota = quota;
    const count = sourceCounts.get(quota.key) || 0;
    if (count >= quota.limit || selected.length >= packet.policy.topN + packet.policy.otherTopN) {
      row.status = 'deferred'; row.reason = count >= quota.limit ? 'source-quota' : 'edition-capacity';
    } else {
      row.status = 'selected'; row.reason = 'selected';
      sourceCounts.set(quota.key, count + 1);
      selected.push(row);
    }
  }
  const articles = selected.map(row => ({ ...row, score: row.editorialScore }));
  const selection = {
    outcome: articles.length ? 'selected' : decisions.some(d => ['pending', 'deferred'].includes(d.status)) ? 'pending-input' : 'no-selection',
    date: packet.date, editorialStatus: 'reviewed', topN: packet.policy.topN, otherTopN: packet.policy.otherTopN,
    topArticles: articles.slice(0, packet.policy.topN), otherTopArticles: articles.slice(packet.policy.topN),
    articles: articles.slice(0, packet.policy.topN),
    editorial: { packetId: packet.packetId, ledgerHash: packet.ledgerHash, policy: packet.policy,
      diagnostics: packet.diagnostics || null, acquisitionDiagnostics: packet.acquisitionDiagnostics || null,
      candidateCount: decisions.length, promptHash: packet.promptHash, reviewer: response.reviewer, reviewedAt: response.reviewedAt,
      decisions, counts: decisions.reduce((counts, row) => { counts[row.status] = (counts[row.status] || 0) + 1; return counts; }, {}) }
  };
  return { ...selection, selectionHash: hash(selection) };
}

function recordEdition(ledger, selected, summary, now = new Date().toISOString()) {
  validateLedger(ledger);
  assert(selected.editorialStatus === 'reviewed' && selected.editorial?.packetId, 'Only reviewed selections can be recorded');
  const { selectionHash, ...selectionPayload } = selected;
  assert(selectionHash === hash(selectionPayload), 'Selection changed after review; run select again');
  const id = selected.editorial.packetId;
  const summaryHash = hash(summary);
  const existing = ledger.editions.find(e => e.id === id);
  if (existing) {
    assert(existing.summaryHash === summaryHash, 'Edition already recorded with different summary');
    return ledger;
  }
  assert(hash(ledger) === selected.editorial.ledgerHash, 'History changed; prepare and review again before recording');
  assert(summary?.metadata?.qualityGates?.applied === true, 'Validate summary before recording');
  const chosen = [...selected.topArticles, ...selected.otherTopArticles];
  for (const [expected, actual] of [[selected.topArticles, summary.tier1], [selected.otherTopArticles, summary.tier2]]) {
    assert(Array.isArray(actual) && actual.length === expected.length && expected.every((row, i) => canonicalUrl(row.link) === canonicalUrl(actual[i].link)), 'Summary must preserve selected tier membership, links and order');
  }
  const edition = {
    id, recordedAt: now, date: selected.date, summaryHash,
    policyVersion: selected.editorial.policy.version, promptHash: selected.editorial.promptHash,
    reviewer: selected.editorial.reviewer, counts: selected.editorial.counts,
    events: chosen.map(row => ({ eventId: row.review.eventId, storyId: row.review.storyId,
      eventSummary: row.review.eventSummary, newInformation: row.review.newInformation || '', noveltyEvidence: row.review.noveltyEvidence || '',
      id: row.id, link: row.link, title: row.title, source: row.source, score: row.editorialScore }))
  };
  return { ...ledger, editions: [...ledger.editions, edition] };
}

function evaluate(gold, selected) {
  assert(Array.isArray(gold) && gold.length > 0, 'Gold must be a nonempty array');
  assert(new Set(gold.map(g => g.id)).size === gold.length, 'Duplicate gold IDs');
  const decisions = selected.editorial.decisions;
  const byId = new Map(decisions.map(row => [row.id, row]));
  const result = { labeled: 0, either: 0, covered: 0, correct: 0, tp: 0, fp: 0, fn: 0, tn: 0, failures: 0, mismatches: [] };
  for (const label of gold) {
    assert(nonempty(label.id) && ['select', 'reject', 'either'].includes(label.label), 'Invalid gold label');
    if (label.label === 'either') { result.either++; continue; }
    result.labeled++;
    const row = byId.get(label.id);
    if (!row || row.status === 'pending' || row.decisionOrigin === 'local') { result.failures++; result.mismatches.push({ id: label.id, expected: label.label, actual: 'unresolved' }); continue; }
    result.covered++;
    const positive = row.status === 'selected';
    const wanted = label.label === 'select';
    result[positive ? (wanted ? 'tp' : 'fp') : (wanted ? 'fn' : 'tn')]++;
    if (positive === wanted) result.correct++;
    else result.mismatches.push({ id: label.id, expected: label.label, actual: row.status, reason: row.reason });
  }
  const ratio = (a, b) => b ? a / b : null;
  result.precision = ratio(result.tp, result.tp + result.fp);
  result.recall = ratio(result.tp, result.tp + result.fn);
  result.f1 = ratio(2 * result.tp, 2 * result.tp + result.fp + result.fn);
  result.coverage = ratio(result.covered, result.labeled);
  result.fullDenominatorAccuracy = ratio(result.correct, result.labeled);
  result.scope = 'Final selection, including event suppression and source/capacity quotas; unresolved cases count against coverage and accuracy.';
  return result;
}

module.exports = { EMPTY_LEDGER, prepare, select, scoreReview, recordEdition, evaluate, validateLedger };
