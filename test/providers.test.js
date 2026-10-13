import test from 'node:test';
import assert from 'node:assert/strict';
import { sendModel } from '../server/providers.js';

test('OpenAI-compatible adapter sends messages and reads a choice', async () => {
  let call;
  const fetchImpl = async (url, options) => {
    call = { url, headers: options.headers, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({ choices: [{ message: { content: '有进步' } }] }), { status: 200 });
  };
  const answer = await sendModel({ format: 'openai', baseUrl: 'https://maas.example/v1', model: 'demo', apiKey: 'secret' },
    { system: '只根据记录回答', messages: [{ role: 'user', content: '这周如何？' }], maxTokens: 1000 }, fetchImpl);
  assert.equal(answer, '有进步');
  assert.equal(call.url, 'https://maas.example/v1/chat/completions');
  assert.equal(call.headers.authorization, 'Bearer secret');
  assert.equal(call.body.messages[0].role, 'system');
});

test('Anthropic adapter puts system outside messages and reads text blocks', async () => {
  let call;
  const fetchImpl = async (url, options) => {
    call = { url, headers: options.headers, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({ content: [{ type: 'text', text: '建议多观察' }] }), { status: 200 });
  };
  const answer = await sendModel({ format: 'anthropic', baseUrl: 'https://maas.example', model: 'demo', apiKey: 'secret' },
    { system: '只根据记录回答', messages: [{ role: 'user', content: '这周如何？' }], maxTokens: 1000 }, fetchImpl);
  assert.equal(answer, '建议多观察');
  assert.equal(call.url, 'https://maas.example/v1/messages');
  assert.equal(call.headers['x-api-key'], 'secret');
  assert.equal(call.body.system, '只根据记录回答');
  assert.equal(call.body.messages[0].role, 'user');
});

test('OpenAI-compatible gateway may return Anthropic-style content blocks', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({
    type: 'message', content: [{ type: 'thinking', thinking: 'private reasoning' }, { type: 'text', text: '连接成功' }]
  }), { status: 200 });
  const answer = await sendModel({ format: 'openai', baseUrl: 'https://maas.example/compatible', model: 'demo', apiKey: 'secret' },
    { system: 'test', messages: [{ role: 'user', content: 'test' }] }, fetchImpl);
  assert.equal(answer, '连接成功');
});

test('provider failures report status without exposing credentials', async () => {
  const fetchImpl = async () => new Response('{"error":"bad key"}', { status: 401 });
  await assert.rejects(sendModel({ format: 'openai', baseUrl: 'https://maas.example/v1', model: 'demo', apiKey: 'secret' },
    { system: 'test', messages: [{ role: 'user', content: 'test' }] }, fetchImpl), error => {
    assert.equal(error.status, 401);
    assert.equal(error.message.includes('secret'), false);
    return true;
  });
});

test('provider rejects a response cut off by the output limit', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ choices: [{
    finish_reason: 'length', message: { content: '{"answer":"未完成' }
  }] }), { status: 200 });
  await assert.rejects(sendModel({ format: 'openai', baseUrl: 'https://maas.example/v1', model: 'demo', apiKey: 'secret' },
    { system: 'test', messages: [{ role: 'user', content: 'test' }] }, fetchImpl), /截断|输出上限/);
});

test('provider accepts a longer task-specific timeout', async () => {
  const original = AbortSignal.timeout;
  let requestedTimeout;
  AbortSignal.timeout = ms => { requestedTimeout = ms; return new AbortController().signal; };
  try {
    const fetchImpl = async () => new Response(JSON.stringify({ choices: [{ message: { content: '完成' } }] }), { status: 200 });
    await sendModel({ format: 'openai', baseUrl: 'https://maas.example/v1', model: 'demo', apiKey: 'secret' },
      { system: 'test', messages: [{ role: 'user', content: 'test' }], timeoutMs: 300000 }, fetchImpl);
    assert.equal(requestedTimeout, 300000);
  } finally { AbortSignal.timeout = original; }
});
