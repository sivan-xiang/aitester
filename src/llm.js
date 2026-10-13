import { config } from './config.js';

// 演示/自检模式下的内置用例：无需真实 LLM，返回一套可跑通 mock-target 的示例计划。
// 仅用于验证「生成 → 执行 → 报告」全链路，不代表真实需求覆盖。
function mockPlanText(user) {
  let ref = '';
  const sn = user && user.match(/编号[：:]\s*([A-Za-z0-9-]+)/);
  const title = user && user.match(/标题[：:]\s*(.+)/);
  if (sn || title) {
    ref = `（基于${(sn && sn[1]) || '需求'} ${(title && title[1] ? '· ' + title[1].trim().slice(0, 24) : '')}）`;
  }
  return JSON.stringify({
    summary: `（演示 / Mock 模式，未调用真实 LLM）自动生成的示例用例${ref}。演示流程：登录 → 进入薪酬绩效 → 填写完成率 → 保存 → 断言成功提示。配置真实 LLM（Ollama / DeepSeek 等）后可生成贴合实际需求的用例。`,
    cases: [
      {
        id: 'TC-01', title: '登录系统并进入首页', priority: 'P0',
        preconditions: ['账号可登录'],
        steps: [
          { action: 'login' },
          { action: 'assertVisible', selector: '.menu' },
        ],
        expected: '登录成功，看到左侧菜单',
      },
      {
        id: 'TC-02', title: '编辑直客客户T量完成率并保存', priority: 'P1',
        preconditions: ['已登录'],
        steps: [
          { action: 'clickText', text: '薪酬绩效' },
          { action: 'assertVisible', selector: '#rate' },
          { action: 'fillText', label: '直客客户T量完成率', value: '0.85' },
          { action: 'clickText', text: '保存' },
          { action: 'assertText', selector: '.el-message', expectContains: '保存成功' },
        ],
        expected: '保存成功提示出现',
      },
    ],
  }, null, 2);
}

// 调用 OpenAI 兼容接口，返回完整文本（本地实现：使用管理员配置的 endpoint/key，非云免密钥通道）。
// 兼容 Ollama（http://localhost:11434/v1，无需 key，可关闭 JSON 严格模式）。
export async function chatComplete({ system, user, images = [] }) {
  // 演示模式：直接返回内置示例计划，不发起任何网络请求。
  if (config.llm.mock) return mockPlanText(user);

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
