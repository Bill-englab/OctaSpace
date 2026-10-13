import { getProfile } from './settings.js';

function parseDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) throw new Error('日期格式不正确');
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('日期格式不正确');
  return date;
}

function dayString(date) { return date.toISOString().slice(0, 10); }
function addDays(date, count) { return new Date(date.getTime() + count * 86400000); }

function ageAt(birthday, onDate) {
  if (!birthday) return '';
  let born;
  try { born = parseDay(birthday); } catch { return ''; }
  const at = parseDay(onDate);
  let months = (at.getUTCFullYear() - born.getUTCFullYear()) * 12 + at.getUTCMonth() - born.getUTCMonth();
  if (at.getUTCDate() < born.getUTCDate()) months--;
  if (months < 0) return '';
  return `${Math.floor(months / 12)}岁${months % 12}个月`;
}

function collect(db, from, to) {
  const activities = db.prepare(`SELECT a.id,a.local_date AS date,a.occurred_at AS occurredAt,a.title,a.note,a.mood,a.duration_minutes AS durationMinutes,
    a.details_json AS detailsJson,c.name AS category,p.name AS project FROM activities a
    JOIN categories c ON c.id=a.category_id LEFT JOIN projects p ON p.id=a.project_id
    WHERE a.local_date BETWEEN ? AND ?`).all(from, to).map(x => ({
    id: x.id, type: 'activity', date: x.date, occurredAt: x.occurredAt, category: x.category, project: x.project, title: x.title,
    note: x.note, mood: x.mood, durationMinutes: x.durationMinutes, details: JSON.parse(x.detailsJson || '{}')
  }));
  const diaries = db.prepare("SELECT id,local_date AS date,COALESCE(NULLIF(occurred_at,''),created_at) AS occurredAt,text,mood FROM diary_entries WHERE local_date BETWEEN ? AND ?").all(from, to)
    .map(x => ({ ...x, type: 'diary' }));
  const progress = db.prepare(`SELECT o.id,o.observed_at AS date,o.status,o.note,o.activity_id AS activityId,
    g.title AS goal,g.dimension FROM progress_observations o JOIN progress_goals g ON g.id=o.goal_id
    WHERE o.observed_at BETWEEN ? AND ?`).all(from, to).map(x => ({ ...x, type: 'progress' }));
  return [...activities, ...diaries, ...progress].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

export function buildContext(db, { from, to, comparison = false }) {
  const start = parseDay(from);
  const end = parseDay(to);
  if (start > end) throw new Error('开始日期不能晚于结束日期');
  const days = Math.round((end - start) / 86400000) + 1;
  if (days > 3660) throw new Error('时间范围不能超过 10 年');
  const profile = getProfile(db);
  const records = collect(db, from, to);
  const previousFrom = dayString(addDays(start, -days));
  const previousTo = dayString(addDays(start, -1));
  const comparisonRecords = comparison ? collect(db, previousFrom, previousTo) : [];
  const all = [...records, ...comparisonRecords];
  return {
    profile: { ...profile, age: ageAt(profile.birthday, to) },
    records, comparisonRecords,
    sourceIds: [...new Set(all.map(x => x.id))],
    coverage: {
      from, to, days, recordCount: records.length,
      comparison: comparison ? { from: previousFrom, to: previousTo } : null,
      comparisonRecordCount: comparisonRecords.length,
      recordedDays: new Set(records.map(x => x.date)).size
    }
  };
}

export function buildEvaluationContext(db, { from, to }) {
  const context = buildContext(db, { from, to, comparison: true });
  const goals = db.prepare('SELECT id,title,dimension,description,created_at AS createdAt FROM progress_goals WHERE archived=0 ORDER BY created_at,id').all()
    .map(goal => ({ ...goal, observations: db.prepare('SELECT id,observed_at AS date,status,note,activity_id AS activityId FROM progress_observations WHERE goal_id=? AND observed_at<=? ORDER BY observed_at,id').all(goal.id, to) }));
  return {
    ...context,
    goals,
    sourceIds: [...new Set([...context.sourceIds, ...goals.flatMap(goal => goal.observations.map(observation => observation.id))])]
  };
}

function chineseNumber(raw) {
  if (/^\d+$/.test(raw)) return Number(raw);
  const digits = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  if (raw.length === 1) return digits[raw] ?? NaN;
  if (raw.startsWith('十')) return 10 + (digits[raw[1]] ?? 0);
  if (raw.endsWith('十')) return (digits[raw[0]] ?? 0) * 10;
  if (raw.includes('十')) return (digits[raw[0]] ?? 0) * 10 + (digits[raw[2]] ?? 0);
  return NaN;
}

function subtractMonths(date, months) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() - months;
  const first = new Date(Date.UTC(year, month, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(date.getUTCDate(), lastDay)));
}

export function inferRange(question, referenceDate) {
  const today = parseDay(referenceDate);
  const text = String(question ?? '');
  const recent = /最近\s*([一二两三四五六七八九十\d]+)\s*(天|周|个月)/.exec(text);
  if (recent) {
    const count = chineseNumber(recent[1]);
    if (!Number.isInteger(count) || count < 1 || count > 120) throw new Error('时间范围过大');
    const from = recent[2] === '个月' ? addDays(subtractMonths(today, count), 1)
      : addDays(today, -(recent[2] === '周' ? count * 7 : count) + 1);
    return { from: dayString(from), to: referenceDate };
  }
  if (text.includes('昨天')) return { from: dayString(addDays(today, -1)), to: dayString(addDays(today, -1)) };
  if (text.includes('今天')) return { from: referenceDate, to: referenceDate };
  const weekday = (today.getUTCDay() + 6) % 7;
  if (text.includes('上周')) return { from: dayString(addDays(today, -weekday - 7)), to: dayString(addDays(today, -weekday - 1)) };
  if (text.includes('这周') || text.includes('本周')) return { from: dayString(addDays(today, -weekday)), to: referenceDate };
  if (text.includes('上个月')) {
    const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
    const last = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
    return { from: dayString(first), to: dayString(last) };
  }
  if (text.includes('这个月') || text.includes('本月')) return { from: dayString(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))), to: referenceDate };
  return null;
}
