import { config } from './config.js';

// 调用 OpenAI 兼容接口，返回完整文本（本地实现：使用管理员配置的 endpoint/key，非云免密钥通道）。
// 兼容 Ollama（http://localhost:11434/v1，无需 key，可关闭 JSON 严格模式）。
export async function chatComplete({ system, user, images = [] }) {
  const { baseUrl, apiKey, model, supportsVision, jsonMode } = config.llm;
  if (!baseUrl || !model) {
    throw new Error('未配置 LLM（LLM_BASE_URL / LLM_MODEL）。请在 .env 填写：Ollama 用 http://localhost:11434/v1 + 任意 LLM_API_KEY，或 DeepSeek/OpenAI 等。');
  }

  const content = [];
  content.push({ type: 'text', text: user });
  if (supportsVision && images.length) {
    for (const img of images) {
      content.push({ type: 'image_url', image_url: { url: `data:${img.mime};base64,${img.base64}` } });
    }
  }

  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: content.length === 1 ? user : content },
  ];

  const body = { model, messages, temperature: 0.3 };
  // Ollama 等部分模型/端点不支持 json_object 严格模式；用 LLM_JSON_MODE=false 关闭
  if (jsonMode) body.response_format = { type: 'json_object' };

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`LLM HTTP ${res.status}: ${txt.slice(0, 500)}`);
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  return text;
}
