import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { config, ensureGeneratedDir } from './config.js';

const STEP_TIMEOUT = 15000;

function appBaseOf(baseUrl) {
  return baseUrl.split('#')[0].replace(/\/$/, '');
}

async function clickByText(page, text) {
  const tries = [
    () => page.getByRole('button', { name: text, exact: false }),
    () => page.getByRole('link', { name: text, exact: false }),
    () => page.getByRole('menuitem', { name: text, exact: false }),
    () => page.locator('.el-menu-item, .el-submenu__title').filter({ hasText: text }),
    () => page.getByText(text, { exact: false }),
  ];
  for (const t of tries) {
    const loc = t();
    const n = await loc.count();
    for (let i = 0; i < n; i++) {
      const el = loc.nth(i);
      try { if (await el.isVisible()) { await el.click({ timeout: 3000 }); return; } } catch (_) {}
    }
  }
  throw new Error(`找不到可点击元素（文字："${text}"）`);
}

async function fillByLabel(page, label, value) {
  try {
    const byLabel = page.getByLabel(label, { exact: false });
    if (await byLabel.count()) { await byLabel.first().fill(value); return; }
  } catch (_) {}
  try {
    const byPh = page.getByPlaceholder(label, { exact: false });
    if (await byPh.count()) { await byPh.first().fill(value); return; }
  } catch (_) {}
  const inputs = page.locator('input, textarea');
  const n = await inputs.count();
  for (let i = 0; i < n; i++) {
    const inp = inputs.nth(i);
    const id = await inp.getAttribute('id');
    if (id) {
      const lab = page.locator(`label[for="${id}"]`);
      if (await lab.count()) {
        const txt = (await lab.first().innerText()).replace(/\s+/g, '');
        if (txt.includes(label.replace(/\s+/g, ''))) { await inp.fill(value); return; }
      }
    }
  }
  throw new Error(`找不到输入字段（标签："${label}"）`);
}

async function selectOption(page, selector, value) {
  const el = page.locator(selector).first();
  await el.click();
  const opt = page.locator('.el-select-dropdown__item, .el-cascader-node, li.el-select-dropdown__item').filter({ hasText: value });
  if (await opt.count()) { await opt.first().click(); return; }
  // 原生 select 兜底
  try { await page.locator(selector).selectOption({ label: value }); return; } catch (_) {}
  throw new Error(`找不到下拉选项（"${value}"）`);
}

async function doLogin(page, appBase, username, password) {
  await page.goto(appBase, { waitUntil: 'domcontentloaded' });
  // 若已在登录页或跳转到了登录页
  await page.waitForSelector('input', { timeout: STEP_TIMEOUT });
  const passVisible = await page.locator('input[type="password"]').count();
  if (!passVisible) return; // 已经登录
  const userInput = page.locator('input[type="text"], input:not([type])').first();
  const passInput = page.locator('input[type="password"]').first();
  await userInput.fill(username);
  await passInput.fill(password);
  // 提交按钮：含"登录/提交/Sign"文字，或第一个 primary 按钮
  let submitted = false;
  const btns = page.locator('button');
  const bn = await btns.count();
  for (let i = 0; i < bn; i++) {
    const b = btns.nth(i);
    const txt = (await b.innerText().catch(() => '')).replace(/\s+/g, '');
    if (/登录|提交|sign|signin|登入/i.test(txt)) { await b.click(); submitted = true; break; }
  }
  if (!submitted) { const primary = page.locator('button.el-button--primary, .el-button--primary').first(); if (await primary.count()) await primary.click(); }
  // 等待登录成功：密码框消失
  try {
    await page.waitForSelector('input[type="password"]', { state: 'hidden', timeout: 20000 });
  } catch (_) {
    throw new Error('登录失败：提交后仍在登录页，请检查账号/密码或登录表单结构');
  }
}

