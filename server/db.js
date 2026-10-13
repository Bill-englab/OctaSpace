import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_CATEGORIES = [
  ['english', '英语', '语言表达', '#547fc8'],
  ['sports', '体育', '大动作', '#5c9b70'],
  ['music', '音乐', '艺术感知', '#d9a045'],
  ['thinking', '认知与动手', '认知与精细动作', '#9376bb'],
  ['social', '社交情绪', '社交情感', '#d77f7b'],
  ['life', '日常生活', '生活自理', '#7c9da0']
];
const DEFAULT_PROJECTS = [
  ['english-raz', 'english', 'RAZ'],
  ['english-speaking', 'english', '口语']
];

export function seedDefaultProjects(db) {
  const insert = db.prepare('INSERT OR IGNORE INTO projects(id,category_id,name,sort_order) VALUES (?,?,?,?)');
  DEFAULT_PROJECTS.forEach((row, index) => insert.run(...row, index));
}

export function openStore(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const mediaDir = path.join(dataDir, 'media');
  fs.mkdirSync(mediaDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'journal.sqlite'));
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS child_profile (
      id INTEGER PRIMARY KEY CHECK (id = 1), name TEXT NOT NULL DEFAULT '', birthday TEXT NOT NULL DEFAULT '',
      interests TEXT NOT NULL DEFAULT '', focus TEXT NOT NULL DEFAULT '', baseline TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, dimension TEXT NOT NULL, color TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY, category_id TEXT NOT NULL REFERENCES categories(id), name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0,
      UNIQUE(category_id,name)
    );
    CREATE INDEX IF NOT EXISTS projects_category_idx ON projects(category_id,sort_order);
    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY, category_id TEXT NOT NULL REFERENCES categories(id), project_id TEXT REFERENCES projects(id), occurred_at TEXT NOT NULL,
      local_date TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', note TEXT NOT NULL,
      duration_minutes INTEGER, mood TEXT NOT NULL DEFAULT '', details_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS activities_date_idx ON activities(local_date, occurred_at);
    CREATE TABLE IF NOT EXISTS diary_entries (
      id TEXT PRIMARY KEY, local_date TEXT NOT NULL, text TEXT NOT NULL, mood TEXT NOT NULL DEFAULT '',
      occurred_at TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS diary_activity_links (
      diary_id TEXT NOT NULL REFERENCES diary_entries(id) ON DELETE CASCADE,
      activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
      PRIMARY KEY(diary_id, activity_id)
    );
    CREATE TABLE IF NOT EXISTS progress_goals (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, dimension TEXT NOT NULL, category_id TEXT REFERENCES categories(id),
      description TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS progress_observations (
      id TEXT PRIMARY KEY, goal_id TEXT NOT NULL REFERENCES progress_goals(id) ON DELETE CASCADE,
      activity_id TEXT REFERENCES activities(id) ON DELETE SET NULL, observed_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('trying','practicing','independent')),
      note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS progress_goal_date_idx ON progress_observations(goal_id, observed_at);
    CREATE TABLE IF NOT EXISTS media_assets (
      id TEXT PRIMARY KEY, activity_id TEXT REFERENCES activities(id) ON DELETE CASCADE,
      diary_id TEXT REFERENCES diary_entries(id) ON DELETE CASCADE,
      filename TEXT NOT NULL, mime TEXT NOT NULL, bytes INTEGER NOT NULL, created_at TEXT NOT NULL,
      CHECK (activity_id IS NOT NULL OR diary_id IS NOT NULL)
    );
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user','assistant')), content TEXT NOT NULL,
      from_date TEXT NOT NULL DEFAULT '', to_date TEXT NOT NULL DEFAULT '',
      sources_json TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'complete', created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS evaluations (
      id TEXT PRIMARY KEY, from_date TEXT NOT NULL, to_date TEXT NOT NULL, content TEXT NOT NULL,
      sources_json TEXT NOT NULL DEFAULT '[]', coverage_json TEXT NOT NULL DEFAULT '{}',
      model TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
    );
    INSERT OR IGNORE INTO child_profile(id) VALUES (1);
  `);
  if (!db.prepare('PRAGMA table_info(activities)').all().some(column => column.name === 'project_id')) {
    db.exec('ALTER TABLE activities ADD COLUMN project_id TEXT REFERENCES projects(id)');
  }
  if (!db.prepare('PRAGMA table_info(diary_entries)').all().some(column => column.name === 'occurred_at')) {
    db.exec("ALTER TABLE diary_entries ADD COLUMN occurred_at TEXT NOT NULL DEFAULT ''");
  }
  if (!db.prepare('PRAGMA table_info(evaluations)').all().some(column => column.name === 'report_json')) {
    db.exec('ALTER TABLE evaluations ADD COLUMN report_json TEXT');
  }
  if (!db.prepare('PRAGMA table_info(evaluations)').all().some(column => column.name === 'reference_version')) {
    db.exec('ALTER TABLE evaluations ADD COLUMN reference_version TEXT');
  }
  db.exec("UPDATE diary_entries SET occurred_at=created_at WHERE occurred_at=''");
  const insertCategory = db.prepare('INSERT OR IGNORE INTO categories(id,name,dimension,color,sort_order) VALUES (?,?,?,?,?)');
  DEFAULT_CATEGORIES.forEach((row, index) => insertCategory.run(...row, index));
  seedDefaultProjects(db);
  db.prepare("DELETE FROM settings WHERE key='access_code'").run();
  return { db, mediaDir, close() { db.close(); } };
}
