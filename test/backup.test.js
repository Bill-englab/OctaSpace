import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openStore } from '../server/db.js';
import { exportBackup, importBackup } from '../server/backup.js';

test('backup restores records and media without exporting secrets', () => {
  const firstDir = fs.mkdtempSync(path.join(os.tmpdir(), 'journal-backup-a-'));
  const secondDir = fs.mkdtempSync(path.join(os.tmpdir(), 'journal-backup-b-'));
  const first = openStore(firstDir); const second = openStore(secondDir);
  try {
    first.db.prepare('UPDATE child_profile SET name=? WHERE id=1').run('小树');
    first.db.prepare('INSERT INTO settings(key,value) VALUES (?,?)').run('maas_config', '{"apiKey":"hidden-secret"}');
    first.db.prepare(`INSERT INTO activities(id,category_id,occurred_at,local_date,title,note,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`)
      .run('a1', 'english', '2026-10-12T10:00:00Z', '2026-10-12', '', '主动说了一句话', '2026-10-12T10:00:00Z', '2026-10-12T10:00:00Z');
    fs.writeFileSync(path.join(first.mediaDir, 'm1.png'), Buffer.from('picture'));
    first.db.prepare('INSERT INTO media_assets(id,activity_id,filename,mime,bytes,created_at) VALUES (?,?,?,?,?,?)').run('m1', 'a1', 'm1.png', 'image/png', 7, '2026-10-12T10:00:00Z');
    const backup = exportBackup(first.db, first.mediaDir);
    assert.equal(JSON.stringify(backup).includes('hidden-secret'), false);
    assert.equal(backup.version, 2);
    assert.equal(backup.tables.activities.length, 1);
    assert.equal(backup.tables.projects.some(x => x.name === 'RAZ'), true);
    assert.equal(backup.media[0].data, Buffer.from('picture').toString('base64'));
    importBackup(second.db, second.mediaDir, backup);
    assert.equal(second.db.prepare('SELECT name FROM child_profile WHERE id=1').get().name, '小树');
    assert.equal(second.db.prepare('SELECT note FROM activities WHERE id=?').get('a1').note, '主动说了一句话');
    assert.equal(fs.readFileSync(path.join(second.mediaDir, 'm1.png'), 'utf8'), 'picture');
  } finally { first.close(); second.close(); fs.rmSync(firstDir, { recursive: true, force: true }); fs.rmSync(secondDir, { recursive: true, force: true }); }
});

test('a version 1 backup remains importable after adding projects', () => {
  const firstDir = fs.mkdtempSync(path.join(os.tmpdir(), 'journal-old-backup-a-'));
  const secondDir = fs.mkdtempSync(path.join(os.tmpdir(), 'journal-old-backup-b-'));
  const first = openStore(firstDir); const second = openStore(secondDir);
  try {
    first.db.prepare('INSERT INTO diary_entries(id,local_date,text,created_at,updated_at) VALUES (?,?,?,?,?)')
      .run('legacy-diary', '2026-10-12', '旧备份里的互动', '2026-10-12T09:15:00Z', '2026-10-12T09:15:00Z');
    const old = exportBackup(first.db, first.mediaDir);
    old.version = 1;
    delete old.tables.projects;
    old.tables.activities.forEach(row => delete row.project_id);
    old.tables.diary_entries.forEach(row => delete row.occurred_at);
    importBackup(second.db, second.mediaDir, old);
    assert.equal(second.db.prepare("SELECT count(*) AS n FROM projects WHERE category_id='english'").get().n, 2);
    assert.equal(second.db.prepare("SELECT COALESCE(NULLIF(occurred_at,''),created_at) AS event_time FROM diary_entries WHERE id='legacy-diary'").get().event_time, '2026-10-12T09:15:00Z');
  } finally { first.close(); second.close(); fs.rmSync(firstDir, { recursive: true, force: true }); fs.rmSync(secondDir, { recursive: true, force: true }); }
});

test('invalid backup leaves existing data untouched', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'journal-backup-invalid-'));
  const store = openStore(dir);
  try {
    assert.throws(() => importBackup(store.db, store.mediaDir, { version: 1, tables: { child_profile: [{ name: '坏数据' }] }, media: [] }));
    assert.equal(store.db.prepare('SELECT name FROM child_profile WHERE id=1').get().name, '');
  } finally { store.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
