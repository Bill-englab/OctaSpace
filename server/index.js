import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore } from './db.js';
import { getProfile, saveProfile, getMaasConfig, saveMaasConfig } from './settings.js';
import {
  listCategories, saveCategory, listProjects, saveProject, saveActivity, getActivity, updateActivity, deleteActivity, listTimeline,
  saveDiary, updateDiary, deleteDiary, listDiaries, saveGoal, listGoals, saveObservation, archiveGoal
} from './records.js';
import { listMedia, deleteMedia } from './media.js';
import { getDashboard } from './analytics.js';
import { sendModel } from './providers.js';
import { askChildQuestion, generateEvaluation, listChatSessions, listChatMessages, listEvaluations } from './ai.js';
import { exportBackup, importBackup } from './backup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(__dirname, '..');

export function sendJson(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}

export async function readJson(req, maxBytes = 1024 * 1024) {
  let text = '';
  for await (const chunk of req) {
    text += chunk;
    if (Buffer.byteLength(text) > maxBytes) throw Object.assign(new Error('请求内容过大'), { status: 413 });
  }
  try { return text ? JSON.parse(text) : {}; }
  catch { throw Object.assign(new Error('JSON 格式不正确'), { status: 400 }); }
}

function isLoopback(req) {
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
}

function serveStatic(req, res) {
  const root = path.join(projectDir, 'dist');
  const urlPath = decodeURIComponent(new URL(req.url, 'http://local').pathname);
  const candidate = path.resolve(root, `.${urlPath}`);
  const file = candidate.startsWith(root + path.sep) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()
    ? candidate : path.join(root, 'index.html');
  if (!fs.existsSync(file)) return sendJson(res, 404, { error: '请先运行构建命令' });
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' }[path.extname(file)] || 'application/octet-stream';
  res.writeHead(200, { 'content-type': `${mime}; charset=utf-8` });
  fs.createReadStream(file).pipe(res);
}

