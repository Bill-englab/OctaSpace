import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../server/index.js';

async function withApi(run, fetchImpl) {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'journal-api-'));
  const app = createApp({ dataDir, fetchImpl });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const request = async (url, method = 'GET', body) => {
    const response = await fetch(`${base}${url}`, {
      method, headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: response.status, data: await response.json() };
  };
  try { return await run({ base, request }); }
  finally { await app.close(); await rm(dataDir, { recursive: true, force: true }); }
}

test('activity, diary and progress can be created and read through the API', () => withApi(async ({ request }) => {
  const categories = await request('/api/categories');
  assert.equal(categories.status, 200);
  assert.equal(categories.data.some(x => x.id === 'sports'), true);
  const projects = await request('/api/projects?categoryId=english');
  assert.deepEqual(projects.data.map(x => x.name), ['RAZ', '口语']);
  const project = await request('/api/projects', 'POST', { categoryId: 'sports', name: '骑行' });
  assert.equal(project.status, 201);
  const activity = await request('/api/activities', 'POST', {
    categoryId: 'sports', projectId: project.data.id, occurredAt: '2026-10-12T16:20:00+08:00', localDate: '2026-10-12', note: '绕过障碍'
  });
  assert.equal(activity.status, 201);
  assert.equal(activity.data.projectName, '骑行');
  const edited = await request(`/api/activities/${activity.data.id}`, 'PUT', { note: '独立绕过障碍' });
  assert.equal(edited.data.note, '独立绕过障碍');
  const source = await request(`/api/sources/${activity.data.id}`);
  assert.equal(source.data.note, '独立绕过障碍');
  const timeline = await request('/api/activities?from=2026-10-12&to=2026-10-12');
  assert.equal(timeline.data.length, 1);
  const diary = await request('/api/diaries', 'POST', { localDate: '2026-10-12', text: '今天很开心。', activityIds: [activity.data.id] });
  assert.equal(diary.status, 201);
  assert.deepEqual((await request('/api/diaries?from=2026-10-12&to=2026-10-12')).data[0].activityIds, [activity.data.id]);
  const goal = await request('/api/goals', 'POST', { title: '平衡车绕障碍', dimension: '大动作', categoryId: 'sports' });
  const observation = await request('/api/observations', 'POST', { goalId: goal.data.id, status: 'independent', observedAt: '2026-10-12', activityId: activity.data.id });
  assert.equal(observation.status, 201);
  assert.equal((await request('/api/goals')).data[0].observations[0].status, 'independent');
  const backup = await request('/api/backup');
  assert.equal(backup.data.tables.activities.length, 1);
  assert.equal(backup.data.tables.diary_entries.length, 1);
  assert.equal((await request('/api/backup', 'PUT', backup.data)).status, 200);
}));

test('MaaS config, independent chat and on-demand evaluation are exposed through the API', () => {
  let modelCalls = 0;
  const fetchImpl = async () => {
    modelCalls++;
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answer: '基于记录，正在尝试新活动。', sourceIds: [] }) } }] }), { status: 200 });
  };
  return withApi(async ({ request }) => {
    const config = await request('/api/maas-config', 'PUT', { format: 'openai', baseUrl: 'https://maas.example/v1', model: 'demo', apiKey: 'secret' });
    assert.equal(config.status, 200);
    assert.equal(config.data.hasKey, true);
    assert.equal(JSON.stringify((await request('/api/maas-config')).data).includes('secret'), false);
    await request('/api/activities', 'POST', { categoryId: 'sports', occurredAt: '2026-10-12T16:20:00+08:00', localDate: '2026-10-12', note: '骑车' });
    const chat = await request('/api/chat', 'POST', { question: '今天怎么样？', today: '2026-10-12' });
    assert.equal(chat.status, 200);
    assert.equal((await request(`/api/chat-sessions/${chat.data.sessionId}/messages`)).data.length, 2);
    assert.equal((await request('/api/evaluations')).data.length, 0);
    const report = await request('/api/evaluations', 'POST', { from: '2026-10-01', to: '2026-10-30' });
    assert.equal(report.status, 201);
    assert.equal((await request('/api/evaluations')).data.length, 1);
    assert.equal(modelCalls, 2);
  }, fetchImpl);
});

test('media endpoints are unavailable after removing the gallery', () => withApi(async ({ base, request }) => {
  const activity = await request('/api/activities', 'POST', {
    categoryId: 'sports', occurredAt: '2026-10-12T16:20:00+08:00', localDate: '2026-10-12', note: '骑车'
  });
  assert.equal(activity.status, 201);
  const upload = await fetch(`${base}/api/media?activityId=${activity.data.id}`, {
    method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: new Uint8Array([0xff, 0xd8, 0xff, 0xd9])
  });
  assert.equal(upload.status, 404);
  assert.equal((await request('/api/media')).status, 404);
  assert.equal((await request('/api/media/unknown')).status, 404);
  assert.equal((await request('/api/media/unknown', 'DELETE')).status, 404);
}));
