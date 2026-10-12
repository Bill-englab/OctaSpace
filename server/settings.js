import { validateProviderConfig } from './providers.js';

export function getProfile(db) {
  return db.prepare('SELECT name,birthday,interests,focus,baseline,notes FROM child_profile WHERE id=1').get();
}

export function saveProfile(db, input) {
  const profile = {
    name: String(input.name ?? '').trim().slice(0, 80),
    birthday: String(input.birthday ?? '').trim(),
    interests: String(input.interests ?? '').trim().slice(0, 2000),
    focus: String(input.focus ?? '').trim().slice(0, 2000),
    baseline: String(input.baseline ?? '').trim().slice(0, 4000),
    notes: String(input.notes ?? '').trim().slice(0, 4000)
  };
  if (profile.birthday && !/^\d{4}-\d{2}-\d{2}$/.test(profile.birthday)) throw new Error('生日格式应为 YYYY-MM-DD');
  db.prepare(`UPDATE child_profile SET name=?, birthday=?, interests=?, focus=?, baseline=?, notes=? WHERE id=1`)
    .run(profile.name, profile.birthday, profile.interests, profile.focus, profile.baseline, profile.notes);
  return getProfile(db);
}

export function getSetting(db, key) {
  return db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value ?? null;
}

export function setSetting(db, key, value) {
  db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value);
}

export function getMaasConfig(db, includeSecret = false) {
  const raw = getSetting(db, 'maas_config');
  if (!raw) return includeSecret ? null : { format: 'openai', baseUrl: '', model: '', hasKey: false };
  const config = JSON.parse(raw);
  return includeSecret ? config : {
    format: config.format, baseUrl: config.baseUrl, model: config.model, hasKey: Boolean(config.apiKey)
  };
}

export function saveMaasConfig(db, input) {
  const existing = getMaasConfig(db, true) ?? {};
  const config = validateProviderConfig({
    format: input.format ?? existing.format,
    baseUrl: input.baseUrl ?? existing.baseUrl,
    model: input.model ?? existing.model,
    apiKey: input.apiKey?.trim() || existing.apiKey
  });
  setSetting(db, 'maas_config', JSON.stringify(config));
  return getMaasConfig(db);
}
