import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { chatComplete } from './llm.js';

export const ALLOWED_ACTIONS = new Set([
  'login', 'navigate', 'clickText', 'click', 'fillText', 'fill',
  'assertText', 'assertVisible', 'selectOption', 'wait', 'screenshot',
]);

const SYSTEM_PROMPT = `你是一名资深测试工程师，负责为一套后台管理系统（Vue + Element UI 微前端，货代 OSS 财务系统 freighthouse）根据需求文档自动生成 Web 端自动化测试用例。

【输出要求】只输出一个 JSON 对象，不要任何解释、不要代码块标记。结构严格如下：
{
  "summary": "对需求的理解摘要（1-3 句）",
  "cases": [
    {
      "id": "TC-01",
      "title": "用例标题",
      "priority": "P0 或 P1 或 P2",
      "preconditions": ["前置条件1"],
      "steps": [
        {"action": "login"},
        {"action": "navigate", "url": "可选，相对路径如 /#/finance/emplAbatement 或完整 URL"},
        {"action": "clickText", "text": "菜单或按钮上的可见文字"},
        {"action": "click", "selector": "CSS 选择器（仅在确知时使用）"},
        {"action": "fillText", "label": "输入框前的字段标签文字", "value": "要输入的值"},
        {"action": "fill", "selector": "CSS 选择器", "value": "要输入的值"},
        {"action": "selectOption", "selector": "CSS 选择器", "value": "选项文字或值"},
        {"action": "assertText", "selector": "CSS 选择器", "expectContains": "期望页面上出现的文字"},
        {"action": "assertVisible", "selector": "CSS 选择器"},
        {"action": "wait", "selector": "CSS 选择器（可选）", "timeout": 5000},
        {"action": "screenshot", "name": "截图名称"}
      ],
      "expected": "该用例的预期结果描述"
    }
  ]
}

【规则】
1. 每个用例的第一步通常是 {"action":"login"}（工具会用测试员提供的账号密码自动登录）。
2. 优先使用语义动作 clickText / fillText（按可见文字/标签定位），它们对 Element UI 更鲁棒；只在你非常确定 DOM 结构时才用 click / fill + 选择器。
3. 只能使用上面列出的 action，不得发明其它动作。不要生成任何可执行代码，只生成上述 JSON。
4. 用例覆盖：核心正常流程、关键校验点、1-2 个边界/异常。用例数量 3-8 个。
5. 每个步骤的 selector 尽量贴合 freighthouse 真实结构；若不确定，用 clickText/fillText 代替。
6. 断言（assertText/assertVisible）要指向需求真正验收点，避免无意义的断言。`;

function loadAppContext() {
  try {
    const p = path.join(config.generatedDir, 'app-context.json');
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
  } catch (_) {}
  return '';
}

export async function generatePlan({ requirement, prdText, images = [] }) {
  const ctx = loadAppContext();
  let user = '';
  if (requirement) {
    user += `【需求】\n编号：${requirement.serialNumber}\n标题：${requirement.subject}\n状态：${requirement.status}\n模块：${requirement.module}\n`;
    if (requirement.description) user += `需求正文：\n${requirement.description}\n`;
    if (requirement.links?.length) user += `相关链接（多为飞书文档，API 无法读取正文，仅供参考）：${requirement.links.join('\n')}\n`;
  }
  if (prdText && prdText.trim()) user += `\n【测试员补充的 PRD / 验收要点】\n${prdText.trim()}\n`;
  if (ctx) user += `\n【应用上下文（路由/菜单/已知选择器，帮助你写 selector）】\n${ctx}\n`;
  user += `\n请根据以上信息生成测试用例 JSON。`;

  const raw = await chatComplete({ system: SYSTEM_PROMPT, user, images });
  return parseAndValidate(raw);
}

export function parseAndValidate(raw) {
  let text = raw.trim();
  // 去除可能的 ```json 代码块
  if (text.startsWith('```')) {
    text = text.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();
  }
  let obj;
  try {
    obj = JSON.parse(text);
  } catch (err) {
    // 尝试截取第一个 { 到最后一个 }
    const s = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (s >= 0 && end > s) {
      obj = JSON.parse(text.slice(s, end + 1));
    } else {
      throw new Error('LLM 返回的不是合法 JSON：' + text.slice(0, 300));
    }
  }
  if (!Array.isArray(obj.cases)) throw new Error('用例 JSON 缺少 cases 数组');
  const warnings = [];
  obj.cases = obj.cases.map((c, idx) => {
    c.id = c.id || `TC-${String(idx + 1).padStart(2, '0')}`;
    c.steps = (c.steps || []).filter((s) => {
      if (!ALLOWED_ACTIONS.has(s.action)) {
        warnings.push(`用例 ${c.id} 含未知动作 "${s.action}"，已忽略`);
        return false;
      }
      return true;
    });
    return c;
  });
  obj.warnings = warnings;
  return obj;
}
