import { listGoals } from './records.js';

function datesBetween(from, to) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(to ?? '')) throw new Error('日期格式不正确');
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start.toISOString().slice(0, 10) !== from || end.toISOString().slice(0, 10) !== to || start > end) throw new Error('日期范围不正确');
  const days = Math.round((end - start) / 86400000) + 1;
  if (days > 3660) throw new Error('日期范围不能超过 10 年');
  return Array.from({ length: days }, (_, index) => new Date(start.getTime() + index * 86400000).toISOString().slice(0, 10));
}

export function getDashboard(db, { from, to }) {
  const days = datesBetween(from, to);
  const activities = db.prepare('SELECT id,category_id,local_date FROM activities WHERE local_date BETWEEN ? AND ?').all(from, to);
  const diaries = db.prepare('SELECT id,local_date FROM diary_entries WHERE local_date BETWEEN ? AND ?').all(from, to);
  const variety = new Map(days.map(day => [day, new Set()]));
  const recorded = new Set();
  const categoryCount = new Map();
  for (const activity of activities) {
    variety.get(activity.local_date).add(activity.category_id);
    recorded.add(activity.local_date);
    categoryCount.set(activity.category_id, (categoryCount.get(activity.category_id) ?? 0) + 1);
  }
  for (const diary of diaries) recorded.add(diary.local_date);
  const categories = db.prepare('SELECT id,name,dimension,color FROM categories WHERE archived=0 ORDER BY sort_order').all()
    .map(row => ({ ...row, count: categoryCount.get(row.id) ?? 0 }));
  const goals = listGoals(db).map(goal => {
    const prior = goal.observations.filter(x => x.observedAt <= to);
    const latest = prior.at(-1) ?? null;
    return { ...goal, status: latest?.status ?? 'unobserved', latestObservation: latest };
  });
  const dimensionNames = [...new Set([...categories.map(x => x.dimension), ...goals.map(x => x.dimension)])];
  const dimensions = dimensionNames.map(name => {
    const relevant = goals.filter(x => x.dimension === name);
    const independent = relevant.filter(x => x.status === 'independent').length;
    const weights = { unobserved: 0, trying: 0.25, practicing: 0.6, independent: 1 };
    const progressRatio = relevant.length ? relevant.reduce((sum, goal) => sum + weights[goal.status], 0) / relevant.length : null;
    return { name, independent, total: relevant.length, ratio: relevant.length ? independent / relevant.length : null, progressRatio };
  });
  return {
    from, to,
    totals: { activities: activities.length, diaries: diaries.length, recordedDays: recorded.size },
    heatmap: days.map(date => ({ date, variety: variety.get(date).size, recorded: recorded.has(date) })),
    categories, dimensions, goals
  };
}
