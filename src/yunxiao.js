import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from './config.js';

// 读取 yunxiao 令牌：优先 env，回退到 ~/.workbuddy/mcp.json 的 yunxiao.env.YUNXIAO_ACCESS_TOKEN
function resolveToken() {
  if (config.yunxiao.token) return config.yunxiao.token;
  try {
    const mcpPath = path.join(os.homedir(), '.workbuddy', 'mcp.json');
    if (fs.existsSync(mcpPath)) {
      const mcp = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
      const t = mcp.mcpServers?.yunxiao?.env?.YUNXIAO_ACCESS_TOKEN;
      if (t) return t;
    }
  } catch (_) { /* ignore */ }
  return '';
}

// 组织 / 项目固定为本项目（云效 WYWC 财务系统）
function getOrg() {
  return config.yunxiao.org || '5f070913d2481460393369f3';
}
function getProject() {
  return config.yunxiao.project || '7d5f913802c9042432514c9441';
}

const HEADERS = () => ({ 'Content-Type': 'application/json', 'x-yunxiao-token': resolveToken() });

// 归一化输入：支持直接贴 URL / openWorkitemIdentifier / WYWC-编号 / 纯工作项 id
function normalizeInput(input) {
  const s = String(input || '').trim();
  const openMatch = s.match(/openWorkitemIdentifier=([0-9a-f]+)/i);
  if (openMatch) return { id: openMatch[1], serial: null };
  const serialMatch = s.match(/(WYWC-\d+)/i);
  if (serialMatch) return { id: null, serial: serialMatch[1].toUpperCase() };
  if (/^[0-9a-f]{20,}$/i.test(s)) return { id: s, serial: null };
  return { id: null, serial: s ? s.toUpperCase() : null };
}

async function searchPage(org, spaceId, page, perPage = 200) {
  const conditions = JSON.stringify({ conditionGroups: [] });
  const res = await fetch(`${config.yunxiao.base}/oapi/v1/projex/organizations/${org}/workitems:search`, {
    method: 'POST',
    headers: HEADERS(),
    body: JSON.stringify({
      category: 'Req', spaceId, spaceType: 'Project', conditions,
      orderBy: 'gmtCreate', sort: 'desc', page, perPage,
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`yunxiao 搜索 HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : (data.data || data.value || []);
}

// 将 WYWC 编号解析为工作项 id（分页查找 serialNumber）
async function resolveWorkitemId(serial, org) {
  const spaceId = getProject();
  for (let page = 1; page <= 6; page++) {
    const rows = await searchPage(org, spaceId, page, 200);
    const hit = rows.find((r) => r.serialNumber === serial || r.identifier === serial);
    if (hit) return hit.id;
    if (rows.length < 200) break;
  }
  throw new Error(`未在财务系统项目中找到需求 ${serial}。请确认编号，或直接粘贴需求详情页 URL（含 openWorkitemIdentifier）。`);
}

// 拉需求详情
export async function fetchRequirement(input, org) {
  const token = resolveToken();
  if (!token) throw new Error('未配置 YUNXIAO_TOKEN（在 .env 或 .workbuddy/mcp.json 的 yunxiao 配置中）。');
  org = org || getOrg();

  const { id: directId, serial } = normalizeInput(input);
  let id = directId;
  if (!id) id = await resolveWorkitemId(serial, org);

  const res = await fetch(`${config.yunxiao.base}/oapi/v1/projex/organizations/${org}/workitems/${id}`, {
    method: 'GET', headers: HEADERS(),
  });
  if (!res.ok) throw new Error(`yunxiao 详情 HTTP ${res.status}`);
  const data = await res.json();
  const item = data.value || data.data || data;
  const descObj = item.description;
  let desc = typeof descObj === 'string' ? descObj : (descObj?.htmlValue || descObj?.value || '');
  // 从正文 HTML 提取内嵌图片（截图）——PAT 无法下载，仅作提示
  const imgs = [...desc.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]);

  // 提取正文里的外链（多为飞书文档，API 无法读取其正文，仅作提示）
  const links = [];
  let i = desc.indexOf('http');
  while (i >= 0) {
    let j = i;
    while (j < desc.length && !' \n\r"\\\u3000'.includes(desc[j])) j++;
    links.push(desc.slice(i, j));
    i = desc.indexOf('http', j);
  }

  return {
    id: item.id || id,
    serialNumber: item.serialNumber || serial || '',
    subject: item.subject || item.title || '(无标题)',
    status: item.status?.displayName || item.status?.name || item.status || '',
    module: item.module || item.category || '',
    description: desc,
    images: [...new Set(imgs)],
    links: [...new Set(links)],
  };
}
