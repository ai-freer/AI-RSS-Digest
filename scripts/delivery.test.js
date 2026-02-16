const assert = require('assert');
const { resolveWecomMessages, sendToFeishu, sendEmail, parseCliArgs, buildConfigFromEnv } = require('./delivery');

async function testWecomByteSplit() {
  const source = {
    chunks: [
      '你'.repeat(1000), // 约 3000 bytes
    ]
  };

  const messages = resolveWecomMessages(source, 2048);
  assert.ok(messages.length >= 2, 'should split oversized chinese chunk');
  messages.forEach((msg) => {
    assert.ok(Buffer.byteLength(msg, 'utf8') <= 2048, 'each chunk must be <= 2048 bytes');
  });
}

async function testFeishuRetryOnBusinessError() {
  let calls = 0;
  const originalFetch = global.fetch;

  global.fetch = async () => {
    calls += 1;
    if (calls < 3) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ code: 99991663, msg: 'temporary failure' })
      };
    }

    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ code: 0, msg: 'ok' })
    };
  };

  try {
    const result = await sendToFeishu(
      { msg_type: 'text', content: { text: 'hello' } },
      { webhookUrl: 'https://example.test/feishu', retries: 3, baseDelayMs: 1, maxDelayMs: 2 }
    );

    assert.strictEqual(result.success, true, 'feishu should eventually succeed');
    assert.ok(calls >= 3, 'feishu should retry on non-zero business code');
  } finally {
    global.fetch = originalFetch;
  }
}

async function testEmailResendDryRun() {
  const result = await sendEmail(
    {
      subject: 'RSS Daily',
      html: '<h1>hello</h1>',
      text: 'hello'
    },
    {
      dryRun: true,
      resendApiKey: 're_test_123',
      from: 'RSS Digest <digest@example.com>',
      to: 'user@example.com'
    }
  );

  assert.strictEqual(result.success, true, 'email resend dryRun should succeed');
  assert.strictEqual(result.response.mode, 'resend', 'should detect resend mode');
  assert.strictEqual(result.response.payload.subject, 'RSS Daily', 'should keep subject');
}

async function testEmailSmtpDryRun() {
  const result = await sendEmail(
    {
      subject: 'RSS Daily SMTP',
      text: 'smtp body'
    },
    {
      dryRun: true,
      smtpHost: 'smtp.qq.com',
      smtpPort: 465,
      smtpSecure: true,
      smtpUser: 'demo@qq.com',
      smtpPass: 'app-password',
      from: 'demo@qq.com',
      to: ['user1@example.com', 'user2@example.com']
    }
  );

  assert.strictEqual(result.success, true, 'email smtp dryRun should succeed');
  assert.strictEqual(result.response.mode, 'smtp', 'should detect smtp mode');
  assert.strictEqual(result.response.payload.transport.host, 'smtp.qq.com', 'should keep smtp host');
}

async function testEmailMissingConfig() {
  const result = await sendEmail(
    {
      subject: 'RSS',
      text: 'body'
    },
    {
      dryRun: true,
      from: 'digest@example.com',
      to: 'user@example.com'
    }
  );

  assert.strictEqual(result.success, false, 'email should fail without mode detection');
  assert.ok(result.error.includes('Email mode not detected'), 'should return clear mode error');
}

async function testCliHelpers() {
  const parsed = parseCliArgs([
    '--input', 'tmp/formatted-email.json',
    '--channel', 'email',
    '--dryRun'
  ]);

  assert.strictEqual(parsed.input, 'tmp/formatted-email.json', 'input should be parsed');
  assert.strictEqual(parsed.channel, 'email', 'channel should be parsed');
  assert.strictEqual(parsed.dryRun, true, 'dryRun should be parsed as flag');

  const config = buildConfigFromEnv('email', {
    EMAIL_MODE: 'resend',
    EMAIL_TO: 'a@example.com,b@example.com',
    EMAIL_FROM: 'digest@example.com',
    RESEND_API_KEY: 're_demo_key'
  });

  assert.strictEqual(config.mode, 'resend', 'should parse email mode');
  assert.strictEqual(config.to, 'a@example.com,b@example.com', 'should parse email recipients string');
}

async function run() {
  await testWecomByteSplit();
  await testFeishuRetryOnBusinessError();
  await testEmailResendDryRun();
  await testEmailSmtpDryRun();
  await testEmailMissingConfig();
  await testCliHelpers();
  console.log('delivery tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
