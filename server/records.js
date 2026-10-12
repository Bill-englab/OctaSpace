import crypto from 'node:crypto';

function requiredText(value, label, max = 4000) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label}不能为空`);
  if (text.length > max) throw new Error(`${label}过长`);
  return text;
}

function localDate(value) {
  const date = String(value ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
    throw new Error('日期格式不正确');
  }
  return date;
}

function timestamp(value) {
  const stamp = String(value ?? '');
  if (!Number.isFinite(Date.parse(stamp))) throw new Error('时间格式不正确');
  return stamp;
}

function presentActivity(row) {
  return {
    id: row.id, categoryId: row.category_id, categoryName: row.category_name,
    projectId: row.project_id, projectName: row.project_name,
    categoryColor: row.category_color, occurredAt: row.occurred_at, localDate: row.local_date,
    title: row.title, note: row.note, durationMinutes: row.duration_minutes, mood: row.mood,
    details: JSON.parse(row.details_json || '{}'), createdAt: row.created_at, updatedAt: row.updated_at
  };
}

export function listCategories(db, includeArchived = false) {
  return db.prepare(`SELECT id,name,dimension,color,sort_order AS sortOrder,archived FROM categories ${includeArchived ? '' : 'WHERE archived=0'} ORDER BY sort_order,name`).all();
}

export function saveCategory(db, input) {
  const id = input.id || crypto.randomUUID();
  const name = requiredText(input.name, '分类名称', 40);
  const dimension = requiredText(input.dimension ?? name, '能力维度', 40);
  const color = /^#[0-9a-fA-F]{6}$/.test(input.color ?? '') ? input.color : '#6f9c83';
  const order = db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM categories').get().n;
  db.prepare('INSERT INTO categories(id,name,dimension,color,sort_order) VALUES (?,?,?,?,?)').run(id, name, dimension, color, order);
  return db.prepare('SELECT id,name,dimension,color,sort_order AS sortOrder,archived FROM categories WHERE id=?').get(id);
}

export function listProjects(db, categoryId) {
  return db.prepare(`SELECT id,category_id AS categoryId,name,sort_order AS sortOrder FROM projects
    WHERE archived=0 ${categoryId ? 'AND category_id=?' : ''} ORDER BY category_id,sort_order,name`).all(...(categoryId ? [categoryId] : []));
}

export function saveProject(db, input) {
  const categoryId = requiredText(input.categoryId, '活动类型', 80);
  if (!db.prepare('SELECT id FROM categories WHERE id=? AND archived=0').get(categoryId)) throw new Error('活动类型不存在');
  const name = requiredText(input.name, '项目名称', 60);
  if (db.prepare('SELECT id FROM projects WHERE category_id=? AND name=? COLLATE NOCASE').get(categoryId, name)) throw new Error('这个项目已存在');
  const id = crypto.randomUUID();
  const order = db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM projects WHERE category_id=?').get(categoryId).n;
  db.prepare('INSERT INTO projects(id,category_id,name,sort_order) VALUES (?,?,?,?)').run(id, categoryId, name, order);
  return { id, categoryId, name, sortOrder: order };
}

function projectForCategory(db, categoryId, projectId) {
  if (!projectId) return null;
  if (!db.prepare('SELECT id FROM projects WHERE id=? AND category_id=? AND archived=0').get(projectId, categoryId)) throw new Error('项目不属于所选活动类型');
  return projectId;
}

export function saveActivity(db, input) {
  const categoryId = requiredText(input.categoryId, '活动分类', 80);
  if (!db.prepare('SELECT id FROM categories WHERE id=? AND archived=0').get(categoryId)) throw new Error('活动分类不存在');
  const projectId = projectForCategory(db, categoryId, input.projectId);
  const occurredAt = timestamp(input.occurredAt);
  const date = localDate(input.localDate);
  const note = requiredText(input.note, '活动内容', 4000);
  const title = String(input.title ?? '').trim().slice(0, 120);
  const mood = String(input.mood ?? '').trim().slice(0, 80);
  const duration = input.durationMinutes === '' || input.durationMinutes == null ? null : Number(input.durationMinutes);
  if (duration !== null && (!Number.isInteger(duration) || duration < 0 || duration > 1440)) throw new Error('活动时长应在 0 到 1440 分钟之间');
  const details = input.details && typeof input.details === 'object' && !Array.isArray(input.details) ? input.details : {};
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO activities(id,category_id,project_id,occurred_at,local_date,title,note,duration_minutes,mood,details_json,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, categoryId, projectId, occurredAt, date, title, note, duration, mood, JSON.stringify(details), now, now);
  return getActivity(db, id);
}

export function getActivity(db, id) {
  const row = db.prepare(`SELECT a.*,c.name AS category_name,c.color AS category_color,p.name AS project_name FROM activities a
    JOIN categories c ON c.id=a.category_id LEFT JOIN projects p ON p.id=a.project_id WHERE a.id=?`).get(id);
  return row ? presentActivity(row) : null;
}

export function updateActivity(db, id, input) {
  const old = getActivity(db, id);
  if (!old) throw new Error('活动记录不存在');
  const merged = { ...old, ...input };
  const categoryId = requiredText(merged.categoryId, '活动分类', 80);
  if (!db.prepare('SELECT id FROM categories WHERE id=?').get(categoryId)) throw new Error('活动分类不存在');
  const projectId = projectForCategory(db, categoryId, merged.projectId);
  const occurredAt = timestamp(merged.occurredAt);
  const date = localDate(merged.localDate);
  const note = requiredText(merged.note, '活动内容', 4000);
  const duration = merged.durationMinutes === '' || merged.durationMinutes == null ? null : Number(merged.durationMinutes);
  if (duration !== null && (!Number.isInteger(duration) || duration < 0 || duration > 1440)) throw new Error('活动时长应在 0 到 1440 分钟之间');
  db.prepare(`UPDATE activities SET category_id=?,project_id=?,occurred_at=?,local_date=?,title=?,note=?,duration_minutes=?,mood=?,details_json=?,updated_at=? WHERE id=?`)
    .run(categoryId, projectId, occurredAt, date, String(merged.title ?? '').trim().slice(0, 120), note, duration,
      String(merged.mood ?? '').trim().slice(0, 80), JSON.stringify(merged.details ?? {}), new Date().toISOString(), id);
  return getActivity(db, id);
}

export function deleteActivity(db, id) {
  return db.prepare('DELETE FROM activities WHERE id=?').run(id).changes > 0;
}

export function listTimeline(db, { from, to, categoryId } = {}) {
  const start = localDate(from);
  const end = localDate(to);
  if (start > end) throw new Error('开始日期不能晚于结束日期');
  const params = categoryId ? [start, end, categoryId] : [start, end];
  const rows = db.prepare(`SELECT a.*,c.name AS category_name,c.color AS category_color,p.name AS project_name FROM activities a
    JOIN categories c ON c.id=a.category_id LEFT JOIN projects p ON p.id=a.project_id WHERE a.local_date BETWEEN ? AND ?
    ${categoryId ? 'AND a.category_id=?' : ''} ORDER BY a.occurred_at DESC,a.created_at DESC`).all(...params);
  return rows.map(presentActivity);
}

export function saveDiary(db, input) {
  const id = crypto.randomUUID();
  const date = localDate(input.localDate);
  const text = requiredText(input.text, '日记内容', 12000);
  const mood = String(input.mood ?? '').trim().slice(0, 80);
  const activityIds = [...new Set(Array.isArray(input.activityIds) ? input.activityIds : [])];
  const now = new Date().toISOString();
  db.exec('BEGIN');
  try {
    db.prepare('INSERT INTO diary_entries(id,local_date,text,mood,created_at,updated_at) VALUES (?,?,?,?,?,?)').run(id, date, text, mood, now, now);
    const link = db.prepare('INSERT INTO diary_activity_links(diary_id,activity_id) VALUES (?,?)');
    for (const activityId of activityIds) link.run(id, activityId);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  return { id, localDate: date, text, mood, activityIds, createdAt: now, updatedAt: now };
}

export function listDiaries(db, { from, to } = {}) {
  const rows = db.prepare('SELECT * FROM diary_entries WHERE local_date BETWEEN ? AND ? ORDER BY local_date DESC,created_at DESC').all(localDate(from), localDate(to));
  const links = db.prepare('SELECT activity_id FROM diary_activity_links WHERE diary_id=?');
  return rows.map(row => ({
    id: row.id, localDate: row.local_date, text: row.text, mood: row.mood,
    activityIds: links.all(row.id).map(x => x.activity_id), createdAt: row.created_at, updatedAt: row.updated_at
  }));
}

export function updateDiary(db, id, input) {
  const old = db.prepare('SELECT * FROM diary_entries WHERE id=?').get(id);
  if (!old) throw new Error('日记不存在');
  const date = localDate(input.localDate ?? old.local_date);
  const text = requiredText(input.text ?? old.text, '日记内容', 12000);
  const mood = String(input.mood ?? old.mood).trim().slice(0, 80);
  db.prepare('UPDATE diary_entries SET local_date=?,text=?,mood=?,updated_at=? WHERE id=?').run(date, text, mood, new Date().toISOString(), id);
  return listDiaries(db, { from: date, to: date }).find(x => x.id === id);
}

export function deleteDiary(db, id) { return db.prepare('DELETE FROM diary_entries WHERE id=?').run(id).changes > 0; }

export function saveGoal(db, input) {
  const id = crypto.randomUUID();
  const title = requiredText(input.title, '目标名称', 120);
  const dimension = requiredText(input.dimension, '能力维度', 40);
  const categoryId = input.categoryId || null;
  if (categoryId && !db.prepare('SELECT id FROM categories WHERE id=?').get(categoryId)) throw new Error('活动分类不存在');
  const description = String(input.description ?? '').trim().slice(0, 2000);
  const createdAt = new Date().toISOString();
  db.prepare('INSERT INTO progress_goals(id,title,dimension,category_id,description,created_at) VALUES (?,?,?,?,?,?)')
    .run(id, title, dimension, categoryId, description, createdAt);
  return { id, title, dimension, categoryId, description, createdAt, archived: 0, observations: [] };
}

export function listGoals(db, includeArchived = false) {
  const rows = db.prepare(`SELECT * FROM progress_goals ${includeArchived ? '' : 'WHERE archived=0'} ORDER BY created_at DESC`).all();
  const observations = db.prepare('SELECT * FROM progress_observations WHERE goal_id=? ORDER BY observed_at,created_at');
  return rows.map(row => ({
    id: row.id, title: row.title, dimension: row.dimension, categoryId: row.category_id,
    description: row.description, createdAt: row.created_at, archived: row.archived,
    observations: observations.all(row.id).map(x => ({ id: x.id, goalId: x.goal_id, activityId: x.activity_id, observedAt: x.observed_at, status: x.status, note: x.note, createdAt: x.created_at }))
  }));
}

export function saveObservation(db, input) {
  const goalId = requiredText(input.goalId, '目标', 80);
  if (!db.prepare('SELECT id FROM progress_goals WHERE id=?').get(goalId)) throw new Error('进度目标不存在');
  const status = String(input.status ?? '');
  if (!['trying', 'practicing', 'independent'].includes(status)) throw new Error('进度状态不正确');
  const observedAt = localDate(input.observedAt);
  const activityId = input.activityId || null;
  if (activityId && !getActivity(db, activityId)) throw new Error('关联活动不存在');
  const note = String(input.note ?? '').trim().slice(0, 2000);
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare('INSERT INTO progress_observations(id,goal_id,activity_id,observed_at,status,note,created_at) VALUES (?,?,?,?,?,?,?)')
    .run(id, goalId, activityId, observedAt, status, note, createdAt);
  return { id, goalId, activityId, observedAt, status, note, createdAt };
}

export function archiveGoal(db, id) { return db.prepare('UPDATE progress_goals SET archived=1 WHERE id=?').run(id).changes > 0; }
