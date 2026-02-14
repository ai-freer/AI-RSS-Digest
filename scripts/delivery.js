/**
 * Delivery Module for RSS Digest
 *
 * 把 output-formatter 的结果投递到不同平台
 * 支持：飞书 / 钉钉 / 企业微信 / WhatsApp
 *
 * @author RSS Digest Skill
 * @version 2.2.0
 */

const crypto = require('crypto');

const DEFAULT_RETRY_OPTIONS = {
  retries: 3,
  baseDelayMs: 800,
  maxDelayMs: 5000
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function retry(task, options = {}) {
  const { retries, baseDelayMs, maxDelayMs } = {
    ...DEFAULT_RETRY_OPTIONS,
    ...(options || {})
  };

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await task(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= retries) break;
      const delay = Math.min(baseDelayMs * (2 ** attempt), maxDelayMs);
      await sleep(delay);
    }
  }
  throw lastError;
}

async function postJSON(url, body, headers = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify(body)
  });

  const raw = await response.text();
  let parsed;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = raw;
  }

  return {
    ok: response.ok,
    statusCode: response.status,
    response: parsed
  };
}

function buildResult({ success, channel, statusCode = null, response = null, error = null, details = null }) {
  return {
    success: Boolean(success),
    channel,
    statusCode,
    response,
    error: error ? String(error.message || error) : null,
    details
  };
}

function buildDingtalkSign(secret, timestamp) {
  const stringToSign = `${timestamp}\n${secret}`;
  const hmac = crypto.createHmac('sha256', secret).update(stringToSign).digest('base64');
  return encodeURIComponent(hmac);
}

function splitByChars(text, maxChars) {
  const content = String(text || '');
  if (!content) return [];
  if (content.length <= maxChars) return [content];

  const lines = content.split('\n');
  const chunks = [];
  let current = '';
  lines.forEach((line) => {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length <= maxChars) {
      current = candidate;
      return;
    }
    if (current) chunks.push(current);
    current = '';
    let rest = line;
    while (rest.length > maxChars) {
      chunks.push(rest.slice(0, maxChars));
      rest = rest.slice(maxChars);
    }
    current = rest;
  });
  if (current) chunks.push(current);

  if (chunks.length <= 1) return chunks;
  const total = chunks.length;
  return chunks.map((chunk, index) => {
    const suffix = ` (${index + 1}/${total})`;
    if (chunk.length + suffix.length <= maxChars) return `${chunk}${suffix}`;
    return `${chunk.slice(0, maxChars - suffix.length)}${suffix}`;
  });
}

function splitByBytes(text, maxBytes) {
  const content = String(text || '');
  if (!content) return [];
  if (Buffer.byteLength(content, 'utf8') <= maxBytes) return [content];

  const chars = Array.from(content);
  const chunks = [];
  let current = '';
  for (const ch of chars) {
    const candidate = current + ch;
    if (Buffer.byteLength(candidate, 'utf8') <= maxBytes) {
      current = candidate;
      continue;
    }
    if (current) chunks.push(current);
    current = ch;
    while (Buffer.byteLength(current, 'utf8') > maxBytes) {
      // 理论上很少发生（单字符超限），兜底降级为空字符
      current = '';
      break;
    }
  }
  if (current) chunks.push(current);

  if (chunks.length <= 1) return chunks;
  const total = chunks.length;
  return chunks.map((chunk, index) => {
    const suffix = ` (${index + 1}/${total})`;
    const suffixBytes = Buffer.byteLength(suffix, 'utf8');
    if (Buffer.byteLength(chunk, 'utf8') + suffixBytes <= maxBytes) {
      return `${chunk}${suffix}`;
    }
    let trimmed = chunk;
    while (trimmed && Buffer.byteLength(trimmed, 'utf8') + suffixBytes > maxBytes) {
      trimmed = trimmed.slice(0, -1);
    }
    return `${trimmed}${suffix}`;
  });
}

