import fs from 'node:fs';
import path from 'node:path';
import { ensureGeneratedDir } from './config.js';

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

export function buildReport(results, plan) {
  const pass = results.totals.passed;
  const fail = results.totals.failed;
  const total = results.totals.total;
  const rate = total ? Math.round((pass / total) * 100) : 0;

  const casesHtml = results.cases.map((c) => {
    const stepsHtml = c.steps.map((s, i) => {
      const color = s.ok ? '#1a7f37' : '#cf222e';
      const mark = s.ok ? '✓' : '✗';
      const shot = s.screenshot ? `<a href="screenshots/${esc(s.screenshot)}" target="_blank">截图</a>` : '';
      return `<tr>
        <td>${i + 1}</td>
        <td style="color:${color}">${mark}</td>
        <td><code>${esc(s.action)}</code></td>
        <td>${esc(s.detail)}</td>
        <td>${shot}</td>
      </tr>`;
    }).join('');
    const caseColor = c.status === 'passed' ? '#1a7f37' : '#cf222e';
    const tag = c.status === 'passed' ? '通过' : '失败';
    return `<div class="case">
      <div class="case-head">
        <span class="badge" style="background:${caseColor}">${tag}</span>
        <strong>${esc(c.id)} · ${esc(c.title)}</strong>
        <span class="pri">${esc(c.priority)}</span>
      </div>
      <div class="meta">预期：${esc(c.expected)}</div>
      ${c.preconditions.length ? `<div class="meta">前置：${esc(c.preconditions.join('；'))}</div>` : ''}
      ${c.error ? `<div class="err">错误：${esc(c.error)}</div>` : ''}
      <table class="steps"><thead><tr><th>#</th><th>结果</th><th>动作</th><th>说明</th><th>截图</th></tr></thead><tbody>${stepsHtml}</tbody></table>
    </div>`;
  }).join('');

  const warns = (results.warnings || []).length
    ? `<div class="warn"><b>生成告警：</b><br>${results.warnings.map((w) => '· ' + esc(w)).join('<br>')}</div>` : '';

  const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AI 自动测试报告</title>
<style>
  body{font-family:-apple-system,Segoe UI,Roboto,'PingFang SC','Microsoft YaHei',sans-serif;margin:0;background:#f6f8fa;color:#1f2328}
  .wrap{max-width:1080px;margin:0 auto;padding:24px}
  h1{font-size:22px;margin:0 0 12px}
  .summary{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:18px}
  .card{background:#fff;border:1px solid #d0d7de;border-radius:10px;padding:14px 18px;min-width:120px;text-align:center}
  .card .n{font-size:26px;font-weight:700}
  .card.pass .n{color:#1a7f37}.card.fail .n{color:#cf222e}.card.rate .n{color:#0969da}
  .case{background:#fff;border:1px solid #d0d7de;border-radius:10px;padding:14px 16px;margin-bottom:14px}
  .case-head{display:flex;align-items:center;gap:10px}
  .badge{color:#fff;border-radius:6px;padding:2px 8px;font-size:12px}
  .pri{margin-left:auto;color:#656d76;font-size:12px}
  .meta{color:#57606a;font-size:13px;margin-top:6px}
  .err{color:#cf222e;font-size:13px;margin-top:6px}
  table.steps{width:100%;border-collapse:collapse;margin-top:10px;font-size:13px}
  table.steps th,table.steps td{border:1px solid #eaeef2;padding:6px 8px;text-align:left}
  table.steps th{background:#f6f8fa;color:#57606a}
  code{background:#eff1f3;padding:1px 5px;border-radius:4px;font-size:12px}
  .warn{background:#fff8c5;border:1px solid #d4a72c;border-radius:8px;padding:10px 12px;margin-bottom:14px;font-size:13px}
  a{color:#0969da}
  .foot{color:#8b949e;font-size:12px;margin-top:20px}
</style></head>
<body><div class="wrap">
  <h1>AI 自动测试报告</h1>
  <div class="summary">
    <div class="card"><div class="n">${total}</div><div>用例总数</div></div>
    <div class="card pass"><div class="n">${pass}</div><div>通过</div></div>
    <div class="card fail"><div class="n">${fail}</div><div>失败</div></div>
    <div class="card rate"><div class="n">${rate}%</div><div>通过率</div></div>
  </div>
  <div class="meta">测试地址：${esc(results.baseUrl)} ｜ 账号：${esc(results.username)} ｜ 开始：${esc(results.startedAt)} ｜ 结束：${esc(results.finishedAt)}</div>
  <div class="meta" style="margin-top:6px">需求理解：${esc(results.summary)}</div>
  ${warns}
  ${casesHtml}
  <div class="foot">由 AI 自动测试工具生成 · 用例由大模型根据需求生成，建议人工复核关键断言</div>
</div></body></html>`;

  const dir = ensureGeneratedDir();
  const file = path.join(dir, `report-${Date.now()}.html`);
  fs.writeFileSync(file, html, 'utf8');
  return file;
}
