/**
 * RSS Fetcher for Automation Workflow
 *
 * 用于自动化流程的 RSS 抓取脚本
 * 内置 90+ 精选 RSS 源，支持智能抓取、轻量去重、排序分层
 * 分类方式：AI 动态分类（基于文章内容而非预定义标签）
 *
 * @author RSS Digest Skill
 * @version 2.3.1
 */

// ==================== 配置 ====================
const fs = require('fs');
const { JSDOM } = require('jsdom');
const { coverageDiagnostics } = require('./candidate-readiness');
const path = require('path');
const { USER_AGENT } = require('./project-meta');
const { parseCliArgs } = require('./cli-utils');
const { canonicalUrl, fingerprint, articleId } = require('./article-identity');

const CONFIG = {
  // 并发控制
  CONCURRENCY: 5,

  // 超时设置 (毫秒)
  TIMEOUT: 10000,
  RETRIES: 3,

  // 时间窗口 (默认 24 小时)
  TIME_WINDOW_HOURS: 24,

  // 最大文章数
  MAX_ARTICLES: 50,

  // 内容长度限制
  MAX_CONTENT_LENGTH: 2000,

  // 缓存 TTL (毫秒)
  CACHE_TTL: 30 * 60 * 1000
};

// ==================== RSS 源清单 ====================
// 基础 RSS 源（英文/国际）
// 不再预分类，由 AI 根据内容动态分类

