import fs from 'node:fs';
import path from 'node:path';

export function listMedia(db, { activityId, diaryId } = {}) {
  const filter = activityId ? ['activity_id', activityId] : diaryId ? ['diary_id', diaryId] : null;
  return db.prepare(`SELECT id FROM media_assets ${filter ? `WHERE ${filter[0]}=?` : ''}`).all(...(filter ? [filter[1]] : []));
}

export function deleteMedia(db, mediaDir, id) {
  const row = db.prepare('SELECT filename FROM media_assets WHERE id=?').get(id);
  if (!row) return false;
  db.prepare('DELETE FROM media_assets WHERE id=?').run(id);
  fs.rmSync(path.join(mediaDir, row.filename), { force: true });
  return true;
}