function normalizeRetryOptions(config = {}) {
  return {
    retries: Number.isInteger(config.retries) ? config.retries : DEFAULT_RETRY_OPTIONS.retries,
    baseDelayMs: Number.isInteger(config.baseDelayMs) ? config.baseDelayMs : DEFAULT_RETRY_OPTIONS.baseDelayMs,
    maxDelayMs: Number.isInteger(config.maxDelayMs) ? config.maxDelayMs : DEFAULT_RETRY_OPTIONS.maxDelayMs
  };
}

function ensureValue(value, name) {
  if (value === undefined || value === null || value === '') {
    throw new Error(`Missing required config: ${name}`);
  }
}

async function sendToFeishu(formattedData, config = {}) {
  try {
    const webhookUrl = config.webhookUrl || (config.webhookId ? `https://open.feishu.cn/open-apis/bot/v2/hook/${config.webhookId}` : null);
    ensureValue(webhookUrl, 'webhookUrl or webhookId');

    if (config.dryRun) {
      return buildResult({
        success: true,
        channel: 'feishu',
        response: { dryRun: true, webhookUrl, payload: formattedData }
      });
    }

    const retryOptions = normalizeRetryOptions(config);
    const result = await retry(async () => {
      const res = await postJSON(webhookUrl, formattedData);
      if (!res.ok) throw new Error(`Feishu HTTP ${res.statusCode}`);
      if (!(res.response && Number(res.response.code) === 0)) {
        throw new Error(`Feishu response code: ${res.response?.code}`);
      }
      return res;
    }, retryOptions);

    return buildResult({
      success: true,
      channel: 'feishu',
      statusCode: result.statusCode,
      response: result.response
    });
  } catch (error) {
    return buildResult({ success: false, channel: 'feishu', error });
  }
}

async function sendToDingtalk(formattedData, config = {}) {
  try {
    ensureValue(config.accessToken, 'accessToken');
    const timestamp = Date.now();
    const signPart = config.secret
      ? `&timestamp=${timestamp}&sign=${buildDingtalkSign(config.secret, timestamp)}`
      : '';
    const url = `https://oapi.dingtalk.com/robot/send?access_token=${encodeURIComponent(config.accessToken)}${signPart}`;

    if (config.dryRun) {
      return buildResult({
        success: true,
        channel: 'dingtalk',
        response: { dryRun: true, url, payload: formattedData }
      });
    }

    const retryOptions = normalizeRetryOptions(config);
    const result = await retry(async () => {
      const res = await postJSON(url, formattedData);
      if (!res.ok) throw new Error(`DingTalk HTTP ${res.statusCode}`);
      if (!(res.response && Number(res.response.errcode) === 0)) {
        throw new Error(`DingTalk errcode: ${res.response?.errcode}`);
      }
      return res;
    }, retryOptions);

    return buildResult({
      success: true,
      channel: 'dingtalk',
      statusCode: result.statusCode,
      response: result.response
    });
  } catch (error) {
    return buildResult({ success: false, channel: 'dingtalk', error });
  }
}

function forceSplitByBytes(messages, maxBytes) {
  return messages.flatMap(message => splitByBytes(message, maxBytes)).filter(Boolean);
}

function resolveWecomMessages(formattedData, maxBytes = 2048) {
  if (Array.isArray(formattedData?.messages) && formattedData.messages.length > 0) {
    const normalized = formattedData.messages.map(item => {
      if (typeof item === 'string') return item;
      return item?.text?.content || item?.content || JSON.stringify(item);
    });
    return forceSplitByBytes(normalized, maxBytes);
  }

  if (Array.isArray(formattedData?.chunks) && formattedData.chunks.length > 0) {
    return forceSplitByBytes(formattedData.chunks, maxBytes);
  }

  const raw = formattedData?.text?.content || formattedData?.content || '';
  return forceSplitByBytes([raw], maxBytes);
}

