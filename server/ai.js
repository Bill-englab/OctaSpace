import crypto from 'node:crypto';
import { buildContext, buildEvaluationContext, inferRange } from './context.js';
import { ProviderError, sendModel } from './providers.js';
import { getAgeReference } from './age-reference.js';
import { evaluationPrompt, parseEvaluation } from './evaluation-report.js';

function todayLocal() { return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }); }
function dateBefore(day, days) { return new Date(Date.parse(`${day}T00:00:00Z`) - days * 86400000).toISOString().slice(0, 10); }

function cleanOutput(raw, allowedIds) {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let content = raw.trim();
  let claimed = [];
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === 'object' && parsed) {
      content = String(parsed.answer ?? parsed.report ?? parsed.content ?? JSON.stringify(parsed, null, 2));
      claimed = Array.isArray(parsed.sourceIds) ? parsed.sourceIds : [];
    }
  } catch {
    if (/^[{\[]/.test(trimmed)) throw new ProviderError('MaaS 返回内容不完整，请重试或切换模型');
    claimed = [...raw.matchAll(/\[记录:([\w-]+)\]/g)].map(match => match[1]);
  }
  const allowed = new Set(allowedIds);
  const sources = [...new Set(claimed.filter(id => allowed.has(id)))];
  return { content, sources };
}

async function contextForModel(config, context, fetchImpl) {
  const all = [...context.records, ...context.comparisonRecords];
  if (all.length <= 60) return JSON.stringify({ profile: context.profile, goals: context.goals ?? [], coverage: context.coverage, records: context.records, comparisonRecords: context.comparisonRecords });
  const chunks = [];
  for (let index = 0; index < all.length; index += 50) {
    const group = all.slice(index, index + 50);
    const summary = await sendModel(config, {
      system: '请压缩家庭记录。保留可观察事实、日期、发生时间与原始记录编号，不做评价，不添加没有出现的事实。',
      messages: [{ role: 'user', content: JSON.stringify(group) }], maxTokens: 16384, timeoutMs: 480000
    }, fetchImpl);
    chunks.push({ sourceIds: group.map(x => x.id), summary });
  }
  return JSON.stringify({ profile: context.profile, goals: context.goals ?? [], coverage: context.coverage, compressedGroups: chunks });
}

function sourceInstruction() {
  return '只能根据提供的孩子资料和记录回答。区分观察、推断与建议；资料不足时直接说明。不要做医学诊断。请以 JSON 对象返回：{"answer":"中文回答，分段清晰","sourceIds":["真实记录编号"]}。sourceIds 只放确实支持结论的记录编号。';
}

export function listChatSessions(db) {
  return db.prepare('SELECT id,title,created_at AS createdAt,updated_at AS updatedAt FROM chat_sessions ORDER BY updated_at DESC').all();
}

export function listChatMessages(db, sessionId) {
  return db.prepare('SELECT id,role,content,from_date AS fromDate,to_date AS toDate,sources_json AS sourcesJson,status,created_at AS createdAt FROM chat_messages WHERE session_id=? ORDER BY created_at,id').all(sessionId)
    .map(x => ({ ...x, sources: JSON.parse(x.sourcesJson), sourcesJson: undefined }));
}

export async function askChildQuestion(db, config, input, fetchImpl = fetch) {
  const question = String(input.question ?? '').trim();
  if (!question || question.length > 4000) throw new Error('问题应为 1 到 4000 字');
  const today = input.today || todayLocal();
  const inferred = inferRange(question, today);
  const from = inferred?.from ?? input.from ?? dateBefore(today, 29);
  const to = inferred?.to ?? input.to ?? today;
  const context = buildContext(db, { from, to });
  let sessionId = input.sessionId;
  const now = new Date().toISOString();
  if (sessionId) {
    if (!db.prepare('SELECT id FROM chat_sessions WHERE id=?').get(sessionId)) throw new Error('对话不存在');
  } else {
    sessionId = crypto.randomUUID();
    db.prepare('INSERT INTO chat_sessions(id,title,created_at,updated_at) VALUES (?,?,?,?)')
      .run(sessionId, question.slice(0, 40), now, now);
  }
  const history = listChatMessages(db, sessionId).filter(x => x.status === 'complete').slice(-12)
    .map(x => ({ role: x.role, content: x.content }));
  const userId = crypto.randomUUID();
  db.prepare('INSERT INTO chat_messages(id,session_id,role,content,from_date,to_date,status,created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(userId, sessionId, 'user', question, from, to, 'pending', now);
  try {
    const recordContext = await contextForModel(config, context, fetchImpl);
    const raw = await sendModel(config, {
      system: `${sourceInstruction()}\n孩子资料及所选范围记录：${recordContext}`,
      messages: [...history, { role: 'user', content: question }], maxTokens: 16384, timeoutMs: 480000
    }, fetchImpl);
    const { content, sources } = cleanOutput(raw, context.sourceIds);
    const replyId = crypto.randomUUID();
    const completedAt = new Date().toISOString();
    db.exec('BEGIN');
    try {
      db.prepare('UPDATE chat_messages SET status=? WHERE id=?').run('complete', userId);
      db.prepare('INSERT INTO chat_messages(id,session_id,role,content,from_date,to_date,sources_json,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(replyId, sessionId, 'assistant', content, from, to, JSON.stringify(sources), 'complete', completedAt);
      db.prepare('UPDATE chat_sessions SET updated_at=? WHERE id=?').run(completedAt, sessionId);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    return { id: replyId, sessionId, content, sources, coverage: context.coverage, from, to };
  } catch (error) {
    db.prepare('UPDATE chat_messages SET status=? WHERE id=?').run('failed', userId);
    error.sessionId = sessionId;
    throw error;
  }
}

export function listEvaluations(db) {
  return db.prepare('SELECT id,from_date AS fromDate,to_date AS toDate,content,sources_json AS sourcesJson,coverage_json AS coverageJson,model,created_at AS createdAt,report_json AS reportJson,reference_version AS referenceVersion FROM evaluations ORDER BY created_at DESC').all()
    .map(x => ({ ...x, sources: JSON.parse(x.sourcesJson), coverage: JSON.parse(x.coverageJson), report: x.reportJson ? JSON.parse(x.reportJson) : null, sourcesJson: undefined, coverageJson: undefined, reportJson: undefined }));
}

export async function generateEvaluation(db, config, input, fetchImpl = fetch) {
  const context = buildEvaluationContext(db, { from: input.from, to: input.to });
  if (!context.profile.birthday) throw Object.assign(new Error('请先在设置中填写孩子生日，才能结合年龄评估'), { status: 422 });
  if (!context.records.length && !context.goals.length && !context.profile.focus && !context.profile.baseline) {
    throw Object.assign(new Error('请先补充孩子的目标、已有基础或活动记录'), { status: 422 });
  }
  const ageReference = getAgeReference(context.profile.birthday, input.to) ?? { ageLabel: context.profile.age || '年龄未知', version: 'age-reference-unavailable', items: [] };
  const recordContext = await contextForModel(config, context, fetchImpl);
  const raw = await sendModel(config, {
    system: evaluationPrompt(context, ageReference, recordContext),
    messages: [{ role: 'user', content: `请评估 ${input.from} 至 ${input.to} 的成长记录。` }], maxTokens: 24576, timeoutMs: 480000
  }, fetchImpl);
  const { report, sources } = parseEvaluation(raw, { sourceIds: context.sourceIds, ageReference });
  const content = report.summary.judgement;
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare('INSERT INTO evaluations(id,from_date,to_date,content,sources_json,coverage_json,model,created_at,report_json,reference_version) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(id, input.from, input.to, content, JSON.stringify(sources), JSON.stringify(context.coverage), config.model, createdAt, JSON.stringify(report), ageReference.version);
  return { id, fromDate: input.from, toDate: input.to, content, sources, coverage: context.coverage, model: config.model, createdAt, report, referenceVersion: ageReference.version };
}
