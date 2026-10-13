// 端到端自检：在 LLM_MOCK=true 下走完「生成 → 执行 → 报告」全链路。
// 需要一个已启动的 aitester（默认 8791）与 mock-target 静态服务（默认 8799）。
import { config } from '../src/config.js';

const BASE = process.env.BASE || 'http://127.0.0.1:8791';
const TARGET = process.env.TARGET || 'http://127.0.0.1:8799/mock-target.html#/dashboard';

async function j(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${data.error || ''}`);
  return data;
}

const st = await (await fetch(`${BASE}/api/llm/status`)).json();
console.log('① LLM 状态:', JSON.stringify(st));

const gen = await j(`${BASE}/api/generate`, { prdText: '放开【直客客户T量完成率】可编辑，保存后回显最新值。' });
if (!gen.plan || !Array.isArray(gen.plan.cases)) throw new Error('generate 未返回 plan');
console.log(`② 生成用例: ${gen.plan.cases.length} 个 | 概要: ${gen.plan.summary.slice(0, 36)}…`);

const run = await j(`${BASE}/api/run`, {
  plan: gen.plan, baseUrl: TARGET, username: 'admin', password: '123456',
});
const t = run.results.totals;
console.log(`③ 执行结果: 共 ${t.total} / 通过 ${t.passed} / 失败 ${t.failed}`);
run.results.cases.forEach((c) => {
  console.log(`   [${c.status === 'passed' ? 'PASS' : 'FAIL'}] ${c.id} ${c.title}`);
  c.steps.forEach((s) => console.log(`      ${s.ok ? '✓' : '✗'} ${s.action} :: ${s.detail}`));
});
console.log('④ 报告:', run.reportUrl);

if (t.failed > 0) { console.error('❌ 存在失败用例'); process.exit(1); }
console.log('✅ 端到端自检通过');
