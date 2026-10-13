import { ProviderError } from './providers.js';

const DIMENSIONS = ['de', 'zhi', 'ti', 'mei', 'lao'];
const STATUSES = new Set(['supported', 'tentative', 'unknown']);
const PROFILE_FIELDS = new Set(['name', 'birthday', 'age', 'interests', 'focus', 'baseline', 'notes']);

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ProviderError(`MaaS 评估格式不正确：缺少${label}`);
  return value;
}

function field(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > 1800) throw new ProviderError(`MaaS 评估格式不正确：缺少${label}`);
  return value.trim();
}

function list(value, label, max) {
  if (!Array.isArray(value) || value.length > max) throw new ProviderError(`MaaS 评估格式不正确：${label}`);
  return value;
}

function filteredIds(value, allowed) {
  return Array.isArray(value) ? [...new Set(value.filter(id => typeof id === 'string' && allowed.has(id)))] : [];
}

export function evaluationPrompt(context, ageReference, recordContext) {
  const schema = {
    summary: { judgement: '一句话总体判断', priority: '最重要的一项培养建议' },
    familyPlan: { strengths: '家庭目标与做法中的优势', adjustment: '最值得调整的培养方式', recordIds: [], profileFields: [] },
    dimensions: DIMENSIONS.map(id => ({ id, status: 'supported|tentative|unknown', verdict: '本维度判断', ageContext: '对应年龄参照及其当前或未来阶段', known: '已有表现或尚不清楚', gap: '与家庭目标的差距或尚无法判断', question: '一个值得了解的问题', recordIds: [], profileFields: [], referenceIds: [] })),
    gaps: [{ title: '差距标题', explanation: '有依据的差距；无明确差距时返回空数组', recordIds: [] }],
    actions: [{ title: '行动标题', why: '选择原因', activity: '结合孩子兴趣的玩法', guidance: '家长具体怎么引导', signal: '下次观察的变化', alternative: '孩子不感兴趣时如何调整', recordIds: [] }],
    followUpQuestions: ['下次回顾最值得回答的具体问题'],
    limits: '本次结论的边界'
  };
  return `你是面向家长的学龄前儿童成长与家庭培养顾问。请判断孩子当前已知表现、家庭培养目标的适龄性与差距，并给出未来2–4周可执行的指导。
先使用准确月龄。年龄参照中的 current 是当前可观察方向；next 是后续阶段末期方向，绝不能写成现在必须达标。仅用提供的参照，不编造英语水平、RAZ级别、识字量或运动项目的年龄常模。德智体美劳是组织内容的五个角度，不是标准化分数。
把权威年龄参照、家长填写的基线与目标、具体记录明确分开。未记录不等于没做；日常记录是随手记，不评价记录频率、完整度或家长勤奋程度。接触、模仿、跟读、理解、掌握和自发使用不可混同。没有对照证据不得编造进步或退步。依据不足时说“尚无法判断”，给一个容易回答的问题。目标含糊时不能编造量化标准。
总体判断要直接而温和，说明家庭培养计划的优势和最值得调整的一点。每个维度说明年龄参照、已有表现、与家庭目标的关系、判断确定程度及一个待了解问题。只列真正有依据的差距。给1至3项有优先级的行动，每项要说为什么、怎么玩、家长怎么引导、观察什么信号、不感兴趣时怎么改。优先利用兴趣、游戏与日常生活；不要为了填满五维而增加课程或打卡。
不要作医学诊断，不给发育分数或整体“优秀/落后”标签。若资料明确显示技能倒退或家长有发展担忧，建议咨询专业人员。语言应具体、温暖、有指导性；避免流水账和重复抄录。
只能返回一个合法JSON对象，不要Markdown代码块。必须严格匹配以下字段与五个dimension id；status只能选一个值。每项重要判断尽量填写支持它的recordIds、profileFields与referenceIds，未知维度可没有记录引用。actions至少1项最多3项，followUpQuestions最多3项：${JSON.stringify(schema)}
年龄参照（版本${ageReference.version}，${ageReference.ageLabel}；每项有id、阶段和来源）：${JSON.stringify(ageReference.items)}
孩子资料、家庭目标与观察：${recordContext}`;
}

export function parseEvaluation(raw, { sourceIds, ageReference }) {
  const trimmed = String(raw ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let value;
  try { value = JSON.parse(trimmed); }
  catch { throw new ProviderError('MaaS 评估返回内容不完整，请重试'); }
  const input = object(value, '报告');
  const allowedRecords = new Set(sourceIds);
  const allowedReferences = new Set(ageReference.items.map(item => item.id));
  const summary = object(input.summary, '总体判断');
  const family = object(input.familyPlan, '家庭培养判断');
  const dimensions = list(input.dimensions, '五个维度', 5).map(item => {
    const entry = object(item, '维度');
    if (!DIMENSIONS.includes(entry.id) || !STATUSES.has(entry.status)) throw new ProviderError('MaaS 评估格式不正确：五个维度');
    return {
      id: entry.id, status: entry.status,
      verdict: field(entry.verdict, '维度判断'), ageContext: field(entry.ageContext, '年龄参照'),
      known: field(entry.known, '已有表现'), gap: field(entry.gap, '目标差距'), question: field(entry.question, '待了解问题'),
      recordIds: filteredIds(entry.recordIds, allowedRecords),
      profileFields: filteredIds(entry.profileFields, PROFILE_FIELDS),
      referenceIds: filteredIds(entry.referenceIds, allowedReferences)
    };
  });
  if (dimensions.length !== 5 || new Set(dimensions.map(item => item.id)).size !== 5) throw new ProviderError('MaaS 评估格式不正确：需要德智体美劳五个维度');
  const gaps = list(input.gaps, '差距', 5).map(item => {
    const entry = object(item, '差距');
    return { title: field(entry.title, '差距标题'), explanation: field(entry.explanation, '差距说明'), recordIds: filteredIds(entry.recordIds, allowedRecords) };
  });
  const actions = list(input.actions, '行动建议', 3).map(item => {
    const entry = object(item, '行动建议');
    return {
      title: field(entry.title, '行动标题'), why: field(entry.why, '行动原因'), activity: field(entry.activity, '活动玩法'),
      guidance: field(entry.guidance, '家长引导'), signal: field(entry.signal, '观察信号'), alternative: field(entry.alternative, '调整办法'),
      recordIds: filteredIds(entry.recordIds, allowedRecords)
    };
  });
  if (actions.length === 0) throw new ProviderError('MaaS 评估格式不正确：至少需要一项行动建议');
  const followUpQuestions = list(input.followUpQuestions, '下次问题', 3).map((text, index) => field(text, `下次问题${index + 1}`));
  const report = {
    ageLabel: ageReference.ageLabel,
    references: ageReference.items,
    summary: { judgement: field(summary.judgement, '总体判断'), priority: field(summary.priority, '首要建议') },
    familyPlan: { strengths: field(family.strengths, '家庭优势'), adjustment: field(family.adjustment, '培养调整'), recordIds: filteredIds(family.recordIds, allowedRecords), profileFields: filteredIds(family.profileFields, PROFILE_FIELDS) },
    dimensions: DIMENSIONS.map(id => dimensions.find(item => item.id === id)), gaps, actions, followUpQuestions,
    limits: field(input.limits, '判断边界')
  };
  const sources = [...new Set([...report.familyPlan.recordIds, ...report.dimensions.flatMap(item => item.recordIds), ...gaps.flatMap(item => item.recordIds), ...actions.flatMap(item => item.recordIds)])];
  return { report, sources };
}
