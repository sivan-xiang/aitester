// 无真实测试环境时，用 mock-target 验证 runner 全链路：登录/点击/填写/断言/截图。
import { runPlan } from '../src/runner.js';
import { buildReport } from '../src/report.js';

const baseUrl = process.env.TARGET_URL || 'http://localhost:8799/#/dashboard';
const username = process.env.T_USER || 'admin';
const password = process.env.T_PASS || '123456';

const plan = {
  summary: '（冒烟）登录后进入薪酬绩效，编辑直客客户T量完成率并保存，断言保存成功',
  cases: [
    {
      id: 'TC-01', title: '登录并进入薪酬绩效', priority: 'P0',
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
};

const results = await runPlan(plan, { baseUrl, username, password });
console.log('总计', results.totals.total, '通过', results.totals.passed, '失败', results.totals.failed);
results.cases.forEach((c) => {
  console.log(`[${c.status === 'passed' ? 'PASS' : 'FAIL'}] ${c.id} ${c.title}`);
  c.steps.forEach((s) => console.log(`   ${s.ok ? '✓' : '✗'} ${s.action} :: ${s.detail}`));
});
const reportFile = buildReport(results, plan);
console.log('报告：', reportFile);
