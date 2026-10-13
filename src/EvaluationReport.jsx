import React from 'react';

const DIMENSIONS = {
  de: ['德', '社会情绪与同伴交往'],
  zhi: ['智', '语言、思考与解决问题'],
  ti: ['体', '健康、运动与动作协调'],
  mei: ['美', '艺术感受与表达'],
  lao: ['劳', '生活自理与参与']
};
const STATUS = { supported: '有依据', tentative: '暂定判断', unknown: '待了解' };
const PROFILE = { name: '称呼', birthday: '生日', age: '年龄', interests: '兴趣', focus: '家庭目标', baseline: '长期基础', notes: '家庭背景' };

function Evidence({ recordIds = [], profileFields = [], referenceIds = [], references = [], onSource }) {
  const referenceMap = new Map(references.map(item => [item.id, item]));
  if (!recordIds.length && !profileFields.length && !referenceIds.length) return null;
  return <details className="assessment-evidence"><summary>查看判断依据</summary><div className="assessment-evidence-content">
    {profileFields.length > 0 && <p><strong>孩子资料</strong>{profileFields.map(field => PROFILE[field] || field).join('、')}</p>}
    {recordIds.length > 0 && <div className="assessment-evidence-links"><strong>相关记录</strong>{recordIds.map((id, index) => <button key={id} type="button" onClick={() => onSource(id)}>记录 {index + 1} ↗</button>)}</div>}
    {referenceIds.map(id => { const item = referenceMap.get(id); return item && <p key={id}><strong>{item.stage === 'next' ? '后续方向' : '年龄参照'}</strong><a href={item.sourceUrl} target="_blank" rel="noreferrer">{item.text} ↗</a></p>; })}
  </div></details>;
}

function LegacyReport({ content }) {
  return <div className="legacy-report">{content.split(/\n+/).filter(Boolean).map((line, index) => {
    const match = /^【([^】]+)】\s*(.*)$/.exec(line);
    return match ? <section key={index}><h3>{match[1]}</h3>{match[2] && <p>{match[2]}</p>}</section> : <p key={index}>{line}</p>;
  })}</div>;
}

export default function EvaluationReport({ evaluation, onSource }) {
  const report = evaluation.report;
  if (!report) return <><p className="assessment-legacy-label">旧版文字报告</p><LegacyReport content={evaluation.content} /></>;
  return <div className="assessment-report">
    <section className="assessment-overview" aria-label="总体判断"><span className="assessment-kicker">{report.ageLabel} · 成长与培养评估</span><h3>{report.summary.judgement}</h3><p><strong>最值得先做：</strong>{report.summary.priority}</p></section>
    <section className="assessment-family" aria-label="家庭培养方向"><div><span className="assessment-kicker">家庭培养方向</span><h3>已经做得好的地方</h3><p>{report.familyPlan.strengths}</p></div><div><h3>值得调整的一点</h3><p>{report.familyPlan.adjustment}</p></div><Evidence {...report.familyPlan} references={report.references} onSource={onSource} /></section>
    <section className="assessment-section"><div className="assessment-section-head"><span className="assessment-kicker">01 / 全局成长画像</span><h3>从德智体美劳看孩子</h3><p>有依据的地方给出判断；尚不清楚的地方保留问题。</p></div><div className="assessment-grid">{report.dimensions.map(item => <article className="assessment-dimension" key={item.id}><div className="assessment-dimension-head"><span className="assessment-glyph">{DIMENSIONS[item.id]?.[0]}</span><div><h4>{DIMENSIONS[item.id]?.[1]}</h4><span className={`assessment-status ${item.status}`}>{STATUS[item.status]}</span></div></div><p className="assessment-verdict">{item.verdict}</p><dl><div><dt>年龄参照</dt><dd>{item.ageContext}</dd></div><div><dt>已知表现</dt><dd>{item.known}</dd></div><div><dt>目标与差距</dt><dd>{item.gap}</dd></div></dl><p className="assessment-question"><strong>还想了解：</strong>{item.question}</p><Evidence {...item} references={report.references} onSource={onSource} /></article>)}</div></section>
    {report.gaps.length > 0 && <section className="assessment-section"><div className="assessment-section-head"><span className="assessment-kicker">02 / 家庭目标</span><h3>当前最值得关注的差距</h3></div><div className="assessment-gap-grid">{report.gaps.map((gap, index) => <div className="assessment-gap" key={`${gap.title}-${index}`}><h4>{gap.title}</h4><p>{gap.explanation}</p><Evidence {...gap} references={report.references} onSource={onSource} /></div>)}</div></section>}
    <section className="assessment-section"><div className="assessment-section-head"><span className="assessment-kicker">03 / 接下来 2–4 周</span><h3>先试这些具体做法</h3><p>选择孩子愿意参与的方式，无需增加打卡任务。</p></div><div className="assessment-actions">{report.actions.map((action, index) => <article className="assessment-action" key={`${action.title}-${index}`}><span className="assessment-action-number">{String(index + 1).padStart(2, '0')}</span><div><h4>{action.title}</h4><p className="assessment-action-why">{action.why}</p><div className="assessment-action-detail"><p><strong>怎么玩</strong>{action.activity}</p><p><strong>家长怎么引导</strong>{action.guidance}</p><p><strong>看什么变化</strong>{action.signal}</p><p><strong>如果不喜欢</strong>{action.alternative}</p></div><Evidence {...action} references={report.references} onSource={onSource} /></div></article>)}</div></section>
    <section className="assessment-section assessment-followup"><span className="assessment-kicker">下次回顾</span><h3>值得留意的几个问题</h3><ol>{report.followUpQuestions.map((question, index) => <li key={index}>{question}</li>)}</ol><p className="assessment-limits">{report.limits}</p></section>
  </div>;
}
