export async function api(path, { method = 'GET', body, raw = false } = {}) {
  const response = await fetch(`/api${path}`, {
    method,
    headers: body && !raw ? { 'content-type': 'application/json' } : undefined,
    body: body ? raw ? body : JSON.stringify(body) : undefined
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || '请求失败，请稍后再试');
    error.status = response.status;
    error.sessionId = result.sessionId;
    throw error;
  }
  return result;
}

export const dayString = (date = new Date()) => {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};
export const daysAgo = (count) => dayString(new Date(Date.now() - count * 86400000));
export const dateLabel = (date) => new Date(`${date}T12:00:00`).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
export const timeLabel = (value) => value ? new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