const BASE_RSS_FEEDS = [
  // 编程/工程相关
  { name: "simonwillison.net", url: "https://simonwillison.net/atom/everything/", tags: ["编程", "Python", "数据"], weight: 1.2 },
  { name: "antirez.com", url: "http://antirez.com/rss", tags: ["编程", "C", "Redis"], weight: 1.2 },
  { name: "terriblesoftware.org", url: "https://terriblesoftware.org/feed/", tags: ["编程", "工程"], weight: 1.0 },
  { name: "herman.bearblog.dev", url: "https://herman.bearblog.dev/feed/", tags: ["编程", "独立开发"], weight: 1.0 },
  { name: "blog.pixelmelt.dev", url: "https://blog.pixelmelt.dev/rss/", tags: ["编程", "系统"], weight: 1.0 },
  { name: "matklad.github.io", url: "https://matklad.github.io/feed.xml", tags: ["编程", "Rust", "编译器"], weight: 1.2 },
  { name: "overreacted.io", url: "https://overreacted.io/rss.xml", tags: ["编程", "前端", "React"], weight: 1.1 },
  { name: "blog.jim-nielsen.com", url: "https://blog.jim-nielsen.com/feed.xml", tags: ["编程", "前端", "Web"], weight: 1.0 },
  { name: "eli.thegreenplace.net", url: "https://eli.thegreenplace.net/feeds/all.atom.xml", tags: ["编程", "编译器"], weight: 1.1 },
  { name: "susam.net", url: "https://susam.net/feed.xml", tags: ["编程", "Lisp"], weight: 1.0 },
  { name: "borretti.me", url: "https://borretti.me/feed.xml", tags: ["编程", "编程语言"], weight: 1.0 },
  { name: "hugotunius.se", url: "https://hugotunius.se/feed.xml", tags: ["编程", "系统"], weight: 1.0 },
  { name: "chadnauseam.com", url: "https://chadnauseam.com/rss.xml", tags: ["编程", "编程语言"], weight: 1.0 },
  { name: "chiark.greenend.org.uk/~sgtatham", url: "https://www.chiark.greenend.org.uk/~sgtatham/quasiblog/feed.xml", tags: ["编程", "C"], weight: 1.0 },
  { name: "beej.us", url: "https://beej.us/blog/rss.xml", tags: ["编程", "网络"], weight: 1.0 },
  { name: "refactoringenglish.com", url: "https://refactoringenglish.com/index.xml", tags: ["编程", "写作"], weight: 1.0 },
  { name: "evanhahn.com", url: "https://evanhahn.com/feed.xml", tags: ["编程", "JavaScript"], weight: 1.0 },
  { name: "maurycyz.com", url: "https://maurycyz.com/index.xml", tags: ["编程"], weight: 1.0 },
  { name: "gilesthomas.com", url: "https://gilesthomas.com/feed/rss.xml", tags: ["编程", "Python"], weight: 1.0 },
  { name: "skyfall.dev", url: "https://skyfall.dev/rss.xml", tags: ["编程", "AI"], weight: 1.0 },
  { name: "rakhim.exotext.com", url: "https://rakhim.exotext.com/rss.xml", tags: ["编程"], weight: 1.0 },
  { name: "rachelbythebay.com", url: "https://rachelbythebay.com/w/atom.xml", tags: ["编程", "系统"], weight: 1.1 },

  // AI/ML 相关
  { name: "seangoedecke.com", url: "https://www.seangoedecke.com/rss.xml", tags: ["AI", "工程"], weight: 1.1 },
  { name: "garymarcus.substack.com", url: "https://garymarcus.substack.com/feed", tags: ["AI", "研究"], weight: 1.1 },
  { name: "entropicthoughts.com", url: "https://entropicthoughts.com/feed.xml", tags: ["AI", "数学"], weight: 1.0 },
  { name: "jayd.ml", url: "https://jayd.ml/feed.xml", tags: ["AI", "ML"], weight: 1.0 },
  { name: "minimaxir.com", url: "https://minimaxir.com/index.xml", tags: ["AI", "数据科学"], weight: 1.1 },
  { name: "geoffreylitt.com", url: "https://www.geoffreylitt.com/feed.xml", tags: ["AI", "交互"], weight: 1.0 },
  { name: "computer.rip", url: "https://computer.rip/rss.xml", tags: ["AI", "系统"], weight: 1.0 },
  { name: "dynomight.net", url: "https://dynomight.net/feed.xml", tags: ["AI", "分析"], weight: 1.1 },
  { name: "martinalderson.com", url: "https://martinalderson.com/feed.xml", tags: ["AI"], weight: 1.0 },
  { name: "anildash.com", url: "https://anildash.com/feed.xml", tags: ["AI", "科技社会"], weight: 1.0 },
  { name: "bernsteinbear.com", url: "https://bernsteinbear.com/feed.xml", tags: ["AI", "编译器"], weight: 1.0 },
  { name: "grantslatton.com", url: "https://grantslatton.com/rss.xml", tags: ["AI", "创业"], weight: 1.0 },

  // 系统/底层
  { name: "devblogs.microsoft.com/oldnewthing", url: "https://devblogs.microsoft.com/oldnewthing/feed", tags: ["系统", "Windows"], weight: 1.1 },
  { name: "righto.com", url: "https://www.righto.com/feeds/posts/default", tags: ["系统", "硬件"], weight: 1.1 },
  { name: "oldvcr.blogspot.com", url: "https://oldvcr.blogspot.com/feeds/posts/default", tags: ["系统", "复古"], weight: 1.0 },
  { name: "fabiensanglard.net", url: "https://fabiensanglard.net/rss.xml", tags: ["系统", "游戏引擎"], weight: 1.1 },
  { name: "jyn.dev", url: "https://jyn.dev/atom.xml", tags: ["系统"], weight: 1.0 },
  { name: "michael.stapelberg.ch", url: "https://michael.stapelberg.ch/feed.xml", tags: ["系统", "Linux"], weight: 1.1 },
  { name: "aresluna.org", url: "https://aresluna.org/main.rss", tags: ["系统", "复古"], weight: 1.0 },
  { name: "tomrenner.com", url: "https://tomrenner.com/index.xml", tags: ["系统"], weight: 1.0 },
  { name: "abortretry.fail", url: "https://www.abortretry.fail/feed", tags: ["系统", "硬件"], weight: 1.0 },
  { name: "utcc.utoronto.ca/~cks", url: "https://utcc.utoronto.ca/~cks/space/blog/?atom", tags: ["系统"], weight: 1.0 },
  { name: "xeiaso.net", url: "https://xeiaso.net/blog.rss", tags: ["系统"], weight: 1.0 },
  { name: "it-notes.dragas.net", url: "https://it-notes.dragas.net/feed/", tags: ["系统"], weight: 1.0 },

  // 硬件/DIY
  { name: "jeffgeerling.com", url: "https://www.jeffgeerling.com/blog.xml", tags: ["硬件", "Linux"], weight: 1.1 },
  { name: "ericmigi.com", url: "https://ericmigi.com/rss.xml", tags: ["硬件", "设计"], weight: 1.0 },
  { name: "bogdanthegeek.github.io", url: "https://bogdanthegeek.github.io/blog/index.xml", tags: ["硬件"], weight: 1.0 },
  { name: "berthub.eu", url: "https://berthub.eu/articles/index.xml", tags: ["硬件", "网络"], weight: 1.0 },
  { name: "danielchasehooper.com", url: "https://danielchasehooper.com/feed.xml", tags: ["硬件", "图形"], weight: 1.0 },

  // 安全/逆向
  { name: "krebsonsecurity.com", url: "https://krebsonsecurity.com/feed/", tags: ["安全", "网络"], weight: 1.2 },
  { name: "lcamtuf.substack.com", url: "https://lcamtuf.substack.com/feed", tags: ["安全", "研究"], weight: 1.1 },
  { name: "micahflee.com", url: "https://micahflee.com/feed/", tags: ["安全", "隐私"], weight: 1.0 },
  { name: "troyhunt.com", url: "https://www.troyhunt.com/rss/", tags: ["安全", "数据"], weight: 1.1 },
  { name: "geohot.github.io", url: "https://geohot.github.io/blog/feed.xml", tags: ["安全", "逆向", "自动驾驶"], weight: 1.1 },
  { name: "nesbitt.io", url: "https://nesbitt.io/feed.xml", tags: ["安全"], weight: 1.0 },
  { name: "brutecat.com", url: "https://brutecat.com/rss.xml", tags: ["安全"], weight: 1.0 },
  { name: "hey.paris", url: "https://hey.paris/index.xml", tags: ["安全", "逆向"], weight: 1.0 },

  // 创业/产品/商业
  { name: "dwarkesh.com", url: "https://www.dwarkeshpatel.com/feed", tags: ["创业", "访谈"], weight: 1.1 },
  { name: "paulgraham.com", url: "http://www.aaronsw.com/2002/feeds/pgessays.rss", tags: ["创业", "YC"], weight: 1.2 },
  { name: "steveblank.com", url: "https://steveblank.com/feed/", tags: ["创业", "精益创业"], weight: 1.1 },
  { name: "experimental-history.com", url: "https://www.experimental-history.com/feed", tags: ["创业", "科学"], weight: 1.0 },
  { name: "danielwirtz.com", url: "https://danielwirtz.com/rss.xml", tags: ["产品", "设计"], weight: 1.0 },
  { name: "philiplaine.com", url: "https://philiplaine.com/index.xml", tags: ["产品"], weight: 1.0 },
  { name: "keygen.sh", url: "https://keygen.sh/blog/feed.xml", tags: ["创业", "SaaS"], weight: 1.0 },
  { name: "mitchellh.com", url: "https://mitchellh.com/feed.xml", tags: ["创业", "HashiCorp"], weight: 1.1 },

  // 综合/评论/深度
  { name: "daringfireball.net", url: "https://daringfireball.net/feeds/main", tags: ["综合", "苹果"], weight: 1.1 },
  { name: "pluralistic.net", url: "https://pluralistic.net/feed/", tags: ["综合", "数字权利"], weight: 1.0 },
  { name: "shkspr.mobi", url: "https://shkspr.mobi/blog/feed/", tags: ["综合"], weight: 1.0 },
  { name: "idiallo.com", url: "https://idiallo.com/feed.rss", tags: ["综合"], weight: 1.0 },
  { name: "lucumr.pocoo.org", url: "https://lucumr.pocoo.org/feed.atom", tags: ["综合", "Python"], weight: 1.0 },
  { name: "timsh.org", url: "https://timsh.org/rss/", tags: ["综合"], weight: 1.0 },
  { name: "johndcook.com", url: "https://www.johndcook.com/blog/feed/", tags: ["综合", "数学"], weight: 1.0 },
  { name: "construction-physics.com", url: "https://www.construction-physics.com/feed", tags: ["综合", "工程"], weight: 1.1 },
  { name: "tedium.co", url: "https://feed.tedium.co/", tags: ["综合", "历史"], weight: 1.0 },
  { name: "buttondown.com/hillelwayne", url: "https://buttondown.com/hillelwayne/rss", tags: ["综合", "形式方法"], weight: 1.0 },
  { name: "wheresyoured.at", url: "https://www.wheresyoured.at/rss/", tags: ["综合", "科技评论"], weight: 1.1 },
  { name: "filfre.net", url: "https://www.filfre.net/feed/", tags: ["综合", "游戏历史"], weight: 1.0 },
  { name: "gwern.net", url: "https://gwern.substack.com/feed", tags: ["综合", "研究"], weight: 1.2 },
  { name: "simone.org", url: "https://simone.org/feed/", tags: ["综合"], weight: 1.0 },
  { name: "matduggan.com", url: "https://matduggan.com/rss/", tags: ["综合"], weight: 1.0 },
  { name: "worksonmymachine.substack.com", url: "https://worksonmymachine.substack.com/feed", tags: ["综合"], weight: 1.0 },
  { name: "danieldelaney.net", url: "https://danieldelaney.net/feed", tags: ["综合"], weight: 1.0 },
  { name: "miguelgrinberg.com", url: "https://blog.miguelgrinberg.com/feed", tags: ["综合", "Python"], weight: 1.0 },
  { name: "tedunangst.com", url: "https://www.tedunangst.com/flak/rss", tags: ["综合", "BSD"], weight: 1.0 },
  { name: "joanwestenberg.com", url: "https://joanwestenberg.com/rss", tags: ["综合", "科技写作"], weight: 1.0 },
  { name: "xania.org", url: "https://xania.org/feed", tags: ["综合"], weight: 1.0 },
  { name: "downtowndougbrown.com", url: "https://www.downtowndougbrown.com/feed/", tags: ["综合"], weight: 1.0 },
  { name: "dfarq.homeip.net", url: "https://dfarq.homeip.net/feed/", tags: ["综合", "复古"], weight: 1.0 },
  { name: "derekthompson.org", url: "https://www.theatlantic.com/feed/author/derek-thompson/", tags: ["综合", "商业"], weight: 1.0 },
  { name: "mjg59.dreamwidth.org", url: "https://mjg59.dreamwidth.org/data/rss", tags: ["综合", "Linux"], weight: 1.0 },
];

