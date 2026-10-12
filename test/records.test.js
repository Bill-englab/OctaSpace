import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openStore } from '../server/db.js';
import {
  listCategories, saveCategory, listProjects, saveProject, saveActivity, updateActivity, deleteActivity, listTimeline,
  saveDiary, listDiaries, saveGoal, listGoals, saveObservation
} from '../server/records.js';

async function withStore(run) {
  const dir = await mkdtemp(path.join(tmpdir(), 'journal-records-'));
  const store = openStore(dir);
  try { return await run(store.db); }
  finally { store.close(); await rm(dir, { recursive: true, force: true }); }
}

test('categories include presets and can be extended', () => withStore(db => {
  assert.equal(listCategories(db).some(x => x.name === '英语'), true);
  const custom = saveCategory(db, { name: '烹饪', dimension: '日常生活', color: '#789456' });
  assert.equal(listCategories(db).find(x => x.id === custom.id).name, '烹饪');
}));

test('projects belong to an activity category and can be selected for records', () => withStore(db => {
  assert.deepEqual(listProjects(db, 'english').map(x => x.name), ['RAZ', '口语']);
  const project = saveProject(db, { categoryId: 'english', name: '自然拼读' });
  const activity = saveActivity(db, {
    categoryId: 'english', projectId: project.id, occurredAt: '2026-10-12T09:00:00+08:00',
    localDate: '2026-10-12', note: '读完一页'
  });
  assert.equal(activity.projectName, '自然拼读');
  assert.equal(listTimeline(db, { from: '2026-10-12', to: '2026-10-12' })[0].projectId, project.id);
  assert.throws(() => saveActivity(db, {
    categoryId: 'sports', projectId: project.id, occurredAt: '2026-10-12T10:00:00+08:00',
    localDate: '2026-10-12', note: '不应关联英语项目'
  }), /项目/);
}));

test('activities list newest first within an inclusive local date range', () => withStore(db => {
  saveActivity(db, { categoryId: 'english', occurredAt: '2026-10-12T09:00:00+08:00', localDate: '2026-10-12', note: 'morning' });
  const later = saveActivity(db, { categoryId: 'sports', occurredAt: '2026-10-12T16:20:00+08:00', localDate: '2026-10-12', note: 'afternoon' });
  saveActivity(db, { categoryId: 'music', occurredAt: '2026-10-13T09:00:00+08:00', localDate: '2026-10-13', note: 'next day' });
  assert.deepEqual(listTimeline(db, { from: '2026-10-12', to: '2026-10-12' }).map(x => x.note), ['afternoon', 'morning']);
  updateActivity(db, later.id, { note: 'rode around cones' });
  assert.equal(listTimeline(db, { from: '2026-10-12', to: '2026-10-12', categoryId: 'sports' })[0].note, 'rode around cones');
  deleteActivity(db, later.id);
  assert.equal(listTimeline(db, { from: '2026-10-12', to: '2026-10-12' }).length, 1);
}));

test('multiple diary entries can link to activities on the same date', () => withStore(db => {
  const activity = saveActivity(db, { categoryId: 'english', occurredAt: '2026-10-12T11:00:00+08:00', localDate: '2026-10-12', note: 'said apple' });
  const diary = saveDiary(db, { localDate: '2026-10-12', text: 'Today she said apple.', activityIds: [activity.id] });
  saveDiary(db, { localDate: '2026-10-12', text: 'She looked happy.' });
  const entries = listDiaries(db, { from: '2026-10-12', to: '2026-10-12' });
  assert.equal(entries.length, 2);
  assert.deepEqual(entries.find(x => x.id === diary.id).activityIds, [activity.id]);
}));

test('goal observations preserve progress history and reject unknown statuses', () => withStore(db => {
  const goal = saveGoal(db, { title: '绕过障碍', dimension: '大动作', categoryId: 'sports' });
  saveObservation(db, { goalId: goal.id, status: 'trying', observedAt: '2026-10-01', note: 'needed help' });
  const latest = saveObservation(db, { goalId: goal.id, status: 'independent', observedAt: '2026-10-12', note: 'rode around cones' });
  assert.equal(latest.status, 'independent');
  assert.deepEqual(listGoals(db)[0].observations.map(x => x.status), ['trying', 'independent']);
  assert.throws(() => saveObservation(db, { goalId: goal.id, status: 'expert', observedAt: '2026-10-13' }), /状态/);
}));