export function createApp({ dataDir = path.join(projectDir, 'data'), fetchImpl = fetch } = {}) {
  const store = openStore(dataDir);
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://local');
      if (url.pathname === '/api/health' && req.method === 'GET') return sendJson(res, 200, { ok: true });
      if (!url.pathname.startsWith('/api/')) return serveStatic(req, res);
      if (url.pathname === '/api/profile' && req.method === 'GET') return sendJson(res, 200, getProfile(store.db));
      if (url.pathname === '/api/profile' && req.method === 'PUT') return sendJson(res, 200, saveProfile(store.db, await readJson(req)));
      if (url.pathname === '/api/backup' && req.method === 'GET') return sendJson(res, 200, exportBackup(store.db, store.mediaDir));
      if (url.pathname === '/api/backup' && req.method === 'PUT') {
        if (!isLoopback(req)) return sendJson(res, 403, { error: '请在主机电脑上导入备份' });
        return sendJson(res, 200, importBackup(store.db, store.mediaDir, await readJson(req, 250 * 1024 * 1024)));
      }
      const sourceId = /^\/api\/sources\/([\w-]+)$/.exec(url.pathname)?.[1];
      if (sourceId && req.method === 'GET') {
        const activity = getActivity(store.db, sourceId);
        if (activity) return sendJson(res, 200, { type: '活动', ...activity });
        const diary = store.db.prepare("SELECT id,local_date AS localDate,COALESCE(NULLIF(occurred_at,''),created_at) AS occurredAt,text,mood FROM diary_entries WHERE id=?").get(sourceId);
        if (diary) return sendJson(res, 200, { type: '日记', ...diary });
        const progress = store.db.prepare(`SELECT o.id,o.observed_at AS observedAt,o.note,o.status,g.title,g.dimension FROM progress_observations o JOIN progress_goals g ON g.id=o.goal_id WHERE o.id=?`).get(sourceId);
        if (progress) return sendJson(res, 200, { type: '进度观察', ...progress });
        return sendJson(res, 404, { error: '原始记录已不存在' });
      }
      if (url.pathname === '/api/admin-status' && req.method === 'GET') return sendJson(res, 200, { local: isLoopback(req) });
      if (url.pathname === '/api/maas-config' && req.method === 'GET') return sendJson(res, 200, getMaasConfig(store.db));
      if (url.pathname === '/api/maas-config' && req.method === 'PUT') {
        if (!isLoopback(req)) return sendJson(res, 403, { error: '请在主机电脑上配置 MaaS' });
        return sendJson(res, 200, saveMaasConfig(store.db, await readJson(req)));
      }
      if (url.pathname === '/api/maas-test' && req.method === 'POST') {
        if (!isLoopback(req)) return sendJson(res, 403, { error: '请在主机电脑上测试 MaaS' });
        const config = getMaasConfig(store.db, true);
        if (!config) return sendJson(res, 422, { error: '请先配置 MaaS' });
        const answer = await sendModel(config, {
          system: '这是连接检查，不包含孩子资料。请简短回复“连接成功”。',
          messages: [{ role: 'user', content: '请确认连接。' }], maxTokens: 512
        }, fetchImpl);
        return sendJson(res, 200, { ok: true, answer });
      }
      if (url.pathname === '/api/chat-sessions' && req.method === 'GET') return sendJson(res, 200, listChatSessions(store.db));
      const chatSessionId = /^\/api\/chat-sessions\/([\w-]+)\/messages$/.exec(url.pathname)?.[1];
      if (chatSessionId && req.method === 'GET') return sendJson(res, 200, listChatMessages(store.db, chatSessionId));
      if (url.pathname === '/api/chat' && req.method === 'POST') {
        const config = getMaasConfig(store.db, true);
        if (!config) return sendJson(res, 422, { error: '请先配置 MaaS' });
        return sendJson(res, 200, await askChildQuestion(store.db, config, await readJson(req), fetchImpl));
      }
      if (url.pathname === '/api/evaluations' && req.method === 'GET') return sendJson(res, 200, listEvaluations(store.db));
      if (url.pathname === '/api/evaluations' && req.method === 'POST') {
        const config = getMaasConfig(store.db, true);
        if (!config) return sendJson(res, 422, { error: '请先配置 MaaS' });
        return sendJson(res, 201, await generateEvaluation(store.db, config, await readJson(req), fetchImpl));
      }
      if (url.pathname === '/api/dashboard' && req.method === 'GET') return sendJson(res, 200, getDashboard(store.db, {
        from: url.searchParams.get('from'), to: url.searchParams.get('to')
      }));
      if (url.pathname === '/api/categories' && req.method === 'GET') return sendJson(res, 200, listCategories(store.db));
      if (url.pathname === '/api/categories' && req.method === 'POST') return sendJson(res, 201, saveCategory(store.db, await readJson(req)));
      if (url.pathname === '/api/projects' && req.method === 'GET') return sendJson(res, 200, listProjects(store.db, url.searchParams.get('categoryId')));
      if (url.pathname === '/api/projects' && req.method === 'POST') return sendJson(res, 201, saveProject(store.db, await readJson(req)));
      if (url.pathname === '/api/activities' && req.method === 'GET') return sendJson(res, 200, listTimeline(store.db, {
        from: url.searchParams.get('from'), to: url.searchParams.get('to'), categoryId: url.searchParams.get('categoryId')
      }));
      if (url.pathname === '/api/activities' && req.method === 'POST') return sendJson(res, 201, saveActivity(store.db, await readJson(req)));
      const activityId = /^\/api\/activities\/([\w-]+)$/.exec(url.pathname)?.[1];
      if (activityId && req.method === 'PUT') return sendJson(res, 200, updateActivity(store.db, activityId, await readJson(req)));
      if (activityId && req.method === 'DELETE') {
        for (const item of listMedia(store.db, { activityId })) deleteMedia(store.db, store.mediaDir, item.id);
        return sendJson(res, 200, { deleted: deleteActivity(store.db, activityId) });
      }
      if (url.pathname === '/api/diaries' && req.method === 'GET') return sendJson(res, 200, listDiaries(store.db, {
        from: url.searchParams.get('from'), to: url.searchParams.get('to')
      }));
      if (url.pathname === '/api/diaries' && req.method === 'POST') return sendJson(res, 201, saveDiary(store.db, await readJson(req)));
      const diaryId = /^\/api\/diaries\/([\w-]+)$/.exec(url.pathname)?.[1];
      if (diaryId && req.method === 'PUT') return sendJson(res, 200, updateDiary(store.db, diaryId, await readJson(req)));
      if (diaryId && req.method === 'DELETE') {
        for (const item of listMedia(store.db, { diaryId })) deleteMedia(store.db, store.mediaDir, item.id);
        return sendJson(res, 200, { deleted: deleteDiary(store.db, diaryId) });
      }
      if (url.pathname === '/api/goals' && req.method === 'GET') return sendJson(res, 200, listGoals(store.db));
      if (url.pathname === '/api/goals' && req.method === 'POST') return sendJson(res, 201, saveGoal(store.db, await readJson(req)));
      const goalId = /^\/api\/goals\/([\w-]+)$/.exec(url.pathname)?.[1];
      if (goalId && req.method === 'DELETE') return sendJson(res, 200, { archived: archiveGoal(store.db, goalId) });
      if (url.pathname === '/api/observations' && req.method === 'POST') return sendJson(res, 201, saveObservation(store.db, await readJson(req)));
      return sendJson(res, 404, { error: '接口不存在' });
    } catch (error) {
      sendJson(res, error.status ?? 400, { error: error.message ?? '请求失败', ...(error.sessionId ? { sessionId: error.sessionId } : {}) });
    }
  });
  return {
    server, store,
    close: () => new Promise(resolve => server.close(() => { store.close(); resolve(); }))
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = createApp({ dataDir: process.env.DATA_DIR || path.join(projectDir, 'data') });
  const host = process.env.HOST || '127.0.0.1';
  const port = Number(process.env.PORT || 4173);
  app.server.listen(port, host, () => {
    console.log(`OctaSpace 已启动：http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
  });
}
