import fs from 'node:fs';
import path from 'node:path';
import { seedDefaultProjects } from './db.js';

const TABLES = [
  'child_profile', 'categories', 'projects', 'activities', 'diary_entries', 'diary_activity_links',
  'progress_goals', 'progress_observations', 'media_assets', 'chat_sessions', 'chat_messages', 'evaluations'
];
const MEDIA_NAME = /^[a-zA-Z0-9_-]+\.(jpg|png|webp|mp4|webm)$/;
const MAX_MEDIA = 50 * 1024 * 1024;
const MAX_TOTAL = 200 * 1024 * 1024;

export function exportBackup(db, mediaDir) {
  const tables = Object.fromEntries(TABLES.map(name => [name, db.prepare(`SELECT * FROM ${name}`).all()]));
  const media = tables.media_assets.map(row => {
    const filename = path.join(mediaDir, row.filename);
    if (!fs.existsSync(filename)) throw new Error(`媒体文件缺失：${row.id}`);
    return { id: row.id, data: fs.readFileSync(filename).toString('base64') };
  });
  return { format: 'growth-journal-backup', version: 2, exportedAt: new Date().toISOString(), tables, media };
}

function validate(db, backup) {
  if (!backup || backup.format !== 'growth-journal-backup' || ![1, 2].includes(backup.version) || !backup.tables || !Array.isArray(backup.media)) throw new Error('不是有效的成长日记备份');
  const tables = backup.version === 1 ? { ...backup.tables, projects: [] } : backup.tables;
  const columns = Object.fromEntries(TABLES.map(name => [name, new Set(db.prepare(`PRAGMA table_info(${name})`).all().map(row => row.name))]));
  for (const name of TABLES) {
    const rows = tables[name];
    if (!Array.isArray(rows)) throw new Error(`备份缺少 ${name} 数据`);
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row) || !Object.keys(row).length || Object.keys(row).some(key => !columns[name].has(key) || !['string', 'number'].includes(typeof row[key]) && row[key] !== null)) throw new Error(`备份中 ${name} 数据格式不正确`);
    }
  }
  if (tables.child_profile.length !== 1 || tables.child_profile[0].id !== 1) throw new Error('孩子资料格式不正确');
  const mediaRows = new Map(tables.media_assets.map(row => [row.id, row]));
  if (mediaRows.size !== backup.media.length) throw new Error('媒体文件数量不匹配');
  let size = 0;
  for (const item of backup.media) {
    const row = mediaRows.get(item?.id);
    if (!row || !MEDIA_NAME.test(row.filename) || typeof item.data !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(item.data)) throw new Error('媒体文件格式不正确');
    const bytes = Buffer.from(item.data, 'base64');
    size += bytes.length;
    if (bytes.length !== row.bytes || bytes.length > MAX_MEDIA || size > MAX_TOTAL) throw new Error('备份媒体文件大小不正确');
  }
  return tables;
}

export function importBackup(db, mediaDir, backup) {
  const tables = validate(db, backup);
  const parent = path.dirname(mediaDir);
  const stageDir = fs.mkdtempSync(path.join(parent, 'media-import-'));
  const oldDir = path.join(parent, `media-before-import-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  let swapped = false;
  let began = false;
  try {
    for (const item of backup.media) {
      const row = tables.media_assets.find(record => record.id === item.id);
      fs.writeFileSync(path.join(stageDir, row.filename), Buffer.from(item.data, 'base64'), { flag: 'wx' });
    }
    db.exec('BEGIN'); began = true;
    for (const name of [...TABLES].reverse()) db.exec(`DELETE FROM ${name}`);
    for (const name of TABLES) {
      for (const row of tables[name]) {
        const keys = Object.keys(row);
        const statement = db.prepare(`INSERT INTO ${name} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`);
        statement.run(...keys.map(key => row[key]));
      }
    }
    if (backup.version === 1) seedDefaultProjects(db);
    fs.renameSync(mediaDir, oldDir);
    try { fs.renameSync(stageDir, mediaDir); swapped = true; }
    catch (error) { fs.renameSync(oldDir, mediaDir); throw error; }
    db.exec('COMMIT'); began = false;
    swapped = false;
    try { fs.rmSync(oldDir, { recursive: true, force: true }); } catch { /* The imported data is already active. */ }
    return { ok: true, records: tables.activities.length + tables.diary_entries.length };
  } catch (error) {
    if (began) db.exec('ROLLBACK');
    if (swapped) {
      fs.rmSync(mediaDir, { recursive: true, force: true });
      fs.renameSync(oldDir, mediaDir);
    }
    throw Object.assign(new Error(`导入失败：${error.message}`), { status: 400 });
  } finally {
    if (fs.existsSync(stageDir)) fs.rmSync(stageDir, { recursive: true, force: true });
  }
}
