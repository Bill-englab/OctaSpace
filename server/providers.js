export class ProviderError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
  }
}

export function validateProviderConfig(config) {
  if (!['openai', 'anthropic'].includes(config.format)) throw new Error('请选择支持的 MaaS 协议');
  if (!String(config.model ?? '').trim()) throw new Error('请填写模型名称');
  if (!String(config.apiKey ?? '').trim()) throw new Error('请填写 MaaS 密钥');
  let url;
  try { url = new URL(config.baseUrl); } catch { throw new Error('MaaS 地址不正确'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) throw new Error('MaaS 地址必须使用 HTTPS，只有本机地址可用 HTTP');
  if (url.username || url.password || url.search || url.hash) throw new Error('MaaS 地址不能包含账号、查询参数或片段');
  return { ...config, baseUrl: url.toString().replace(/\/$/, ''), model: config.model.trim() };
}

export async function sendModel(config, { system, messages, maxTokens = 1800 }, fetchImpl = fetch) {
  const provider = validateProviderConfig(config);
  const endpoint = provider.format === 'openai' ? `${provider.baseUrl}/chat/completions` : `${provider.baseUrl}/v1/messages`;
  const headers = provider.format === 'openai'
    ? { 'content-type': 'application/json', authorization: `Bearer ${provider.apiKey}` }
    : { 'content-type': 'application/json', 'x-api-key': provider.apiKey, 'anthropic-version': '2023-06-01' };
  const body = provider.format === 'openai'
    ? { model: provider.model, messages: [{ role: 'system', content: system }, ...messages], max_tokens: maxTokens }
    : { model: provider.model, system, messages, max_tokens: maxTokens };
  let response;
  try {
    response = await fetchImpl(endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
  } catch (error) {
    throw new ProviderError(error?.name === 'TimeoutError' ? 'MaaS 响应超时' : '无法连接 MaaS 服务', 504);
  }
  if (!response.ok) {
    const label = response.status === 401 || response.status === 403 ? 'MaaS 认证失败，请检查密钥'
      : response.status === 429 ? 'MaaS 请求过于频繁，请稍后重试'
        : `MaaS 服务返回 ${response.status}`;
    throw new ProviderError(label, response.status);
  }
  let data;
  try { data = await response.json(); } catch { throw new ProviderError('MaaS 返回内容无法解析'); }
  const content = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? data?.content;
  const text = typeof content === 'string' ? content : Array.isArray(content)
    ? content.filter(x => x.type === 'text').map(x => x.text).join('') : '';
  if (!text.trim()) throw new ProviderError('MaaS 没有返回文字内容');
  return text.trim();
}