// 中文 RSS 候选源（来自 RSS_FEEDS_CN.md）
// 默认启用 A 级中文源，可通过 includeCN 显式关闭
const CN_RSS_FEEDS = [
  // A 级（优先接入）
  { name: "阮一峰科技爱好者周刊", url: "https://www.ruanyifeng.com/blog/atom.xml", tags: ["中文", "编程", "周刊"], weight: 1.2, language: "zh", tier: "A" },
  { name: "云风 BLOG", url: "https://blog.codingnow.com/atom.xml", tags: ["中文", "编程", "系统", "工程"], weight: 1.2, language: "zh", tier: "A" },
  { name: "面向信仰编程", url: "https://draven.co/feed.xml", tags: ["中文", "编程", "Go", "分布式"], weight: 1.1, language: "zh", tier: "A" },
  { name: "张鑫旭博客", url: "https://www.zhangxinxu.com/wordpress/feed/", tags: ["中文", "前端", "CSS", "浏览器"], weight: 1.1, language: "zh", tier: "A" },
  { name: "机器之心", url: "https://www.jiqizhixin.com/rss", tags: ["中文", "AI", "资讯"], weight: 1.1, language: "zh", tier: "A" },
  { name: "AIHOT", url: "https://aihot.news/feed/all.xml", tags: ["中文", "AI", "资讯", "聚合"], weight: 1.2, language: "zh", tier: "A" },
  { name: "量子位", url: "https://www.qbitai.com/feed", tags: ["中文", "AI", "资讯"], weight: 1.0, language: "zh", tier: "A" },
  { name: "少数派", url: "https://sspai.com/feed", tags: ["中文", "综合", "工具", "方法论"], weight: 1.1, language: "zh", tier: "A" },
  { name: "36氪", url: "https://www.36kr.com/feed", tags: ["中文", "创业", "商业", "产品"], weight: 1.0, language: "zh", tier: "A" },

  // B 级（按需接入）
  { name: "V2EX 热门", url: "https://www.v2ex.com/index.xml", tags: ["中文", "社区", "热点"], weight: 0.85, language: "zh", tier: "B" },
  { name: "人人都是产品经理", url: "https://www.woshipm.com/feed", tags: ["中文", "创业", "产品"], weight: 0.95, language: "zh", tier: "B" },
  { name: "先知社区", url: "https://xz.aliyun.com/feed", tags: ["中文", "安全"], weight: 0.9, language: "zh", tier: "B" },
  { name: "InfoQ 中文", url: "https://www.infoq.cn/feed", tags: ["中文", "综合", "工程实践"], weight: 0.95, language: "zh", tier: "B" },
  { name: "爱范儿", url: "https://www.ifanr.com/feed", tags: ["中文", "综合", "消费科技"], weight: 0.9, language: "zh", tier: "B" },
];

