import { config } from './config.js';

// 调用 OpenAI 兼容接口，返回完整文本（本地实现：使用管理员配置的 endpoint/key，非云免密钥通道）
export async function chatComplete({ system, user, images = [] }) {
  const { baseUrl, apiKey, model, supportsVision } = config.llm;
  if (!baseUrl || !apiKey || !model) {
    throw new Error('未配置 LLM（LLM_BASE_URL / LLM_API_KEY / LLM_MODEL）。请在 .env 中填写你自己的 OpenAI 兼容接口。');
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

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, temperature: 0.3, response_format: { type: 'json_object' } }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`LLM HTTP ${res.status}: ${txt.slice(0, 500)}`);
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  return text;
}