async function runStep(page, step, ctx, outDir, caseId) {
  const record = { action: step.action, raw: JSON.stringify(step), ok: true, detail: '' };
  const shot = async (name) => {
    const f = path.join(outDir, `${caseId}-${name}.png`);
    await page.screenshot({ path: f, fullPage: false });
    return path.basename(f);
  };
  try {
    switch (step.action) {
      case 'login':
        await doLogin(page, ctx.appBase, ctx.username, ctx.password);
        record.detail = '已登录';
        break;
      case 'navigate': {
        const url = step.url || '';
        const target = url.startsWith('http') ? url : (ctx.appBase + (url.startsWith('/') ? url : '/' + url));
        await page.goto(target, { waitUntil: 'domcontentloaded' });
        record.detail = `跳转 ${target}`;
        break;
      }
      case 'clickText':
        await clickByText(page, step.text);
        record.detail = `点击文字「${step.text}」`;
        break;
      case 'click':
        await page.locator(step.selector).first().click({ timeout: STEP_TIMEOUT });
        record.detail = `点击 ${step.selector}`;
        break;
      case 'fillText':
        await fillByLabel(page, step.label, step.value ?? '');
        record.detail = `填写「${step.label}」= ${step.value}`;
        break;
      case 'fill':
        await page.locator(step.selector).first().fill(step.value ?? '', { timeout: STEP_TIMEOUT });
        record.detail = `填写 ${step.selector} = ${step.value}`;
        break;
      case 'selectOption':
        await selectOption(page, step.selector, step.value ?? '');
        record.detail = `选择 ${step.selector} = ${step.value}`;
        break;
      case 'assertText': {
        const txt = (await page.locator(step.selector).first().innerText({ timeout: STEP_TIMEOUT })).replace(/\s+/g, '');
        const exp = String(step.expectContains ?? '').replace(/\s+/g, '');
        if (!txt.includes(exp)) throw new Error(`断言失败：选择器 ${step.selector} 文本「${txt}」不包含「${exp}」`);
        record.detail = `断言文本包含「${step.expectContains}」 ✓`;
        break;
      }
      case 'assertVisible':
        await page.locator(step.selector).first().waitFor({ state: 'visible', timeout: STEP_TIMEOUT });
        record.detail = `可见 ${step.selector} ✓`;
        break;
      case 'wait':
        if (step.selector) await page.locator(step.selector).first().waitFor({ state: 'visible', timeout: step.timeout || 5000 });
        else await page.waitForTimeout(step.timeout || 1000);
        record.detail = `等待 ${step.selector || (step.timeout || 1000) + 'ms'}`;
        break;
      case 'screenshot':
        record.detail = '截图 ' + (await shot(step.name || 'shot'));
        break;
      default:
        throw new Error(`未知动作：${step.action}`);
    }
  } catch (e) {
    record.ok = false;
    record.error = e.message;
    record.detail = record.detail + ' ❌ ' + e.message;
    try { record.screenshot = await shot('FAIL'); } catch (_) {}
  }
  return record;
}

export async function runPlan(plan, opts) {
  const { baseUrl, username, password } = opts;
  const appBase = appBaseOf(baseUrl);
  const outDir = path.join(ensureGeneratedDir(), 'screenshots');
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(STEP_TIMEOUT);

  const ctx = { appBase, username, password };
  const results = {
    baseUrl, username, appBase,
    summary: plan.summary || '',
    warnings: plan.warnings || [],
    startedAt: new Date().toISOString(),
    cases: [],
    totals: { total: 0, passed: 0, failed: 0 },
  };

  let loggedIn = false;
  for (const c of plan.cases) {
    const caseRes = {
      id: c.id, title: c.title, priority: c.priority, preconditions: c.preconditions || [],
      expected: c.expected || '', steps: [], status: 'passed', error: '',
    };
    for (const step of c.steps) {
      if (step.action === 'login' && loggedIn) {
        caseRes.steps.push({ action: 'login', raw: '{}', ok: true, detail: '已登录（复用会话）' });
        continue;
      }
      const r = await runStep(page, step, ctx, outDir, c.id);
      caseRes.steps.push(r);
      if (step.action === 'login' && r.ok) loggedIn = true;
      if (!r.ok) { caseRes.status = 'failed'; caseRes.error = r.error; break; }
    }
    results.cases.push(caseRes);
  }

  results.finishedAt = new Date().toISOString();
  results.totals.total = results.cases.length;
  results.totals.passed = results.cases.filter((c) => c.status === 'passed').length;
  results.totals.failed = results.cases.filter((c) => c.status === 'failed').length;

  await browser.close();
  return results;
}