// 默认源列表：基础源 + A 级中文源
const RSS_FEEDS = buildFeedList();

function normalizeTier(value) {
  if (!value) return 'A';
  const normalized = String(value).trim().toUpperCase();
  if (normalized === 'B') return 'B';
  if (normalized === 'ALL') return 'ALL';
  return 'A';
}

function normalizeLanguageFilter(value) {
  if (!value) return 'all';
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'all') return 'all';
  if (normalized === 'zh' || normalized === 'cn') return 'zh';
  if (normalized === 'global' || normalized === 'en' || normalized === 'base') return 'global';
  return 'all';
}

function buildFeedList({ includeCN = true, cnTier = 'A' } = {}) {
  if (!includeCN) {
    return [...BASE_RSS_FEEDS];
  }

  const tier = normalizeTier(cnTier);
  const cnFeeds = tier === 'ALL'
    ? CN_RSS_FEEDS
    : CN_RSS_FEEDS.filter(feed => feed.tier === tier);

  return [...BASE_RSS_FEEDS, ...cnFeeds];
}

// ==================== 工具函数 ====================

/**
 * 获取指定标签节点（兼容 namespace/localName）
 */
function getElementsByTag(root, tagName) {
  if (!root || !tagName) return [];
  const matches = [];
  const direct = root.getElementsByTagName(tagName);
  for (let i = 0; i < direct.length; i++) {
    matches.push(direct[i]);
  }

  // 兼容 localName（例如 content:encoded -> encoded）
  const all = root.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    const node = all[i];
    if (
      node.localName === tagName ||
      node.nodeName === tagName ||
      node.nodeName.endsWith(`:${tagName}`)
    ) {
      if (!matches.includes(node)) {
        matches.push(node);
      }
    }
  }
  return matches;
}

