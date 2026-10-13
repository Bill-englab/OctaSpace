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
const dimensionIds = ['de', 'zhi', 'ti', 'mei', 'lao'];
function structuredReport(recordIds = []) {
  return {
    summary: { judgement: '示例判断', priority: '先关注主动表达' },
    familyPlan: { strengths: '交流环境丰富', adjustment: '多给孩子自主表达机会', recordIds, profileFields: ['focus'] },
    dimensions: dimensionIds.map(id => ({ id, status: id === 'zhi' ? 'supported' : 'unknown', verdict: `${id}领域观察`, ageContext: '四岁阶段可在游戏中观察', known: id === 'zhi' ? '已有记录' : '尚未了解', gap: '继续了解与家庭目标的关系', question: '平时会怎样表现？', recordIds, profileFields: ['baseline'], referenceIds: ['zhi-talk', 'made-up-reference'] })),
    gaps: [{ title: '表达机会', explanation: '需要观察孩子是否主动说', recordIds }],
    actions: [{ title: '游戏中对话', why: '贴近家庭目标', activity: '玩积木时轮流讲故事', guidance: '等待孩子开口', signal: '孩子主动解释', alternative: '换成喜欢的游戏', recordIds }],
    followUpQuestions: ['孩子会主动讲一件事吗？'],
    limits: '资料不足的维度暂不判断'
  };
}

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

test('chat waits for a reasoning MaaS response that takes longer than one minute', () => setup(async db => {
  const originalTimeout = AbortSignal.timeout;
  AbortSignal.timeout = ms => {
    const controller = new AbortController();
    if (ms <= 60000) setTimeout(() => controller.abort(new DOMException('virtual minute elapsed', 'TimeoutError')), 5);
    return controller.signal;
  };
  try {
    const fetchImpl = async (_url, options) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answer: '可询问同伴互动。', sourceIds: [] }) } }] }), { status: 200 })), 15);
      options.signal.addEventListener('abort', () => { clearTimeout(timer); reject(options.signal.reason); }, { once: true });
    });
    const reply = await askChildQuestion(db, config, { question: '家长会该问什么？', today: '2026-10-13' }, fetchImpl);
    assert.equal(reply.content, '可询问同伴互动。');
    assert.equal(listChatMessages(db, reply.sessionId).at(-1).role, 'assistant');
  } finally { AbortSignal.timeout = originalTimeout; }
}));

test('chat leaves enough output tokens for a reasoning model to produce a visible answer', () => setup(async db => {
  const fetchImpl = async (_url, options) => {
    const { max_tokens: budget } = JSON.parse(options.body);
    const choice = budget < 8000
      ? { finish_reason: 'length', message: { content: '' } }
      : { finish_reason: 'stop', message: { content: JSON.stringify({ answer: '先询问孩子在园里的兴趣。', sourceIds: [] }) } };
    return new Response(JSON.stringify({ choices: [choice] }), { status: 200 });
  };
  const reply = await askChildQuestion(db, config, { question: '家长会该问什么？', today: '2026-10-13' }, fetchImpl);
  assert.equal(reply.content, '先询问孩子在园里的兴趣。');
}));

test('chat can compress more than sixty records with a slow reasoning MaaS', () => setup(async db => {
  for (let index = 0; index < 61; index++) {
    saveActivity(db, { categoryId: 'english', occurredAt: `2026-10-12T11:${String(index % 60).padStart(2, '0')}:00+08:00`, localDate: '2026-10-12', note: `活动${index}` });
  }
  const originalTimeout = AbortSignal.timeout;
  AbortSignal.timeout = ms => {
    const controller = new AbortController();
    if (ms <= 60000) setTimeout(() => controller.abort(new DOMException('virtual minute elapsed', 'TimeoutError')), 5);
    return controller.signal;
  };
  try {
    const fetchImpl = async (_url, options) => new Promise((resolve, reject) => {
      const body = JSON.parse(options.body);
      const isSummary = body.messages[0].content.startsWith('请压缩家庭记录');
      const choice = isSummary && body.max_tokens < 8000
        ? { finish_reason: 'length', message: { content: '' } }
        : { finish_reason: 'stop', message: { content: isSummary ? '保留日期和事实的摘要' : JSON.stringify({ answer: '可以观察主动表达。', sourceIds: [] }) } };
      const timer = setTimeout(() => resolve(new Response(JSON.stringify({ choices: [choice] }), { status: 200 })), 15);
      options.signal.addEventListener('abort', () => { clearTimeout(timer); reject(options.signal.reason); }, { once: true });
    });
    const reply = await askChildQuestion(db, config, { question: '有哪些变化？', today: '2026-10-13' }, fetchImpl);
    assert.equal(reply.content, '可以观察主动表达。');
  } finally { AbortSignal.timeout = originalTimeout; }
}));

