const $ = (id) => document.getElementById(id);
let currentPlan = null;

function log(msg) {
  const el = $('log');
  el.textContent += `[${new Date().toLocaleTimeString()}] ${msg}\n`;
  el.scrollTop = el.scrollHeight;
}

function val(id) { return $(id).value.trim(); }

async function postJSON(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

$('btnIntake').addEventListener('click', async () => {
  const requirementId = val('requirementId');
  if (!requirementId) { log('未填需求 ID，跳过拉取（将仅使用 PRD 文本）。'); return; }
  $('btnIntake').disabled = true;
  log('拉取需求中：' + requirementId);
  try {
    const { requirement } = await postJSON('/api/intake', { requirementId });
    $('reqCard').hidden = false;
    const links = (requirement.links || []).map((l) => `<a href="${l}" target="_blank">${l}</a>`).join('<br>') || '无';
    $('reqView').innerHTML = `
      <div><span class="k">编号：</span>${requirement.serialNumber} ｜ <span class="k">状态：</span>${requirement.status} ｜ <span class="k">模块：</span>${requirement.module}</div>
      <div style="margin-top:8px"><span class="k">标题：</span>${requirement.subject}</div>
      <div style="margin-top:8px;white-space:pre-wrap">${requirement.description ? requirement.description.slice(0, 800) : '(无正文文本，多为飞书/截图，请粘贴 PRD 或上传截图)'}</div>
      <div style="margin-top:8px"><span class="k">链接：</span><br>${links}</div>`;
    log('需求拉取成功：' + requirement.subject);
  } catch (e) {
    log('拉取失败：' + e.message);
  } finally {
    $('btnIntake').disabled = false;
  }
});

$('btnGenerate').addEventListener('click', async () => {
  $('btnGenerate').disabled = true;
  log('AI 生成测试用例中（调用 LLM）…');
  try {
    const fd = new FormData();
    fd.append('requirementId', val('requirementId'));
    fd.append('prdText', val('prdText'));
    const file = $('screenshot').files[0];
    if (file) fd.append('screenshot', file);
    const r = await fetch('/api/generate', { method: 'POST', body: fd });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    currentPlan = data.plan;
    renderPlan(currentPlan);
    $('planCard').hidden = false;
    $('btnRun').disabled = false;
    const n = currentPlan.cases?.length || 0;
    log(`用例生成完成：${n} 个用例` + (currentPlan.warnings?.length ? '（有告警，见下方）' : ''));
  } catch (e) {
    log('生成失败：' + e.message);
  } finally {
    $('btnGenerate').disabled = false;
  }
});

function renderPlan(plan) {
  const html = (plan.cases || []).map((c) => `
    <div class="plan-case">
      <span class="pri">${c.priority || ''}</span>
      <div class="t">${c.id} · ${c.title}</div>
      <div class="meta">预期：${c.expected || ''}</div>
      <div class="meta">前置：${(c.preconditions || []).join('；') || '无'}</div>
      <ol>${c.steps.map((s) => `<li>${s.action}${s.text ? '「' + s.text + '」' : ''}${s.selector ? ' ' + s.selector : ''}${s.value !== undefined ? ' = ' + s.value : ''}</li>`).join('')}</ol>
    </div>`).join('');
  const warns = (plan.warnings || []).length ? `<div class="warn">生成告警：${plan.warnings.join('；')}</div>` : '';
  $('planView').innerHTML = (plan.summary ? `<div class="meta">需求理解：${plan.summary}</div>` : '') + html + warns;
}

$('btnRun').addEventListener('click', async () => {
  if (!currentPlan) { log('请先生成测试用例'); return; }
  const baseUrl = val('baseUrl'); const username = val('username'); const password = val('password');
  if (!baseUrl || !username) { log('请填写测试地址与账号'); return; }
  $('btnRun').disabled = true;
  $('runCard').hidden = false;
  $('runStatus').textContent = '执行中…（Playwright 自动登录并逐步执行，请耐心等待）';
  log('开始执行：' + baseUrl + ' / ' + username);
  try {
    const { results, reportUrl } = await postJSON('/api/run', { plan: currentPlan, baseUrl, username, password });
    const t = results.totals;
    $('totals').innerHTML = `
      <div class="b">总数<b>${t.total}</b></div>
      <div class="b" style="color:#1a7f37">通过<b>${t.passed}</b></div>
      <div class="b" style="color:#cf222e">失败<b>${t.failed}</b></div>`;
    $('reportBox').hidden = false;
    $('reportFrame').src = reportUrl;
    $('runStatus').textContent = `执行完成：通过 ${t.passed} / 失败 ${t.failed} / 共 ${t.total}`;
    log(`执行完成：通过 ${t.passed}，失败 ${t.failed}`);
    (results.cases || []).forEach((c) => { if (c.status === 'failed') log(`  ✗ ${c.id} ${c.title}：${c.error}`); });
  } catch (e) {
    $('runStatus').textContent = '执行出错：' + e.message;
    log('执行出错：' + e.message);
  } finally {
    $('btnRun').disabled = false;
  }
});