/**
 * 从候选标签中提取第一个非空文本
 */
function getFirstTagText(root, tagCandidates) {
  for (const tag of tagCandidates) {
    const nodes = getElementsByTag(root, tag);
    if (nodes.length > 0) {
      const node = nodes[0];
      const value = (node.children.length ? node.innerHTML : node.textContent || '').trim();
      if (value) return value;
    }
  }
  return '';
}

/**
 * DOM 方式解析 RSS
 */
function parseRSSWithDom(doc) {
  const items = [];
  const nodes = getElementsByTag(doc, 'item');
  for (const item of nodes) {
    items.push({
      title: getFirstTagText(item, ['title']),
      link: getFirstTagText(item, ['link']),
      description: getFirstTagText(item, ['encoded', 'content', 'description']),
      pubDate: getFirstTagText(item, ['pubDate', 'date']),
      guid: getFirstTagText(item, ['guid', 'id'])
    });
  }
  return items;
}

/**
 * DOM 方式解析 Atom
 */
function parseAtomWithDom(doc) {
  const items = [];
  const nodes = getElementsByTag(doc, 'entry');

  for (const entry of nodes) {
    let link = '';
    const linkNodes = getElementsByTag(entry, 'link');
    for (const linkNode of linkNodes) {
      const href = linkNode.getAttribute && linkNode.getAttribute('href');
      const rel = linkNode.getAttribute && linkNode.getAttribute('rel');
      if (href && (!rel || rel === 'alternate')) {
        link = href;
        break;
      }
      if (href && !link) {
        link = href;
      }
    }

    items.push({
      title: getFirstTagText(entry, ['title']),
      link,
      description: getFirstTagText(entry, ['content', 'summary']),
      pubDate: getFirstTagText(entry, ['updated', 'published']),
      guid: getFirstTagText(entry, ['id'])
    });
  }
  return items;
}

/** Parse XML consistently in Node; malformed feeds must not look like empty feeds. */
function parseFeed(xmlText) {
  let dom;
  try {
    dom = new JSDOM(xmlText, { contentType: 'application/xml' });
    const doc = dom.window.document;
    const root = doc.documentElement.localName;
    if (root === 'feed') return parseAtomWithDom(doc);
    if (root === 'rss' || root === 'RDF') return parseRSSWithDom(doc);
    throw new Error(`Unsupported feed root: ${root}`);
  } catch (error) {
    throw new Error(`Invalid RSS/Atom XML: ${error.message}`);
  } finally {
    if (dom) dom.window.close();
  }
}

/**
 * 清理 HTML 标签
 */
function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 提取正文（简化版 readability）
 */
function extractContent(html) {
  if (!html) return '';
  const fragment = JSDOM.fragment(html);
  for (const node of fragment.querySelectorAll('script, style')) node.remove();
  for (const node of fragment.querySelectorAll('p, div, br, li, h1, h2, h3, pre')) node.append(' ');
  const text = (fragment.textContent || '').replace(/\s+/g, ' ').trim();
  return text.length > CONFIG.MAX_CONTENT_LENGTH ? text.slice(0, CONFIG.MAX_CONTENT_LENGTH) + '...' : text;
}

/**
 * 解析日期
 */
function parseDate(dateStr) {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * 计算字符串相似度（编辑距离）
 */
function similarity(str1, str2) {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const distance = matrix[len1][len2];
  const maxLen = Math.max(len1, len2);
  return 1 - distance / maxLen;
}

/**
 * 生成内容指纹（用于去重）
 */
function contentFingerprint(text) {
  return fingerprint(text);
}

// ==================== 核心功能 ====================

/**
 * 抓取单个 RSS 源
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 单次抓取（不重试）
 */
async function fetchFeedOnce(feed, timeout = CONFIG.TIMEOUT) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(feed.url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const xmlText = await response.text();
    const items = parseFeed(xmlText);

    return {
      success: true,
      feed: feed.name,
      items: items.map(item => ({
        title: item.title || 'Untitled',
        link: item.link || '',
        content: extractContent(item.description),
        rawContent: item.description || '',
        pubDate: item.pubDate,
        source: feed.name,
        // 不再预分类，tags 仅作为参考，AI 根据内容动态分类
        sourceTags: feed.tags || [],
        weight: feed.weight || 1.0,
        language: feed.language || 'global',
        sourceTier: feed.tier || 'BASE',
        guid: item.guid || item.link
      }))
    };
  } catch (error) {
    clearTimeout(timeoutId);
    return {
      success: false,
      feed: feed.name,
      error: error.message
    };
  }
}

/**
 * 抓取单个 RSS 源（带重试）
 */
