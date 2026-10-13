import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openStore } from '../server/db.js';
import { saveActivity } from '../server/records.js';
import { askChildQuestion, generateEvaluation, listChatMessages, listEvaluations } from '../server/ai.js';

async function setup(run) {
  const dir = await mkdtemp(path.join(tmpdir(), 'journal-ai-'));
  const store = openStore(dir);
  try { return await run(store.db); }
  finally { store.close(); await rm(dir, { recursive: true, force: true }); }
}

const config = { format: 'openai', baseUrl: 'https://maas.example/v1', model: 'demo', apiKey: 'secret' };

test('chat uses selected records and links only real source IDs', () => setup(async db => {
  const activity = saveActivity(db, { categoryId: 'sports', occurredAt: '2026-10-12T16:20:00+08:00', localDate: '2026-10-12', note: '独立绕过障碍' });
  let sent;
  const fetchImpl = async (_url, options) => {
    sent = JSON.parse(options.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answer: '最近愿意反复尝试。', sourceIds: [activity.id, 'fabricated'] }) } }] }), { status: 200 });
  };
  const reply = await askChildQuestion(db, config, { question: '最近一周的体育表现？', today: '2026-10-12' }, fetchImpl);
  assert.deepEqual(reply.sources, [activity.id]);
  assert.equal(reply.coverage.recordCount, 1);
  assert.match(sent.messages[0].content, /独立绕过障碍/);
  assert.deepEqual(listChatMessages(db, reply.sessionId).map(x => x.role), ['user', 'assistant']);
}));

test('evaluation is saved as a stable on-demand report with range and sources', () => setup(async db => {
  const activity = saveActivity(db, { categoryId: 'english', occurredAt: '2026-10-12T11:00:00+08:00', localDate: '2026-10-12', note: '主动说完整句子' });
  const fetchImpl = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answer: '语言表达有新尝试。下周继续观察主动表达。', sourceIds: [activity.id] }) } }] }), { status: 200 });
  const report = await generateEvaluation(db, config, { from: '2026-10-01', to: '2026-10-30' }, fetchImpl);
  assert.deepEqual(report.sources, [activity.id]);
  assert.equal(report.coverage.comparison.from, '2026-09-01');
  assert.equal(listEvaluations(db).length, 1);
  assert.equal(listEvaluations(db)[0].content, report.content);
}));

test('failed MaaS call keeps the user question but saves no report', () => setup(async db => {
  saveActivity(db, { categoryId: 'sports', occurredAt: '2026-10-12T16:20:00+08:00', localDate: '2026-10-12', note: '骑车' });
  const fetchImpl = async () => new Response('{}', { status: 429 });
  await assert.rejects(askChildQuestion(db, config, { question: '本周如何？', today: '2026-10-12' }, fetchImpl), /频繁/);
  const row = db.prepare('SELECT status FROM chat_messages WHERE role=?').get('user');
  assert.equal(row.status, 'failed');
  await assert.rejects(generateEvaluation(db, config, { from: '2026-10-01', to: '2026-10-30' }, fetchImpl), /频繁/);
  assert.equal(listEvaluations(db).length, 0);
}));

test('evaluation allows a longer response and enough output for a reasoning model', () => setup(async db => {
  saveActivity(db, { categoryId: 'english', occurredAt: '2026-10-12T11:00:00+08:00', localDate: '2026-10-12', note: '主动说完整句子' });
  const original = AbortSignal.timeout;
  let requestedTimeout;
  let requestedTokens;
  AbortSignal.timeout = ms => { requestedTimeout = ms; return new AbortController().signal; };
  try {
    const fetchImpl = async (_url, options) => {
      requestedTokens = JSON.parse(options.body).max_tokens;
      return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: '{"answer":"观察完成","sourceIds":[]}' } }] }), { status: 200 });
    };
    await generateEvaluation(db, config, { from: '2026-10-01', to: '2026-10-30' }, fetchImpl);
    assert.ok(requestedTimeout >= 180000);
    assert.ok(requestedTokens >= 6000);
  } finally { AbortSignal.timeout = original; }
}));

test('evaluation does not save an incomplete JSON response', () => setup(async db => {
  saveActivity(db, { categoryId: 'sports', occurredAt: '2026-10-12T16:20:00+08:00', localDate: '2026-10-12', note: '骑车' });
  const fetchImpl = async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"answer":"【当前观察】（基于' } }] }), { status: 200 });
  await assert.rejects(generateEvaluation(db, config, { from: '2026-10-01', to: '2026-10-30' }, fetchImpl), /截断|不完整/);
  assert.equal(listEvaluations(db).length, 0);
}));
