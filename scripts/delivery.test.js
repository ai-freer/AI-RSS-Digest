const assert = require('assert');
const { resolveWecomMessages, sendToFeishu } = require('./delivery');

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

async function run() {
  await testWecomByteSplit();
  await testFeishuRetryOnBusinessError();
  console.log('delivery tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
