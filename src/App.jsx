import React, { useCallback, useEffect, useState } from 'react';
import { api, dayString, daysAgo, dateLabel, timeLabel } from './api.js';

const NAV = [
  ['today', '⌂', '今天'], ['categories', '▦', '活动分类'], ['growth', '▥', '成长进度'],
  ['evaluation', '✧', 'AI 评估'], ['chat', '◌', 'AI 对话'], ['settings', '⚙', '设置']
];
const STATUS = { trying: '开始尝试', practicing: '持续练习', independent: '独立完成', unobserved: '尚无观察' };
const EMPTY_PROFILE = { name: '', birthday: '', interests: '', focus: '', baseline: '', notes: '' };
const EMPTY_ACTIVITY = { categoryId: '', projectId: '', title: '', note: '', durationMinutes: '', mood: '', localDate: dayString(), details: {} };
const icons = { english: '▣', sports: '↗', music: '♫', thinking: '◈', social: '♡', life: '☼' };
const clockValue = value => value ? new Date(value).toTimeString().slice(0, 5) : new Date().toTimeString().slice(0, 5);
const eventTimestamp = (date, time) => new Date(`${date}T${time}:00`).toISOString();

function Modal({ title, onClose, children, wide = false }) {
  useEffect(() => {
    const handle = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-head"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="关闭">×</button></div>{children}
    </section>
  </div>;
}

function Field({ label, children, hint }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function App() {
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState('today');
  const [selectedDate, setSelectedDate] = useState(dayString());
  const [filter, setFilter] = useState('all');
  const [categories, setCategories] = useState([]);
  const [projects, setProjects] = useState([]);
  const [activities, setActivities] = useState([]);
  const [diaries, setDiaries] = useState([]);
  const [goals, setGoals] = useState([]);
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [modal, setModal] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const flash = (value) => { setMessage(value); setTimeout(() => setMessage(''), 3200); };
  const loadCore = useCallback(async () => {
    const [cats, allProjects, child, allGoals] = await Promise.all([api('/categories'), api('/projects'), api('/profile'), api('/goals')]);
    setCategories(cats); setProjects(allProjects); setProfile(child); setGoals(allGoals);
  }, []);
  const loadRecords = useCallback(async () => {
    const query = `?from=${selectedDate < daysAgo(365) ? selectedDate : daysAgo(365)}&to=${selectedDate > dayString() ? selectedDate : dayString()}`;
    const [activityList, diaryList] = await Promise.all([api(`/activities${query}`), api(`/diaries${query}`)]);
    setActivities(activityList); setDiaries(diaryList);
  }, [selectedDate]);
  useEffect(() => {
    Promise.all([loadCore(), loadRecords()]).catch(err => setError(err.message)).finally(() => setLoading(false));
  }, [loadCore, loadRecords]);
  useEffect(() => { window.scrollTo(0, 0); }, [page]);
  const refresh = async () => { await Promise.all([loadCore(), loadRecords()]); };
  const perform = async (operation, success) => {
    setBusy(true); setError('');
    try { await operation(); await refresh(); if (success) flash(success); return true; }
    catch (err) { setError(err.message); return false; }
    finally { setBusy(false); }
  };
  const todayActivities = activities.filter(a => a.localDate === selectedDate && (filter === 'all' || a.categoryId === filter));
  const todayDiaries = diaries.filter(d => d.localDate === selectedDate);
  const activeCategory = categories.find(c => c.id === filter);
  const openActivity = (categoryId = categories[0]?.id, item = null, projectId = '') => setModal({ type: 'activity', item: item || { ...EMPTY_ACTIVITY, localDate: selectedDate, categoryId, projectId } });
  if (loading) return <div className="boot">正在打开 OctaSpace…</div>;

  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><div className="brand-icon">✦</div><div><strong>OctaSpace</strong><span>记录成长的每一步</span></div></div>
      <nav aria-label="主导航">{NAV.map(([id, icon, label]) => <button key={id} className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => { setPage(id); setError(''); }}><span>{icon}</span>{label}</button>)}</nav>
      <div className="sidebar-bottom"><span>♧</span><p>小小的记录<br />长成大大的力量</p></div>
    </aside>
    <main className="workspace">
      {message && <div className="toast" role="status">{message}</div>}
      {error && <div className="error-banner" role="alert">{error}<button onClick={() => setError('')} aria-label="关闭提示">×</button></div>}
      {page === 'today' && <>
        <header className="page-head"><div><div className="eyebrow">OCTASPACE · {selectedDate}</div><h1>今天的成长笔记</h1><p>{dateLabel(selectedDate)} · 留下孩子今天的故事</p></div><div className="page-actions"><button className="button secondary" onClick={() => setPage('chat')}>✧ 和 AI 聊聊</button><button className="button primary" onClick={() => openActivity()}>＋ 新增记录</button></div></header>
        <div className="date-filter"><Field label="查看日期"><input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} /></Field><div className="filter-pills"><button className={filter === 'all' ? 'selected' : ''} onClick={() => setFilter('all')}>全部</button>{categories.map(c => <button key={c.id} className={filter === c.id ? 'selected' : ''} onClick={() => setFilter(c.id)}>{c.name}</button>)}</div></div>
        <div className="today-grid"><section className="timeline-col"><div className="section-title"><h2>{activeCategory ? `${activeCategory.name}记录` : '成长时间线'}</h2><span>{todayActivities.length} 条活动</span></div>
          {todayActivities.length ? <div className="timeline">{todayActivities.map(a => <article className="timeline-item" key={a.id}><div className="timeline-time">{timeLabel(a.occurredAt)}</div><div className="timeline-dot" /><div className="record-card"><div className="record-top"><span className="category-badge" style={{ '--cat': a.categoryColor }}>{icons[a.categoryId] || '◉'} {a.categoryName}</span>{a.projectName && <span className="project-badge">{a.projectName}</span>}<strong>{a.title || a.projectName || '一次小小的活动'}</strong><div className="record-actions"><button onClick={() => openActivity(a.categoryId, a)}>编辑</button><button onClick={async () => { if (window.confirm('删除这条活动记录？')) await perform(() => api(`/activities/${a.id}`, { method: 'DELETE' }), '记录已删除'); }}>删除</button></div></div><p className="record-note">{a.note}</p>{(a.durationMinutes || a.mood || Object.keys(a.details || {}).length > 0) && <p className="record-meta">{[a.durationMinutes && `${a.durationMinutes} 分钟`, a.mood, ...Object.values(a.details || {}).filter(Boolean)].filter(Boolean).join(' · ')}</p>}</div></article>)}</div> : <div className="empty-card"><span>✎</span><h3>还没有{activeCategory?.name || ''}活动</h3><p>一句话就能记下刚刚发生的事。</p><button className="button secondary" onClick={() => openActivity(filter === 'all' ? categories[0]?.id : filter)}>添加第一条</button></div>}
          <div className="quick-add"><div className="section-title"><h2>快速添加活动</h2><span>先记下来，细节可以稍后补充</span></div><div className="quick-grid">{categories.map(c => <button key={c.id} onClick={() => openActivity(c.id)}><span className="quick-icon" style={{ '--cat': c.color }}>{icons[c.id] || '◉'}</span><span><strong>{c.name}</strong><small>记录一次活动</small></span><b>＋</b></button>)}</div></div>
        </section><aside className="journal-col"><DiaryPanel date={selectedDate} diaries={todayDiaries} activities={activities.filter(a => a.localDate === selectedDate)} perform={perform} busy={busy} /><div className="side-card"><div className="section-title"><h2>最近的进度</h2><button className="text-link" onClick={() => setPage('growth')}>查看全部 →</button></div>{goals.length ? goals.slice(0, 3).map(g => { const latest = g.observations.at(-1); return <div className="mini-goal" key={g.id}><span className="mini-goal-dot" /><div><strong>{g.title}</strong><small>{g.dimension} · {STATUS[latest?.status || 'unobserved']}</small></div></div>; }) : <p className="muted">为孩子添加一个想观察的成长目标。</p>}</div><button className="assessment-link" onClick={() => setPage('evaluation')}><span>✧</span><div><strong>生成 AI 评估</strong><small>根据你选定的记录，获得多维度观察与建议</small></div><b>→</b></button></aside></div>
      </>}
      {page === 'categories' && <CategoriesPage categories={categories} projects={projects} activities={activities} openActivity={openActivity} onSave={async data => perform(() => api('/categories', { method: 'POST', body: data }), '分类已添加')} onSaveProject={async data => perform(() => api('/projects', { method: 'POST', body: data }), '项目已添加')} />}
      {page === 'growth' && <GrowthPage categories={categories} goals={goals} perform={perform} activities={activities} />}
      {page === 'evaluation' && <EvaluationPage profile={profile} categories={categories} onError={setError} />}
      {page === 'chat' && <ChatPage onError={setError} />}
      {page === 'settings' && <SettingsPage profile={profile} onProfile={async data => perform(() => api('/profile', { method: 'PUT', body: data }), '孩子资料已保存')} onError={setError} flash={flash} />}
    </main>
    <nav className="mobile-nav" aria-label="移动端导航">{NAV.map(([id, icon, label]) => <button key={id} className={page === id ? 'active' : ''} onClick={() => setPage(id)}><span>{icon}</span><small>{label}</small></button>)}</nav>
    {modal?.type === 'activity' && <ActivityModal categories={categories} projects={projects} initial={modal.item} busy={busy} onClose={() => setModal(null)} onSave={async data => { const saved = await perform(() => modal.item.id ? api(`/activities/${modal.item.id}`, { method: 'PUT', body: data }) : api('/activities', { method: 'POST', body: data }), '活动已记录'); if (saved) setModal(null); }} />}
  </div>;
}

function ActivityModal({ categories, projects, initial, onClose, onSave, busy }) {
  const [form, setForm] = useState({ ...initial, details: { ...(initial.details || {}) } });
  const [eventTime, setEventTime] = useState(clockValue(initial.occurredAt));
  const [more, setMore] = useState(Boolean(initial.id));
  const update = (key, value) => setForm(old => ({ ...old, [key]: value }));
  const detail = (key, value) => setForm(old => ({ ...old, details: { ...old.details, [key]: value } }));
  return <Modal title={initial.id ? '编辑活动记录' : '记录一次活动'} onClose={onClose}><form onSubmit={event => { event.preventDefault(); onSave({ ...form, occurredAt: eventTimestamp(form.localDate, eventTime) }); }}>
    <div className="form-row"><Field label="活动类型"><select value={form.categoryId} onChange={e => setForm(old => ({ ...old, categoryId: e.target.value, projectId: '' }))} required>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><Field label="项目（可选）"><select value={form.projectId || ''} onChange={e => update('projectId', e.target.value)}><option value="">不指定项目</option>{projects.filter(p => p.categoryId === form.categoryId).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field></div>
    <div className="form-row"><Field label="发生日期"><input type="date" value={form.localDate} onChange={e => update('localDate', e.target.value)} required /></Field><Field label="发生时间"><input type="time" value={eventTime} onChange={e => setEventTime(e.target.value)} required /></Field></div>
    <Field label="今天做了什么"><textarea rows="3" placeholder="例如：在公园骑了半小时平衡车，转弯比上周更稳了" value={form.note} onChange={e => update('note', e.target.value)} required autoFocus /></Field>
    <button type="button" className="details-toggle" onClick={() => setMore(!more)}>{more ? '收起细节 −' : '添加标题、进度与状态 ＋'}</button>
    {more && <div className="details-fields"><Field label="简短标题"><input value={form.title} onChange={e => update('title', e.target.value)} placeholder="例如：平衡车" /></Field><div className="form-row"><Field label="时长（分钟）"><input type="number" min="0" max="1440" value={form.durationMinutes ?? ''} onChange={e => update('durationMinutes', e.target.value)} /></Field><Field label="当时状态"><select value={form.mood || ''} onChange={e => update('mood', e.target.value)}><option value="">不填写</option>{['开心', '平静', '专注', '兴奋', '疲惫', '烦躁', '难过'].map(x => <option key={x}>{x}</option>)}</select></Field></div>{form.categoryId === 'english' && <><Field label="新词汇 / 句型"><input value={form.details.words || ''} onChange={e => detail('words', e.target.value)} placeholder="例如：balance, I can do it" /></Field><Field label="主动表达"><input value={form.details.expression || ''} onChange={e => detail('expression', e.target.value)} placeholder="例如：主动说了 2 次" /></Field></>}</div>}
    <div className="modal-actions"><button type="button" className="button ghost" onClick={onClose}>取消</button><button className="button primary" disabled={busy}>{busy ? '保存中…' : '保存记录'}</button></div>
  </form></Modal>;
}

function DiaryPanel({ date, diaries, activities, perform, busy }) {
  const [text, setText] = useState('');
  const [mood, setMood] = useState('');
  const [eventTime, setEventTime] = useState(clockValue());
  const [links, setLinks] = useState([]);
  const [editing, setEditing] = useState(null);
  useEffect(() => { setText(''); setMood(''); setEventTime(clockValue()); setLinks([]); setEditing(null); }, [date]);
  const save = async e => {
    e.preventDefault();
    const body = { text, mood, localDate: date, occurredAt: eventTimestamp(date, eventTime) };
    const ok = await perform(() => editing
      ? api(`/diaries/${editing}`, { method: 'PUT', body })
      : api('/diaries', { method: 'POST', body: { ...body, activityIds: links } }), editing ? '日记已更新' : '日记已保存');
    if (ok) { setText(''); setMood(''); setEventTime(clockValue()); setLinks([]); setEditing(null); }
  };
  return <div className="side-card diary-panel">
    <div className="section-title"><h2>今天想记住的事</h2><span>说的话、感受或有趣的事</span></div>
    <form onSubmit={save}>
      <textarea className="diary-input" rows="7" value={text} onChange={e => setText(e.target.value)} placeholder={'比如：\n• 今天发生了什么特别的事？\n• 孩子说了什么有意思的话？\n• 他/她当时有什么感受？'} required />
      <div className="diary-options">
        <Field label="发生时间"><input type="time" value={eventTime} onChange={e => setEventTime(e.target.value)} required /></Field>
        <Field label="心情"><select value={mood} onChange={e => setMood(e.target.value)}><option value="">选择心情</option>{['开心', '平静', '兴奋', '疲惫', '烦躁', '难过'].map(x => <option key={x}>{x}</option>)}</select></Field>
        {!editing && activities.length > 0 && <Field label="关联活动"><select value="" onChange={e => setLinks(old => [...new Set([...old, e.target.value])])}><option value="">关联今天的活动</option>{activities.filter(a => !links.includes(a.id)).map(a => <option value={a.id} key={a.id}>{a.categoryName} · {a.title || a.note.slice(0, 12)}</option>)}</select></Field>}
      </div>
      {links.length > 0 && <small className="muted">已关联 {links.length} 条活动</small>}
      <div className="diary-save"><span>{text.length} 字</span><button className="button primary" disabled={busy || !text.trim()}>{editing ? '更新日记' : '保存日记'}</button></div>
    </form>
    {diaries.length > 0 && <div className="diary-list"><h3>这一天的日记</h3>{diaries.map(d => <article key={d.id} className="diary-entry"><div className="diary-entry-head"><small>发生于 {timeLabel(d.occurredAt || d.createdAt)} {d.mood && `· ${d.mood}`}</small><div><button onClick={() => { setEditing(d.id); setText(d.text); setMood(d.mood); setEventTime(clockValue(d.occurredAt || d.createdAt)); }}>编辑</button><button onClick={async () => { if (window.confirm('删除这篇日记？')) await perform(() => api(`/diaries/${d.id}`, { method: 'DELETE' }), '日记已删除'); }}>删除</button></div></div><p>{d.text}</p></article>)}</div>}
  </div>;
}

function CategoriesPage({ categories, projects, activities, openActivity, onSave, onSaveProject }) {
  const [name, setName] = useState(''); const [dimension, setDimension] = useState(''); const [color, setColor] = useState('#6f9c83');
  const [newProjects, setNewProjects] = useState({});
  return <><PageHeading kicker="ACTIVITIES" title="活动类型与项目" subtitle="先选英语、体育或音乐，再细分 RAZ、口语等项目；点击项目即可快速记录。" />
    <div className="category-grid">{categories.map(c => <article className="category-card" key={c.id}>
      <div className="category-card-head"><span className="category-icon" style={{ '--cat': c.color }}>{icons[c.id] || '◉'}</span><div><h2>{c.name}</h2><p>{c.dimension} · 已记录 {activities.filter(a => a.categoryId === c.id).length} 次</p></div></div>
      <div className="project-section"><h3>项目</h3><div className="project-list">{projects.filter(p => p.categoryId === c.id).map(p => <button key={p.id} onClick={() => openActivity(c.id, null, p.id)}>{p.name}<small>{activities.filter(a => a.projectId === p.id).length} 次</small></button>)}{!projects.some(p => p.categoryId === c.id) && <span className="muted">还没有项目，可在下面添加</span>}</div></div>
      <form className="project-add" onSubmit={async e => { e.preventDefault(); const projectName = newProjects[c.id]?.trim(); if (projectName && await onSaveProject({ categoryId: c.id, name: projectName })) setNewProjects(old => ({ ...old, [c.id]: '' })); }}><input aria-label={`新增${c.name}项目`} value={newProjects[c.id] || ''} onChange={e => setNewProjects(old => ({ ...old, [c.id]: e.target.value }))} placeholder={`添加${c.name}项目`} required /><button type="submit">添加</button></form>
      <button className="button secondary" onClick={() => openActivity(c.id)}>＋ 记录{c.name}活动</button>
    </article>)}</div>
    <div className="panel add-category"><h2>添加自己的活动类型</h2><form onSubmit={async e => { e.preventDefault(); if (await onSave({ name, dimension: dimension || name, color })) { setName(''); setDimension(''); } }}><Field label="类型名称"><input value={name} onChange={e => setName(e.target.value)} required placeholder="例如：自然观察" /></Field><Field label="能力维度"><input value={dimension} onChange={e => setDimension(e.target.value)} placeholder="例如：科学探索" /></Field><Field label="颜色"><input type="color" value={color} onChange={e => setColor(e.target.value)} /></Field><button className="button primary">添加类型</button></form></div></>;
}

function PageHeading({ kicker, title, subtitle, action }) { return <header className="page-head"><div><div className="eyebrow">{kicker}</div><h1>{title}</h1><p>{subtitle}</p></div>{action}</header>; }

function ProgressRadar({ dimensions }) {
  const values = dimensions.slice(0, 8);
  if (!values.length || !values.some(d => d.total)) return <div className="radar-empty">添加目标并记录进度后，这里会显示各维度的形状。</div>;
  const center = [200, 160], radius = 105, count = values.length;
  const point = (index, ratio) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / count;
    return [center[0] + Math.cos(angle) * radius * ratio, center[1] + Math.sin(angle) * radius * ratio];
  };
  const polygon = ratio => values.map((_, index) => point(index, ratio).join(',')).join(' ');
  const dataPolygon = values.map((d, index) => point(index, d.progressRatio ?? 0).join(',')).join(' ');
  return <svg className="radar" viewBox="0 0 400 330" role="img" aria-label="基于已设目标的进度雷达图，未设目标的维度不参与评分">
    {[0.25, 0.5, 0.75, 1].map(level => <polygon key={level} points={polygon(level)} fill="none" stroke="#e3ebe2" strokeWidth="1" />)}
    {values.map((d, index) => { const outer = point(index, 1); const label = point(index, 1.25); return <g key={d.name}><line x1={center[0]} y1={center[1]} x2={outer[0]} y2={outer[1]} stroke="#e3ebe2" /><text x={label[0]} y={label[1]} textAnchor={label[0] < 175 ? 'end' : label[0] > 225 ? 'start' : 'middle'} dominantBaseline="middle">{d.name}</text></g>; })}
    <polygon points={dataPolygon} fill="#75a88855" stroke="#4d805f" strokeWidth="2" />
    {values.map((d, index) => { const [x, y] = point(index, d.progressRatio ?? 0); return <circle key={d.name} cx={x} cy={y} r="3.5" fill="#4d805f" />; })}
  </svg>;
}

function GrowthPage({ categories, goals, perform, activities }) {
  const [dashboard, setDashboard] = useState(null); const [from, setFrom] = useState(daysAgo(29)); const [to, setTo] = useState(dayString());
  const [newGoal, setNewGoal] = useState({ title: '', dimension: categories[0]?.dimension || '', categoryId: '', description: '' });
  const [observe, setObserve] = useState(null);
  useEffect(() => { api(`/dashboard?from=${from}&to=${to}`).then(setDashboard).catch(() => {}); }, [from, to, goals, activities]);
  const maxCount = Math.max(1, ...(dashboard?.categories || []).map(c => c.count));
  return <><PageHeading kicker="PROGRESS" title="成长进度" subtitle="只看自己设定的目标与实际观察，不给孩子贴分数标签。" /><div className="range-bar"><Field label="开始"><input type="date" value={from} onChange={e => setFrom(e.target.value)} /></Field><Field label="结束"><input type="date" value={to} onChange={e => setTo(e.target.value)} /></Field></div>
    {dashboard && <><div className="stat-grid"><div className="stat"><strong>{dashboard.totals.activities}</strong><span>活动记录</span></div><div className="stat"><strong>{dashboard.totals.diaries}</strong><span>日记片段</span></div><div className="stat"><strong>{dashboard.totals.recordedDays}</strong><span>有记录的日子</span></div></div><div className="growth-grid"><section className="panel"><div className="section-title"><h2>每天的记录</h2><span>颜色表示活动类型丰富度</span></div><div className="heatmap">{dashboard.heatmap.map(day => <div key={day.date} className={`heat-cell level-${Math.min(4, day.variety)}`} title={`${day.date} · ${day.variety} 类活动${day.recorded && !day.variety ? ' · 有日记' : ''}`} />)}</div><small className="muted">浅色表示只记了日记；空白表示当天还没有记录。</small></section><section className="panel"><div className="section-title"><h2>活动分布</h2><span>按记录次数</span></div><div className="bars">{dashboard.categories.map(c => <div className="bar-row" key={c.id}><span>{c.name}</span><div className="bar-track"><i style={{ width: `${c.count / maxCount * 100}%`, background: c.color }} /></div><b>{c.count}</b></div>)}</div></section></div><section className="panel dimension-panel"><div className="section-title"><h2>观察目标分布</h2><span>独立完成 / 已设目标</span></div><div className="radar-layout"><ProgressRadar dimensions={dashboard.dimensions} /><div className="dimension-grid">{dashboard.dimensions.map(d => <div className="dimension" key={d.name}><div><strong>{d.name}</strong><span>{d.total ? `${d.independent} / ${d.total}` : '尚无目标'}</span></div><div className="bar-track"><i style={{ width: `${(d.progressRatio ?? 0) * 100}%` }} /></div></div>)}</div></div><p className="muted">图形表示自设目标的进度：开始尝试 25%、持续练习 60%、独立完成 100%；没有目标的维度留空。右侧数字为独立完成数 / 已设目标数。这只反映记录，不代表发育水平或同龄比较。</p></section></>}
    <section className="panel goals-panel"><div className="section-title"><h2>正在观察的成长目标</h2><span>{goals.length} 项</span></div>{goals.length ? goals.map(g => <article className="goal-row" key={g.id}><div><span className="goal-dimension">{g.dimension}</span><h3>{g.title}</h3><p>{g.description || '记录孩子如何尝试、练习和独立完成。'}</p><div className="goal-history">{g.observations.map(o => <span key={o.id} title={o.note}>{o.observedAt} · {STATUS[o.status]}{o.note && ` · ${o.note}`}</span>)}</div></div><div className="goal-side"><span className="status-pill">{STATUS[g.observations.at(-1)?.status || 'unobserved']}</span><button className="button secondary" onClick={() => setObserve(g)}>＋ 记录进度</button></div></article>) : <div className="empty-inline">从一个具体、可观察的小目标开始，例如“自己穿上外套”。</div>}</section>
    <section className="panel add-goal"><h2>添加成长目标</h2><form onSubmit={async e => { e.preventDefault(); if (await perform(() => api('/goals', { method: 'POST', body: newGoal }), '目标已添加')) setNewGoal({ title: '', dimension: categories[0]?.dimension || '', categoryId: '', description: '' }); }}><div className="form-row"><Field label="想观察什么"><input value={newGoal.title} onChange={e => setNewGoal({ ...newGoal, title: e.target.value })} required placeholder="例如：独立穿外套" /></Field><Field label="能力维度"><input value={newGoal.dimension} onChange={e => setNewGoal({ ...newGoal, dimension: e.target.value })} required list="dimensions" /><datalist id="dimensions">{categories.map(c => <option key={c.id} value={c.dimension} />)}</datalist></Field></div><Field label="补充说明"><input value={newGoal.description} onChange={e => setNewGoal({ ...newGoal, description: e.target.value })} placeholder="你希望看到哪些具体表现？" /></Field><button className="button primary">添加目标</button></form></section>
    {observe && <ObservationModal goal={observe} activities={activities} onClose={() => setObserve(null)} onSave={async body => { if (await perform(() => api('/observations', { method: 'POST', body }), '进度已记录')) setObserve(null); }} />}
  </>;
}

function ObservationModal({ goal, activities, onClose, onSave }) {
  const [status, setStatus] = useState('trying'); const [note, setNote] = useState(''); const [observedAt, setObservedAt] = useState(dayString()); const [activityId, setActivityId] = useState('');
  return <Modal title={`记录进度 · ${goal.title}`} onClose={onClose}><form onSubmit={e => { e.preventDefault(); onSave({ goalId: goal.id, status, note, observedAt, activityId: activityId || null }); }}><Field label="当前状态"><select value={status} onChange={e => setStatus(e.target.value)}>{Object.entries(STATUS).filter(([id]) => id !== 'unobserved').map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></Field><Field label="看到了什么具体表现"><textarea rows="3" value={note} onChange={e => setNote(e.target.value)} placeholder="例如：今天自己拉上了拉链，仍需要提醒对齐底部" /></Field><Field label="观察日期"><input type="date" value={observedAt} onChange={e => setObservedAt(e.target.value)} /></Field><Field label="关联活动（可选）"><select value={activityId} onChange={e => setActivityId(e.target.value)}><option value="">不关联</option>{activities.slice(0, 80).map(a => <option key={a.id} value={a.id}>{a.localDate} · {a.categoryName} · {a.title || a.note.slice(0, 15)}</option>)}</select></Field><div className="modal-actions"><button type="button" className="button ghost" onClick={onClose}>取消</button><button className="button primary">保存观察</button></div></form></Modal>;
}

function SourceLinks({ ids, onSource }) { return ids?.length > 0 && <div className="source-list"><span>关联记录</span>{ids.map((id, index) => <button key={id} onClick={() => onSource(id)}>记录 {index + 1} ↗</button>)}</div>; }
function useSource(open) { return id => { api(`/sources/${id}`).then(open).catch(err => alert(err.message)); }; }
function SourceModal({ source, onClose }) { return source && <Modal title="原始记录" onClose={onClose}><div className="source-detail"><span className="eyebrow">{source.type} · {source.localDate || source.observedAt}{source.occurredAt && ` ${timeLabel(source.occurredAt)}`}</span><h3>{source.title || source.categoryName || source.dimension || '日记片段'}</h3><p>{source.note || source.text || '暂无文字'}</p></div></Modal>; }

function EvaluationPage({ profile, onError }) {
  const [from, setFrom] = useState(daysAgo(29)); const [to, setTo] = useState(dayString()); const [reports, setReports] = useState([]); const [busy, setBusy] = useState(false); const [source, setSource] = useState(null);
  const openSource = useSource(setSource);
  useEffect(() => { api('/evaluations').then(setReports).catch(err => onError(err.message)); }, []);
  const generate = async () => { setBusy(true); onError(''); try { const report = await api('/evaluations', { method: 'POST', body: { from, to } }); setReports(old => [report, ...old]); } catch (err) { onError(err.message); } finally { setBusy(false); } };
  return <><PageHeading kicker="ON DEMAND" title="AI 成长评估" subtitle="你选择时间范围并主动生成，报告会结合孩子资料、当前记录与前一段时间的变化。" />{!profile.birthday && <div className="notice">建议先在设置中填写孩子生日与基础情况，评估会更贴近实际。</div>}<section className="panel evaluation-control"><div className="section-title"><h2>选择观察时段</h2><span>历史对比自动采用前一个等长时段</span></div><div className="range-bar"><Field label="开始日期"><input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} /></Field><Field label="结束日期"><input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} /></Field><button className="button primary" onClick={generate} disabled={busy}>{busy ? '正在整理记录并生成…' : '✧ 生成多维评估'}</button></div><p className="muted">报告会呈现观察、变化、资料不足之处，以及接下来 2–4 周可以尝试的活动。</p></section><div className="section-title reports-heading"><h2>已生成的评估</h2><span>{reports.length} 份</span></div>{reports.length ? reports.map(r => <article className="panel report-card" key={r.id}><div className="report-head"><div><span className="eyebrow">{r.fromDate} — {r.toDate}</span><h2>成长观察报告</h2></div><small>{new Date(r.createdAt).toLocaleString('zh-CN')} · {r.model}</small></div><div className="report-text">{r.content}</div><SourceLinks ids={r.sources} onSource={openSource} /><div className="coverage">资料覆盖：当前时段 {r.coverage?.recordCount ?? 0} 条记录，{r.coverage?.recordedDays ?? 0} 天有记录；对照时段 {r.coverage?.comparisonRecordCount ?? 0} 条记录</div></article>) : <div className="empty-card"><span>✧</span><h3>还没有评估报告</h3><p>先记录几天，再选定时间范围生成一份。</p></div>}<SourceModal source={source} onClose={() => setSource(null)} /></>;
}