async function fetchFeed(feed, timeout = CONFIG.TIMEOUT) {
  let lastError = 'Unknown error';
  const attempts = CONFIG.RETRIES + 1;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const result = await fetchFeedOnce(feed, timeout);
    if (result.success) {
      return result;
    }

    lastError = result.error;

    if (attempt < attempts) {
      const backoffMs = Math.pow(2, attempt - 1) * 1000;
      await sleep(backoffMs);
    }
  }

  return {
    success: false,
    feed: feed.name,
    error: lastError
  };
}

/**
 * 并发抓取多个 RSS 源
 */
async function fetchFeeds(feeds, concurrency = CONFIG.CONCURRENCY) {
  const results = [];
  const errors = [];

  // 分批处理
  for (let i = 0; i < feeds.length; i += concurrency) {
    const batch = feeds.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(feed => fetchFeed(feed))
    );

    for (const result of batchResults) {
      if (result.success) {
        results.push(...result.items);
      } else {
        errors.push({
          feed: result.feed,
          error: result.error
        });
      }
    }
  }

  return { articles: results, errors };
}

/**
 * 检测单个 RSS 源健康状态
 */
async function checkFeedHealth(feed, timeout = 5000) {
  const start = Date.now();
  const result = await fetchFeedOnce(feed, timeout);
  const latencyMs = Date.now() - start;

  if (result.success) {
    return {
      feed: feed.name,
      url: feed.url,
      healthy: true,
      latencyMs,
      itemCount: result.items.length
    };
  }

  return {
    feed: feed.name,
    url: feed.url,
    healthy: false,
    latencyMs,
    error: result.error
  };
}

/**
 * 批量检测 RSS 源健康状态
 */
async function checkFeedsHealth(feeds, concurrency = CONFIG.CONCURRENCY, timeout = 5000) {
  const checks = [];

  for (let i = 0; i < feeds.length; i += concurrency) {
    const batch = feeds.slice(i, i + concurrency);
    const results = await Promise.all(batch.map(feed => checkFeedHealth(feed, timeout)));
    checks.push(...results);
  }

  const healthyCount = checks.filter(c => c.healthy).length;
  const unhealthyCount = checks.length - healthyCount;

  return {
    checks,
    stats: {
      total: checks.length,
      healthy: healthyCount,
      unhealthy: unhealthyCount
    }
  };
}

/**
 * 轻量去重和候选准备（以排序为主，尽量少做强过滤）
 */
function prepareCandidates(articles, timeWindowHours = CONFIG.TIME_WINDOW_HOURS) {
  const seenKeys = new Set();
  const cutoffTime = new Date(Date.now() - timeWindowHours * 60 * 60 * 1000);

  const candidates = [];

  for (const article of articles) {
    // 时间过滤
    const pubDate = parseDate(article.pubDate);
    if (pubDate && pubDate < cutoffTime) {
      continue;
    }

    // 最小质量门槛：标题和正文至少有一个有意义
    const title = (article.title || '').trim();
    const content = (article.content || '').trim();
    if (!title && content.length < 20) {
      continue;
    }

    // 主键去重：优先 link，其次 guid，最后标题+内容指纹
    const normalizedUrl = canonicalUrl(article.link);
    const dedupKey = normalizedUrl || `${article.source || ''}:${article.guid || contentFingerprint(title + content)}`;
    if (dedupKey && seenKeys.has(dedupKey)) continue;
    if (dedupKey) seenKeys.add(dedupKey);

    candidates.push({
      ...article,
      hasValidPubDate: Boolean(pubDate),
      pubDate: pubDate ? pubDate.toISOString() : null,
      discoveredAt: new Date().toISOString()
    });
  }

  // 按时间排序
  candidates.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
  return candidates;
}

/**
 * 评分排序
 */
function scoreAndSort(articles) {
  const now = Date.now();

  return articles.map(article => {
    const pubTime = new Date(article.pubDate).getTime();
    const hoursAgo = Number.isFinite(pubTime) ? Math.max(0, (now - pubTime) / (1000 * 60 * 60)) : 48;

    // 时效性分数 (24h 内最高)，无有效发布日期时降权
    let freshnessScore = Math.max(0, 1 - hoursAgo / 48);
    if (!article.hasValidPubDate) {
      freshnessScore *= 0.35;
    }

    // 来源权重（限制上界，避免单因子过强）
    const sourceScore = Math.min(article.weight || 1.0, 1.15);

    // 内容质量
    const contentScore = Math.min(article.content.length / 2000, 1);
    const contentPresenceScore = article.content.length >= 120 ? 1 : (article.content.length >= 40 ? 0.5 : 0.1);

    // 综合分数：时效 + 来源 + 内容长度 + 内容完整性
    const totalScore =
      freshnessScore * 0.35 +
      sourceScore * 0.25 +
      contentScore * 0.25 +
      contentPresenceScore * 0.15;

    return {
      ...article,
      score: totalScore
    };
  }).sort((a, b) => b.score - a.score);
}

