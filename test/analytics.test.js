import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openStore } from '../server/db.js';
import { saveActivity, saveDiary, saveGoal, saveObservation } from '../server/records.js';
import { getDashboard } from '../server/analytics.js';

test('dashboard counts distinct activity types per day and keeps goal evidence', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'journal-analytics-'));
  const store = openStore(dir);
  try {
    const db = store.db;
    saveActivity(db, { categoryId: 'sports', occurredAt: '2026-10-12T09:00:00+08:00', localDate: '2026-10-12', note: '骑车' });
    saveActivity(db, { categoryId: 'sports', occurredAt: '2026-10-12T10:00:00+08:00', localDate: '2026-10-12', note: '跑步' });
    saveActivity(db, { categoryId: 'english', occurredAt: '2026-10-12T11:00:00+08:00', localDate: '2026-10-12', note: '说出 apple' });
    saveDiary(db, { localDate: '2026-10-12', text: '今天尝试新活动。' });
    const first = saveGoal(db, { title: '绕过障碍', dimension: '大动作', categoryId: 'sports' });
    saveGoal(db, { title: '连续跳五次', dimension: '大动作', categoryId: 'sports' });
    saveObservation(db, { goalId: first.id, status: 'trying', observedAt: '2026-10-01' });
    saveObservation(db, { goalId: first.id, status: 'independent', observedAt: '2026-10-12' });
    const dashboard = getDashboard(db, { from: '2026-10-12', to: '2026-10-13' });
    assert.deepEqual(dashboard.heatmap.map(x => x.variety), [2, 0]);
    assert.deepEqual(dashboard.totals, { activities: 3, diaries: 1, recordedDays: 1 });
    assert.deepEqual(dashboard.dimensions.find(x => x.name === '大动作'), { name: '大动作', independent: 1, total: 2, ratio: 0.5, progressRatio: 0.5 });
    assert.equal(dashboard.goals.find(x => x.id === first.id).status, 'independent');
    assert.equal(dashboard.categories.find(x => x.id === 'sports').count, 2);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('dimensions with no documented goals have no ratio', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'journal-analytics-'));
  const store = openStore(dir);
  try {
    const dashboard = getDashboard(store.db, { from: '2026-10-12', to: '2026-10-12' });
    assert.equal(dashboard.dimensions.find(x => x.name === '艺术感知').ratio, null);
    assert.equal(dashboard.dimensions.find(x => x.name === '艺术感知').progressRatio, null);
    assert.equal(dashboard.totals.recordedDays, 0);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