async function sendToWecom(formattedData, config = {}) {
  try {
    ensureValue(config.key, 'key');
    const url = `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=${encodeURIComponent(config.key)}`;
    const messages = resolveWecomMessages(formattedData, config.maxBytes || 2048);

    if (messages.length === 0) {
      throw new Error('WeCom payload is empty');
    }

    if (config.dryRun) {
      return buildResult({
        success: true,
        channel: 'wecom',
        response: { dryRun: true, url, messages }
      });
    }

    const retryOptions = normalizeRetryOptions(config);
    const details = [];

    for (const message of messages) {
      const payload = {
        msgtype: 'text',
        text: { content: message }
      };

      const result = await retry(async () => {
        const res = await postJSON(url, payload);
        if (!res.ok) throw new Error(`WeCom HTTP ${res.statusCode}`);
        if (!(res.response && Number(res.response.errcode) === 0)) {
          throw new Error(`WeCom errcode: ${res.response?.errcode}`);
        }
        return res;
      }, retryOptions);

      details.push({
        success: true,
        statusCode: result.statusCode,
        response: result.response
      });
    }

    return buildResult({
      success: true,
      channel: 'wecom',
      statusCode: details[details.length - 1]?.statusCode || null,
      response: details[details.length - 1]?.response || null,
      details
    });
  } catch (error) {
    return buildResult({ success: false, channel: 'wecom', error });
  }
}

function resolveWhatsAppMessages(formattedData, maxChars = 4096) {
  if (Array.isArray(formattedData?.messages) && formattedData.messages.length > 0) {
    return formattedData.messages.map(item => {
      if (typeof item === 'string') return item;
      return item?.text?.body || item?.body || JSON.stringify(item);
    });
  }

  const raw = formattedData?.text?.body || formattedData?.text?.content || formattedData?.content || '';
  return splitByChars(raw, maxChars);
}

async function sendToWhatsApp(formattedData, config = {}) {
  try {
    ensureValue(config.accessToken, 'accessToken');
    ensureValue(config.phoneNumberId, 'phoneNumberId');
    ensureValue(config.recipientPhone, 'recipientPhone');

    const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(config.phoneNumberId)}/messages`;
    const messages = resolveWhatsAppMessages(formattedData, config.maxChars || 4096);
    if (messages.length === 0) {
      throw new Error('WhatsApp payload is empty');
    }

    if (config.dryRun) {
      return buildResult({
        success: true,
        channel: 'whatsapp',
        response: { dryRun: true, url, messages }
      });
    }

    const retryOptions = normalizeRetryOptions(config);
    const details = [];

    for (const message of messages) {
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: config.recipientPhone,
        type: 'text',
        text: {
          preview_url: true,
          body: message
        }
      };

      const result = await retry(async () => {
        const res = await postJSON(url, payload, {
          Authorization: `Bearer ${config.accessToken}`
        });
        if (!res.ok) throw new Error(`WhatsApp HTTP ${res.statusCode}`);
        return res;
      }, retryOptions);

      const ok = Boolean(result.response?.messages?.[0]?.id);
      details.push({
        success: ok,
        statusCode: result.statusCode,
        response: result.response
      });

      if (!ok) {
        throw new Error('WhatsApp API did not return message id');
      }
    }

    return buildResult({
      success: true,
      channel: 'whatsapp',
      statusCode: details[details.length - 1]?.statusCode || null,
      response: details[details.length - 1]?.response || null,
      details
    });
  } catch (error) {
    return buildResult({ success: false, channel: 'whatsapp', error });
  }
}

async function main({ params }) {
  const { formattedData, channel, config = {} } = params || {};

  if (!formattedData) {
    return buildResult({
      success: false,
      channel: channel || 'unknown',
      error: new Error('Missing formattedData')
    });
  }

  switch (channel) {
    case 'feishu':
      return sendToFeishu(formattedData, config);
    case 'dingtalk':
      return sendToDingtalk(formattedData, config);
    case 'wecom':
    case 'wechat-work':
      return sendToWecom(formattedData, config);
    case 'whatsapp':
      return sendToWhatsApp(formattedData, config);
    default:
      return buildResult({
        success: false,
        channel: channel || 'unknown',
        error: new Error(`Unknown channel: ${channel}`)
      });
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    main,
    postJSON,
    retry,
    splitByBytes,
    splitByChars,
    resolveWecomMessages,
    sendToFeishu,
    sendToDingtalk,
    sendToWecom,
    sendToWhatsApp
  };
}

if (typeof exports !== 'undefined') {
  exports.main = main;
}
