import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openStore } from '../server/db.js';
import { saveActivity, saveDiary, saveGoal, saveObservation } from '../server/records.js';
import { buildContext, buildEvaluationContext, inferRange } from '../server/context.js';

test('context includes selected records and an equal-length previous period', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'journal-context-'));
  const store = openStore(dir);
  try {
    const db = store.db;
    db.prepare('UPDATE child_profile SET name=?,birthday=?,baseline=? WHERE id=1').run('小树', '2022-05-10', '喜欢搭积木');
    const earlier = saveActivity(db, { categoryId: 'english', occurredAt: '2026-09-30T10:00:00+08:00', localDate: '2026-09-30', note: '尝试说 apple' });
    const selected = saveActivity(db, { categoryId: 'english', occurredAt: '2026-10-12T10:00:00+08:00', localDate: '2026-10-12', note: '主动说 apple' });
    const diary = saveDiary(db, { localDate: '2026-10-12', occurredAt: '2026-10-12T15:45:00+08:00', text: '孩子说今天很开心。' });
    const goal = saveGoal(db, { title: '主动说完整英语句子', dimension: '语言表达', categoryId: 'english' });
    saveObservation(db, { goalId: goal.id, status: 'practicing', observedAt: '2026-10-12', note: '会主动开口' });
    const context = buildContext(db, { from: '2026-10-01', to: '2026-10-30', comparison: true });
    assert.equal(context.coverage.days, 30);
    assert.deepEqual(context.coverage.comparison, { from: '2026-09-01', to: '2026-09-30' });
    assert.equal(context.profile.name, '小树');
    assert.equal(context.profile.age, '4岁5个月');
    assert.equal(context.records.some(x => x.id === selected.id), true);
    assert.equal(context.records.find(x => x.id === selected.id).occurredAt, selected.occurredAt);
    assert.equal(context.records.find(x => x.id === diary.id).occurredAt, diary.occurredAt);
    assert.equal(context.comparisonRecords.some(x => x.id === earlier.id), true);
    assert.equal(context.sourceIds.includes(selected.id), true);
    assert.equal(context.sourceIds.includes(earlier.id), true);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('relative Chinese time expressions resolve against the local reference date', () => {
  assert.deepEqual(inferRange('总结上周的情绪', '2026-10-12'), { from: '2026-10-05', to: '2026-10-11' });
  assert.deepEqual(inferRange('最近三个月有什么变化', '2026-10-12'), { from: '2026-07-13', to: '2026-10-12' });
  assert.equal(inferRange('孩子喜欢什么？', '2026-10-12'), null);
});

test('evaluation context keeps family goals even when the selected range has no entries', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'journal-evaluation-context-'));
  const store = openStore(dir);
  try {
    const db = store.db;
    const goal = saveGoal(db, { title: '主动表达', dimension: '语言表达', categoryId: 'english' });
    saveObservation(db, { goalId: goal.id, status: 'practicing', observedAt: '2026-09-02', note: '会跟读' });
    const context = buildEvaluationContext(db, { from: '2026-10-01', to: '2026-10-13' });
    assert.equal(context.records.length, 0);
    assert.equal(context.goals[0].title, '主动表达');
    assert.equal(context.goals[0].observations[0].note, '会跟读');
  } finally { store.close(); await rm(dir, { recursive: true, force: true }); }
});