function ChatPage({ onError }) {
  const [sessions, setSessions] = useState([]); const [sessionId, setSessionId] = useState(null); const [messages, setMessages] = useState([]); const [question, setQuestion] = useState(''); const [from, setFrom] = useState(daysAgo(29)); const [to, setTo] = useState(dayString()); const [busy, setBusy] = useState(false); const [source, setSource] = useState(null);
  const openSource = useSource(setSource);
  useEffect(() => { api('/chat-sessions').then(setSessions).catch(err => onError(err.message)); }, []);
  const select = async id => { setSessionId(id); setMessages(await api(`/chat-sessions/${id}/messages`)); };
  const send = async e => { e.preventDefault(); if (!question.trim() || busy) return; const value = question.trim(); setQuestion(''); setBusy(true); onError(''); setMessages(old => [...old, { id: `temp-${Date.now()}`, role: 'user', content: value, status: 'pending' }]); try { const result = await api('/chat', { method: 'POST', body: { question: value, from, to, sessionId } }); setSessionId(result.sessionId); const [all, list] = await Promise.all([api(`/chat-sessions/${result.sessionId}/messages`), api('/chat-sessions')]); setMessages(all); setSessions(list); } catch (err) { onError(err.message); if (err.sessionId) { setSessionId(err.sessionId); setMessages(await api(`/chat-sessions/${err.sessionId}/messages`)); } } finally { setBusy(false); } };
  return <><PageHeading kicker="COPILOT" title="聊聊孩子的成长" subtitle="提一个具体问题，AI 会读取你选定时间范围内的记录和孩子资料。" /><div className="chat-layout"><aside className="panel chat-sessions"><button className="button secondary full" onClick={() => { setSessionId(null); setMessages([]); }}>＋ 新对话</button><h3>历史对话</h3>{sessions.map(s => <button key={s.id} className={s.id === sessionId ? 'active' : ''} onClick={() => select(s.id)}>{s.title}</button>)}</aside><section className="panel chat-panel"><div className="chat-range"><span>参考记录</span><input type="date" aria-label="开始日期" value={from} onChange={e => setFrom(e.target.value)} /><span>至</span><input type="date" aria-label="结束日期" value={to} onChange={e => setTo(e.target.value)} /></div><div className="chat-messages">{messages.length ? messages.map(m => <div key={m.id} className={`chat-message ${m.role}`}><div className="chat-avatar">{m.role === 'assistant' ? '✧' : '我'}</div><div><div className="chat-bubble">{m.content}</div><SourceLinks ids={m.sources} onSource={openSource} />{m.status === 'failed' && <small className="error">发送失败，问题已保留；可以重试。</small>}</div></div>) : <div className="chat-welcome"><span>✧</span><h2>从一个问题开始</h2><p>例如：“最近两周孩子的情绪有什么变化？”<br />“英语主动表达比上个月多了吗？”</p></div>}{busy && <div className="chat-thinking">正在查找记录并思考…</div>}</div><form className="chat-compose" onSubmit={send}><textarea value={question} onChange={e => setQuestion(e.target.value)} placeholder="聊聊最近的状态、兴趣或接下来可以做的事…" onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form.requestSubmit(); } }} rows="2" /><button className="button primary" disabled={busy || !question.trim()}>发送 ↗</button></form><small className="muted">回答依据来自本地记录；资料不够时请继续补充观察。</small></section></div><SourceModal source={source} onClose={() => setSource(null)} /></>;
}

