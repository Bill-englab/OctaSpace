import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openStore } from '../server/db.js';

test('an existing journal gains projects without losing its records', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'journal-migrate-'));
  const legacy = new DatabaseSync(path.join(dir, 'journal.sqlite'));
  legacy.exec(`CREATE TABLE categories (id TEXT PRIMARY KEY,name TEXT NOT NULL,dimension TEXT NOT NULL,color TEXT NOT NULL,sort_order INTEGER NOT NULL DEFAULT 0,archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE activities (id TEXT PRIMARY KEY,category_id TEXT NOT NULL,occurred_at TEXT NOT NULL,local_date TEXT NOT NULL,title TEXT NOT NULL DEFAULT '',note TEXT NOT NULL,duration_minutes INTEGER,mood TEXT NOT NULL DEFAULT '',details_json TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    INSERT INTO categories(id,name,dimension,color) VALUES ('english','英语','语言表达','#547fc8');
    INSERT INTO activities(id,category_id,occurred_at,local_date,note,created_at,updated_at) VALUES ('old','english','2026-10-12T00:00:00Z','2026-10-12','旧记录','2026-10-12T00:00:00Z','2026-10-12T00:00:00Z');`);
  legacy.close();
  const store = openStore(dir);
  try {
    assert.equal(store.db.prepare("SELECT note FROM activities WHERE id='old'").get().note, '旧记录');
    assert.equal(store.db.prepare("SELECT project_id FROM activities WHERE id='old'").get().project_id, null);
    assert.equal(store.db.prepare("SELECT count(*) AS n FROM projects WHERE category_id='english'").get().n, 2);
  } finally { store.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('existing diary entries gain an event time from their original save time', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'journal-diary-migrate-'));
  const legacy = new DatabaseSync(path.join(dir, 'journal.sqlite'));
  legacy.exec(`CREATE TABLE diary_entries (
    id TEXT PRIMARY KEY, local_date TEXT NOT NULL, text TEXT NOT NULL, mood TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  INSERT INTO diary_entries(id,local_date,text,created_at,updated_at)
    VALUES ('old-diary','2026-10-12','放学后分享了故事','2026-10-12T09:15:00Z','2026-10-12T09:15:00Z');`);
  legacy.close();
  const store = openStore(dir);
  try {
    assert.equal(store.db.prepare("SELECT occurred_at FROM diary_entries WHERE id='old-diary'").get().occurred_at, '2026-10-12T09:15:00Z');
  } finally { store.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
