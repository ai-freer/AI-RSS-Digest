/**
 * Delivery Module for RSS Digest
 *
 * 把 output-formatter 的结果投递到不同平台
 * 支持：Email / 飞书 / 钉钉 / 企业微信 / WhatsApp
 *
 * @author RSS Digest Skill
 * @version 2.3.1
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { parseCliArgs: parseStandardCliArgs } = require('./cli-utils');

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

function parseBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  }
  return fallback;
}

function normalizeRecipients(to) {
  if (Array.isArray(to)) {
    const recipients = to.map(item => String(item || '').trim()).filter(Boolean);
    return [...new Set(recipients)];
  }

  if (typeof to === 'string') {
    const recipients = to
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
    return [...new Set(recipients)];
  }

  return [];
}

function normalizeEmailConfig(config = {}) {
  return {
    mode: (config.mode || '').toLowerCase(),
    to: normalizeRecipients(config.to),
    from: config.from,
    resendApiKey: config.resendApiKey,
    smtpHost: config.smtpHost,
    smtpPort: config.smtpPort === undefined ? undefined : Number(config.smtpPort),
    smtpSecure: parseBoolean(config.smtpSecure, false),
    smtpUser: config.smtpUser,
    smtpPass: config.smtpPass
  };
}

function detectEmailMode(emailConfig) {
  if (emailConfig.mode === 'resend' || emailConfig.mode === 'smtp') return emailConfig.mode;
  if (emailConfig.resendApiKey) return 'resend';
  if (emailConfig.smtpHost) return 'smtp';
  return null;
}

function ensureEmailPayload(formattedData) {
  if (!formattedData || typeof formattedData !== 'object') {
    throw new Error('Email payload must be an object');
  }

  const subject = String(formattedData.subject || '').trim();
  const html = typeof formattedData.html === 'string' ? formattedData.html : '';
  const text = typeof formattedData.text === 'string' ? formattedData.text : '';

  ensureValue(subject, 'formattedData.subject');
  if (!html && !text) {
    throw new Error('Email payload requires html or text');
  }

  return { subject, html, text };
}

function stringifyEnvValue(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function parseDotEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const parsed = {};

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) return;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    parsed[key] = value;
  });

  return parsed;
}

function loadEnvFromDefaultFiles() {
  const cwd = process.cwd();
  const envFiles = ['.env', '.env.local'];
  envFiles.forEach((fileName) => {
    const fullPath = path.join(cwd, fileName);
    const parsed = parseDotEnvFile(fullPath);
    Object.entries(parsed).forEach(([key, value]) => {
      if (!Object.prototype.hasOwnProperty.call(process.env, key)) {
        process.env[key] = value;
      }
    });
  });
}

function readJsonFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(content);
}

function parseCliArgs(argv = []) {
  return parseStandardCliArgs(['node', 'delivery.js', ...argv]);
}

function buildConfigFromEnv(channel, env = process.env) {
  const retries = Number.parseInt(env.DELIVERY_RETRIES || '', 10);
  const baseDelayMs = Number.parseInt(env.DELIVERY_BASE_DELAY_MS || '', 10);
  const maxDelayMs = Number.parseInt(env.DELIVERY_MAX_DELAY_MS || '', 10);

  const retryConfig = {
    retries: Number.isInteger(retries) ? retries : undefined,
    baseDelayMs: Number.isInteger(baseDelayMs) ? baseDelayMs : undefined,
    maxDelayMs: Number.isInteger(maxDelayMs) ? maxDelayMs : undefined
  };

  if (channel === 'email') {
    return {
      ...retryConfig,
      mode: stringifyEnvValue(env.EMAIL_MODE).toLowerCase() || undefined,
      to: stringifyEnvValue(env.EMAIL_TO),
      from: stringifyEnvValue(env.EMAIL_FROM),
      resendApiKey: stringifyEnvValue(env.RESEND_API_KEY),
      smtpHost: stringifyEnvValue(env.SMTP_HOST),
      smtpPort: stringifyEnvValue(env.SMTP_PORT),
      smtpSecure: stringifyEnvValue(env.SMTP_SECURE),
      smtpUser: stringifyEnvValue(env.SMTP_USER),
      smtpPass: stringifyEnvValue(env.SMTP_PASS)
    };
  }

  if (channel === 'feishu') {
    return {
      ...retryConfig,
      webhookUrl: stringifyEnvValue(env.FEISHU_WEBHOOK_URL),
      webhookId: stringifyEnvValue(env.FEISHU_WEBHOOK_ID)
    };
  }

  if (channel === 'dingtalk') {
    return {
      ...retryConfig,
      accessToken: stringifyEnvValue(env.DINGTALK_ACCESS_TOKEN),
      secret: stringifyEnvValue(env.DINGTALK_SECRET)
    };
  }

  if (channel === 'wecom' || channel === 'wechat-work') {
    return {
      ...retryConfig,
      key: stringifyEnvValue(env.WECOM_KEY),
      maxBytes: Number.parseInt(env.WECOM_MAX_BYTES || '', 10) || undefined
    };
  }

  if (channel === 'whatsapp') {
    return {
      ...retryConfig,
      accessToken: stringifyEnvValue(env.WHATSAPP_ACCESS_TOKEN),
      phoneNumberId: stringifyEnvValue(env.WHATSAPP_PHONE_NUMBER_ID),
      recipientPhone: stringifyEnvValue(env.WHATSAPP_RECIPIENT_PHONE),
      maxChars: Number.parseInt(env.WHATSAPP_MAX_CHARS || '', 10) || undefined
    };
  }

  return retryConfig;
}

async function sendEmailViaResend(payload, emailConfig, config) {
  ensureValue(emailConfig.resendApiKey, 'resendApiKey');
  ensureValue(emailConfig.from, 'from');
  if (emailConfig.to.length === 0) {
    throw new Error('Missing required config: to');
  }

  const requestBody = {
    from: emailConfig.from,
    to: emailConfig.to,
    subject: payload.subject,
    html: payload.html || undefined,
    text: payload.text || undefined
  };

  if (config.dryRun) {
    return buildResult({
      success: true,
      channel: 'email',
      response: {
        dryRun: true,
        mode: 'resend',
        payload: requestBody
      }
    });
  }

  const retryOptions = normalizeRetryOptions(config);
  const result = await retry(async () => {
    const res = await postJSON('https://api.resend.com/emails', requestBody, {
      Authorization: `Bearer ${emailConfig.resendApiKey}`
    });
    if (!res.ok) throw new Error(`Resend HTTP ${res.statusCode}`);
    if (!res.response?.id) throw new Error('Resend response missing id');
    return res;
  }, retryOptions);

  return buildResult({
    success: true,
    channel: 'email',
    statusCode: result.statusCode,
    response: result.response,
    details: { mode: 'resend' }
  });
}

async function sendEmailViaSmtp(payload, emailConfig, config) {
  ensureValue(emailConfig.smtpHost, 'smtpHost');
  ensureValue(emailConfig.smtpPort, 'smtpPort');
  ensureValue(emailConfig.smtpUser, 'smtpUser');
  ensureValue(emailConfig.smtpPass, 'smtpPass');
  ensureValue(emailConfig.from, 'from');
  if (emailConfig.to.length === 0) {
    throw new Error('Missing required config: to');
  }

  const message = {
    from: emailConfig.from,
    to: emailConfig.to.join(', '),
    subject: payload.subject,
    html: payload.html || undefined,
    text: payload.text || undefined
  };

  if (config.dryRun) {
    return buildResult({
      success: true,
      channel: 'email',
      response: {
        dryRun: true,
        mode: 'smtp',
        payload: {
          transport: {
            host: emailConfig.smtpHost,
            port: emailConfig.smtpPort,
            secure: emailConfig.smtpSecure,
            user: emailConfig.smtpUser
          },
          message
        }
      }
    });
  }

  let nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch (error) {
    throw new Error('SMTP mode requires nodemailer. Install it with: npm install nodemailer');
  }

  const retryOptions = normalizeRetryOptions(config);
  const transport = nodemailer.createTransport({
    host: emailConfig.smtpHost,
    port: emailConfig.smtpPort,
    secure: emailConfig.smtpSecure,
    auth: {
      user: emailConfig.smtpUser,
      pass: emailConfig.smtpPass
    }
  });

  const info = await retry(async () => transport.sendMail(message), retryOptions);
  return buildResult({
    success: true,
    channel: 'email',
    response: {
      messageId: info.messageId || null,
      accepted: info.accepted || [],
      rejected: info.rejected || []
    },
    details: { mode: 'smtp' }
  });
}

async function sendEmail(formattedData, config = {}) {
  try {
    const payload = ensureEmailPayload(formattedData);
    const emailConfig = normalizeEmailConfig(config);
    const mode = detectEmailMode(emailConfig);
    if (!mode) {
      throw new Error('Email mode not detected. Provide RESEND_API_KEY or SMTP_HOST (or set mode)');
    }

    if (mode === 'resend') {
      return sendEmailViaResend(payload, emailConfig, config);
    }

    return sendEmailViaSmtp(payload, emailConfig, config);
  } catch (error) {
    return buildResult({ success: false, channel: 'email', error });
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
    case 'email':
      return sendEmail(formattedData, config);
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

async function runCli() {
  try {
    loadEnvFromDefaultFiles();
    const args = parseCliArgs(process.argv.slice(2));
    const input = args.input || args.i;
    const channel = args.channel || args.c;

    if (!input) {
      throw new Error('Missing required argument: --input <formatted-json-file>');
    }

    if (!channel) {
      throw new Error('Missing required argument: --channel <email|feishu|dingtalk|wecom|whatsapp>');
    }

    const formattedData = readJsonFile(path.resolve(process.cwd(), input));
    const config = {
      ...buildConfigFromEnv(channel),
      dryRun: Boolean(args.dryRun || args['dry-run'])
    };

    const result = await main({
      params: {
        formattedData,
        channel,
        config
      }
    });

    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.success) {
      process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(`${error.message || String(error)}\n`);
    process.exitCode = 1;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    main,
    postJSON,
    retry,
    parseCliArgs,
    buildConfigFromEnv,
    splitByBytes,
    splitByChars,
    resolveWecomMessages,
    sendEmail,
    sendToFeishu,
    sendToDingtalk,
    sendToWecom,
    sendToWhatsApp
  };
}

if (typeof exports !== 'undefined') {
  exports.main = main;
}

if (require.main === module) {
  runCli();
}