function SettingsPage({ profile, onProfile, onError, flash }) {
  const [form, setForm] = useState(profile); const [config, setConfig] = useState({ format: 'openai', baseUrl: '', model: '', apiKey: '', hasKey: false }); const [local, setLocal] = useState(false); const [busy, setBusy] = useState(false);
  useEffect(() => { setForm(profile); }, [profile]);
  useEffect(() => { Promise.all([api('/maas-config'), api('/admin-status')]).then(([saved, status]) => { setConfig(old => ({ ...old, ...saved, baseUrl: saved.baseUrl || old.baseUrl, model: saved.model || old.model })); setLocal(status.local); }).catch(err => onError(err.message)); }, []);
  const saveConfig = async e => { e.preventDefault(); setBusy(true); onError(''); try { const saved = await api('/maas-config', { method: 'PUT', body: config }); setConfig(old => ({ ...old, ...saved, apiKey: '' })); flash('MaaS 配置已保存在这台电脑'); } catch (err) { onError(err.message); } finally { setBusy(false); } };
  const test = async () => { setBusy(true); onError(''); try { await api('/maas-test', { method: 'POST' }); flash('模型连接成功'); } catch (err) { onError(err.message); } finally { setBusy(false); } };
  return <><PageHeading kicker="SETTINGS" title="设置" subtitle="完善孩子资料，并在主机电脑上配置模型服务。" /><div className="settings-grid"><section className="panel settings-panel"><div className="section-title"><h2>孩子的基础信息</h2><span>供评估与对话参考</span></div><form onSubmit={e => { e.preventDefault(); onProfile(form); }}><div className="form-row"><Field label="称呼"><input value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="例如：小树" /></Field><Field label="生日"><input type="date" value={form.birthday || ''} onChange={e => setForm({ ...form, birthday: e.target.value })} /></Field></div><Field label="现在喜欢什么"><textarea rows="2" value={form.interests || ''} onChange={e => setForm({ ...form, interests: e.target.value })} placeholder="最近反复玩的游戏、常提起的事物…" /></Field><Field label="目前重点关注"><textarea rows="2" value={form.focus || ''} onChange={e => setForm({ ...form, focus: e.target.value })} placeholder="例如：主动表达、运动协调、情绪调节…" /></Field><Field label="已有基础与阶段"><textarea rows="3" value={form.baseline || ''} onChange={e => setForm({ ...form, baseline: e.target.value })} placeholder="孩子已经会做什么、曾经遇到的困难…" /></Field><Field label="其他背景"><textarea rows="2" value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field><button className="button primary">保存孩子资料</button></form></section><section className="panel settings-panel"><div className="section-title"><h2>MaaS 模型连接</h2><span>{config.hasKey ? '已配置密钥' : '尚未配置密钥'}</span></div><p className="muted">模型在你主动发起对话或评估时，读取选定范围内的孩子资料与记录。</p><form onSubmit={saveConfig}><Field label="接口格式"><select value={config.format} onChange={e => setConfig({ ...config, format: e.target.value })}><option value="openai">OpenAI 兼容</option><option value="anthropic">Anthropic Messages</option></select></Field><Field label="服务地址"><input value={config.baseUrl} onChange={e => setConfig({ ...config, baseUrl: e.target.value })} placeholder="https://..." required disabled={!local} /></Field><Field label="模型名称"><input value={config.model} onChange={e => setConfig({ ...config, model: e.target.value })} required disabled={!local} /></Field><Field label="API 密钥" hint={config.hasKey ? '留空则继续使用已保存的密钥；页面不会显示原值。' : '仅在这台电脑的服务端保存。'}><input type="password" autoComplete="new-password" value={config.apiKey || ''} onChange={e => setConfig({ ...config, apiKey: e.target.value })} placeholder={config.hasKey ? '已保存 · 输入新密钥可替换' : '输入密钥'} disabled={!local} /></Field>{!local && <div className="notice">请在运行服务的电脑上打开此页面配置密钥；局域网设备可以使用记录和对话。</div>}<div className="button-row"><button className="button primary" disabled={!local || busy}>保存配置</button><button type="button" className="button secondary" onClick={test} disabled={!local || busy || !config.hasKey}>测试连接</button></div></form></section></div><section className="panel backup-panel"><h2>数据备份</h2><p className="muted">下载活动、日记、进度、对话与评估记录；备份文件不包含 MaaS 密钥。</p><BackupControls onError={onError} flash={flash} /></section></>;
}

function BackupControls({ onError, flash }) {
  const download = async () => { try { const data = await api('/backup'); const blob = new Blob([JSON.stringify(data)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `OctaSpace-备份-${dayString()}.json`; a.click(); URL.revokeObjectURL(url); flash('备份已下载'); } catch (err) { onError(err.message); } };
  const restore = async file => { if (!file || !window.confirm('导入备份会替换本机当前的孩子记录。确定继续吗？')) return; try { const body = JSON.parse(await file.text()); await api('/backup', { method: 'PUT', body }); flash('导入成功，页面即将刷新'); setTimeout(() => location.reload(), 900); } catch (err) { onError(err.message); } };
  return <div className="button-row"><button className="button secondary" onClick={download}>↓ 下载备份</button><label className="button ghost">↑ 导入备份<input type="file" accept="application/json,.json" onChange={e => { restore(e.target.files[0]); e.target.value = ''; }} /></label></div>;
}

export default App;