/**
 * 选取分层榜单：默认限制单源挤占
 */
function selectRankedArticles(sortedArticles, topN, otherTopN, maxPerSource = 3, allowSourceOverflow = false) {
  const target = Math.max(0, topN) + Math.max(0, otherTopN);
  if (target === 0) return { selected: [], quotaSkipped: 0 };

  const sourceCount = new Map();
  const selected = [];
  let quotaSkipped = 0;

  for (const article of sortedArticles) {
    if (selected.length >= target) break;
    const source = article.source || 'unknown';
    const current = sourceCount.get(source) || 0;
    if (current >= maxPerSource) {
      quotaSkipped += 1;
      continue;
    }
    sourceCount.set(source, current + 1);
    selected.push(article);
  }

  // 如果允许超配额，按 source 轮转补齐，尽量保持多样性
  if (allowSourceOverflow && selected.length < target) {
    const seenKeys = new Set(selected.map(a => a.link || `${a.source}:${a.title}`));
    const buckets = new Map();
    for (const article of sortedArticles) {
      const key = article.link || `${article.source}:${article.title}`;
      if (seenKeys.has(key)) continue;
      const source = article.source || 'unknown';
      if (!buckets.has(source)) buckets.set(source, []);
      buckets.get(source).push(article);
    }

    const sourceOrder = [...buckets.keys()];
    let progressed = true;
    while (selected.length < target && progressed) {
      progressed = false;
      for (const source of sourceOrder) {
        if (selected.length >= target) break;
        const queue = buckets.get(source);
        if (!queue || queue.length === 0) continue;
        const article = queue.shift();
        const key = article.link || `${article.source}:${article.title}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        selected.push(article);
        progressed = true;
      }
    }
  }

  return { selected, quotaSkipped };
}

// ==================== 主函数 ====================

/**
 * 主入口函数
 *
 * @param {Object} params - 输入参数
 * @param {string} params.tagFilter - 可选：按标签筛选 (如 "AI,编程")
 * @param {number} params.hours - 可选：时间窗口（小时）
 * @param {number} params.maxArticles - 可选：最大文章数
 * @param {boolean} params.healthCheck - 可选：仅执行源健康检测
 * @param {number} params.healthTimeout - 可选：健康检测超时（毫秒）
 * @param {boolean} params.includeCN - 可选：是否接入中文源（默认 true）
 * @param {string} params.cnTier - 可选：中文源等级 A/B/ALL（默认 A）
 * @param {string} params.languageFilter - 可选：语言筛选 all/zh/global（默认 all）
 * @param {number} params.topN - 可选：主榜 TopN（默认等于 maxArticles）
 * @param {number} params.otherTopN - 可选：候选榜数量（默认 30）
 * @param {number} params.maxPerSource - 可选：单源最多入榜数（默认 3）
 * @param {boolean} params.allowSourceOverflow - 可选：是否允许超配额补齐（默认 false）
 * @returns {Object} 输出结果
 */
async function main({ params }) {
  const {
    tagFilter = null,
    hours = CONFIG.TIME_WINDOW_HOURS,
    maxArticles = CONFIG.MAX_ARTICLES,
    healthCheck = false,
    healthTimeout = 5000,
    includeCN = true,
    cnTier = 'A',
    languageFilter = 'all',
    topN = null,
    otherTopN = 30,
    maxPerSource = 3,
    allowSourceOverflow = false
  } = params || {};

  const normalizedLanguageFilter = normalizeLanguageFilter(languageFilter);
  const effectiveIncludeCN = includeCN || normalizedLanguageFilter === 'zh';

  // 构建源列表（基础源 + 可选中文源）
  const allFeeds = buildFeedList({ includeCN: effectiveIncludeCN, cnTier });

  // 筛选 RSS 源（基于标签）
  let feeds = allFeeds;
  if (normalizedLanguageFilter !== 'all') {
    feeds = feeds.filter(f => (f.language || 'global') === normalizedLanguageFilter);
  }
  if (tagFilter) {
    const tags = tagFilter.split(',').map(t => t.trim());
    feeds = feeds.filter(f => f.tags && f.tags.some(t => tags.includes(t)));
  }

  // 仅执行源健康检测
  if (healthCheck) {
    const health = await checkFeedsHealth(feeds, CONFIG.CONCURRENCY, healthTimeout);
    return {
      result: {
        date: new Date().toISOString().split('T')[0],
        health: health.checks,
        stats: health.stats
      }
    };
  }

  // 抓取
  const { articles: rawArticles, errors } = await fetchFeeds(feeds);

  // 轻量去重，保留更多候选给排序层处理
  let articles = prepareCandidates(rawArticles, hours);

  // 评分排序
  articles = scoreAndSort(articles);

  const primaryTopN = Number.isFinite(Number(topN)) && Number(topN) > 0
    ? Number(topN)
    : maxArticles;
  const secondaryTopN = Number.isFinite(Number(otherTopN)) && Number(otherTopN) >= 0
    ? Number(otherTopN)
    : 30;
  const sourceCap = Number.isFinite(Number(maxPerSource)) && Number(maxPerSource) > 0
    ? Number(maxPerSource)
    : 3;
  const allowOverflow = Boolean(allowSourceOverflow);

  // 分层输出：主榜 TopN + 候选榜 OtherTopN，并限制单源挤占
  const { selected: rankedArticles, quotaSkipped } = selectRankedArticles(
    articles,
    primaryTopN,
    secondaryTopN,
    sourceCap,
    allowOverflow
  );
  const topArticles = rankedArticles.slice(0, primaryTopN);
  const otherTopArticles = rankedArticles.slice(primaryTopN, primaryTopN + secondaryTopN);

  // 格式化输出
  const formatArticle = (a) => ({
    id: articleId(a),
    title: a.title,
    link: a.link,
    content: a.content,
    source: a.source,
    sourceTags: a.sourceTags,
    language: a.language,
    sourceTier: a.sourceTier,
    pubDate: a.pubDate,
    hasValidPubDate: a.hasValidPubDate,
    discoveredAt: a.discoveredAt,
    score: Math.round(a.score * 100) / 100
  });
  const formatted = topArticles.map(formatArticle);
  const formattedOthers = otherTopArticles.map(formatArticle);

  return {
    result: {
      date: new Date().toISOString().split('T')[0],
      topN: primaryTopN,
      otherTopN: secondaryTopN,
      articles: formatted,
      topArticles: formatted,
      otherTopArticles: formattedOthers,
      // The compatibility lists above are discovery rankings, not editorial approval.
      candidates: articles.map(formatArticle),
      diagnostics: coverageDiagnostics(articles),
      editorialStatus: 'unreviewed',
      stats: {
        totalFeeds: allFeeds.length,
        filteredFeeds: feeds.length,
        successFeeds: feeds.length - errors.length,
        failedFeeds: errors.length,
        cnFeedsIncluded: effectiveIncludeCN ? allFeeds.filter(f => f.language === 'zh').length : 0,
        cnTier: effectiveIncludeCN ? normalizeTier(cnTier) : 'DISABLED',
        languageFilter: normalizedLanguageFilter,
        totalArticles: rawArticles.length,
        candidateArticles: articles.length,
        filteredArticles: formatted.length,
        rankedArticles: rankedArticles.length,
        maxPerSource: sourceCap,
        quotaSkipped,
        allowSourceOverflow: allowOverflow
      },
      errors: errors.length > 0 ? errors : undefined
    }
  };
}

// ==================== 导出 ====================

// 用于测试
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    main,
    RSS_FEEDS,
    BASE_RSS_FEEDS,
    CN_RSS_FEEDS,
    buildFeedList,
    normalizeLanguageFilter,
    CONFIG,
    parseFeed,
    extractContent,
    checkFeedHealth,
    checkFeedsHealth,
    scoreAndSort,
    prepareCandidates,
    contentFingerprint,
    selectRankedArticles
  };
}

// 兼容运行环境入口
if (typeof exports !== 'undefined') {
  exports.main = main;
}

function toNumber(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toBoolean(value, fallback = false) {
  if (value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  const lowered = String(value).toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(lowered)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(lowered)) return false;
  return fallback;
}

if (require.main === module) {
  (async () => {
    const args = parseCliArgs(process.argv);
    const result = await main({
      params: {
        tagFilter: args.tagFilter || null,
        hours: toNumber(args.hours, CONFIG.TIME_WINDOW_HOURS),
        maxArticles: toNumber(args.maxArticles, CONFIG.MAX_ARTICLES),
        healthCheck: toBoolean(args.healthCheck, false),
        healthTimeout: toNumber(args.healthTimeout, 5000),
        includeCN: toBoolean(args.includeCN, true),
        cnTier: args.cnTier || 'A',
        languageFilter: args.languageFilter || 'all',
        topN: args.topN !== undefined ? toNumber(args.topN, null) : null,
        otherTopN: toNumber(args.otherTopN, 30),
        maxPerSource: toNumber(args.maxPerSource, 3),
        allowSourceOverflow: toBoolean(args.allowSourceOverflow, false)
      }
    });

    const outputText = `${JSON.stringify(result.result, null, 2)}\n`;
    if (args.outFile) {
      const outPath = path.resolve(args.outFile);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, outputText);
      process.stdout.write(`${outPath}\n`);
      return;
    }
    process.stdout.write(outputText);
  })().catch((error) => {
    process.stderr.write(`${String(error.message || error)}\n`);
    process.exit(1);
  });
}