test('evaluation is saved as a stable on-demand report with range and sources', () => setup(async db => {
  const activity = saveActivity(db, { categoryId: 'english', occurredAt: '2026-10-12T11:00:00+08:00', localDate: '2026-10-12', note: '主动说完整句子' });
  db.prepare('UPDATE child_profile SET birthday=?,focus=? WHERE id=1').run('2022-09-25', '主动表达');
  let sent;
  const fetchImpl = async (_url, options) => {
    sent = JSON.parse(options.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(structuredReport([activity.id, 'fabricated'])) } }] }), { status: 200 });
  };
  const report = await generateEvaluation(db, config, { from: '2026-10-01', to: '2026-10-30' }, fetchImpl);
  assert.deepEqual(report.sources, [activity.id]);
  assert.equal(report.coverage.comparison.from, '2026-09-01');
  assert.equal(listEvaluations(db).length, 1);
  assert.equal(listEvaluations(db)[0].content, report.content);
  assert.equal(report.report.dimensions.length, 5);
  assert.equal(report.report.dimensions[0].referenceIds.includes('made-up-reference'), false);
  assert.equal(report.referenceVersion, 'four-years-2026-10');
  assert.equal(report.report.ageLabel, '4岁1个月');
  assert.ok(report.report.references.some(item => item.id === 'zhi-talk'));
  assert.match(sent.messages[0].content, /未记录不等于没做/);
  assert.match(sent.messages[0].content, /家庭目标/);
  assert.match(sent.messages[0].content, /四岁阶段/);
  assert.match(sent.messages[0].content, /攀爬、悬吊.*成人看护/);
}));

test('failed MaaS call keeps the user question but saves no report', () => setup(async db => {
  saveActivity(db, { categoryId: 'sports', occurredAt: '2026-10-12T16:20:00+08:00', localDate: '2026-10-12', note: '骑车' });
  db.prepare('UPDATE child_profile SET birthday=? WHERE id=1').run('2022-09-25');
  const fetchImpl = async () => new Response('{}', { status: 429 });
  await assert.rejects(askChildQuestion(db, config, { question: '本周如何？', today: '2026-10-12' }, fetchImpl), /频繁/);
  const row = db.prepare('SELECT status FROM chat_messages WHERE role=?').get('user');
  assert.equal(row.status, 'failed');
  await assert.rejects(generateEvaluation(db, config, { from: '2026-10-01', to: '2026-10-30' }, fetchImpl), /频繁/);
  assert.equal(listEvaluations(db).length, 0);
}));

test('evaluation allows a longer response and enough output for a reasoning model', () => setup(async db => {
  saveActivity(db, { categoryId: 'english', occurredAt: '2026-10-12T11:00:00+08:00', localDate: '2026-10-12', note: '主动说完整句子' });
  db.prepare('UPDATE child_profile SET birthday=? WHERE id=1').run('2022-09-25');
  const original = AbortSignal.timeout;
  let requestedTimeout;
  let requestedTokens;
  AbortSignal.timeout = ms => { requestedTimeout = ms; return new AbortController().signal; };
  try {
    const fetchImpl = async (_url, options) => {
      requestedTokens = JSON.parse(options.body).max_tokens;
      return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(structuredReport()) } }] }), { status: 200 });
    };
    await generateEvaluation(db, config, { from: '2026-10-01', to: '2026-10-30' }, fetchImpl);
    assert.ok(requestedTimeout >= 180000);
    assert.ok(requestedTokens >= 20000);
  } finally { AbortSignal.timeout = original; }
}));

test('evaluation does not save an incomplete JSON response', () => setup(async db => {
  saveActivity(db, { categoryId: 'sports', occurredAt: '2026-10-12T16:20:00+08:00', localDate: '2026-10-12', note: '骑车' });
  db.prepare('UPDATE child_profile SET birthday=? WHERE id=1').run('2022-09-25');
  const fetchImpl = async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"answer":"【当前观察】（基于' } }] }), { status: 200 });
  await assert.rejects(generateEvaluation(db, config, { from: '2026-10-01', to: '2026-10-30' }, fetchImpl), /截断|不完整/);
  assert.equal(listEvaluations(db).length, 0);
}));

test('evaluation can use family baseline without requiring selected-period records', () => setup(async db => {
  db.prepare('UPDATE child_profile SET birthday=?,baseline=?,focus=? WHERE id=1').run('2022-09-25', '喜欢搭积木', '解决问题');
  const fetchImpl = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(structuredReport()) } }] }), { status: 200 });
  const evaluation = await generateEvaluation(db, config, { from: '2026-10-01', to: '2026-10-13' }, fetchImpl);
  assert.equal(evaluation.coverage.recordCount, 0);
  assert.equal(evaluation.report.summary.judgement, '示例判断');
}));

test('evaluation rejects a report missing a developmental dimension', () => setup(async db => {
  db.prepare('UPDATE child_profile SET birthday=?,focus=? WHERE id=1').run('2022-09-25', '运动');
  const response = structuredReport(); response.dimensions.pop();
  const fetchImpl = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(response) } }] }), { status: 200 });
  await assert.rejects(generateEvaluation(db, config, { from: '2026-10-01', to: '2026-10-13' }, fetchImpl), /五个维度|格式/);
  assert.equal(listEvaluations(db).length, 0);
}));

test('older plain-text evaluations remain readable', () => setup(async db => {
  db.prepare('INSERT INTO evaluations(id,from_date,to_date,content,model,created_at) VALUES (?,?,?,?,?,?)')
    .run('legacy', '2026-09-01', '2026-09-30', '旧版原文', 'demo', '2026-10-01T00:00:00Z');
  const older = listEvaluations(db)[0];
  assert.equal(older.content, '旧版原文');
  assert.equal(older.report, null);
}));

test('evaluation rejects missing records used as the reason for a cultivation gap', () => setup(async db => {
  db.prepare('UPDATE child_profile SET birthday=?,focus=? WHERE id=1').run('2022-09-25', '音乐');
  const response = structuredReport();
  response.summary.judgement = '音乐没有记录，说明培养投入不足';
  const fetchImpl = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(response) } }] }), { status: 200 });
  await assert.rejects(generateEvaluation(db, config, { from: '2026-10-01', to: '2026-10-13' }, fetchImpl), /未记录|记录缺失/);
  assert.equal(listEvaluations(db).length, 0);
}));
