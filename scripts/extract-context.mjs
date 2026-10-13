// 从 freighthouse 前端源码静态提取路由标题 / 路径 / 视图目录，生成 app-context.json，
// 供 AI 生成用例时作为导航与选择器上下文。运行：node scripts/extract-context.mjs [源码根目录]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const src = process.argv[2] || process.env.FREIGHTHOUSE_SRC || '';

if (!src || !fs.existsSync(src)) {
  console.error('未找到 freighthouse 源码，请在 .env 设置 FREIGHTHOUSE_SRC 或传入参数。跳过上下文提取。');
  process.exit(0);
}

const IGNORE = new Set(['node_modules', 'dist', 'build', '.git', 'coverage', 'public']);
function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.(js|vue|ts)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

const files = walk(src);
const titles = new Set();
const paths = new Set();
const viewDirs = new Set();

const titleRe = /title\s*:\s*['"`]([^'"`]+)['"`]/g;
const pathRe = /path\s*:\s*['"`]([^'"`]+)['"`]/g;

for (const f of files) {
  let content = '';
  try { content = fs.readFileSync(f, 'utf8'); } catch { continue; }
  let m;
  while ((m = titleRe.exec(content))) titles.add(m[1]);
  while ((m = pathRe.exec(content))) { if (m[1].startsWith('/')) paths.add(m[1]); }
  if (f.includes(path.join('src', 'views'))) {
    const rel = path.relative(path.join(src, 'src', 'views'), f);
    const top = rel.split(path.sep)[0];
    if (top) viewDirs.add(top);
  }
}

const out = {
  source: src,
  titles: [...titles].filter((t) => /[一-龥]/.test(t)).slice(0, 200),
  paths: [...paths].slice(0, 200),
  viewDirs: [...viewDirs],
};
const outPath = path.join(ROOT, 'generated', 'app-context.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
console.log(`已生成 ${outPath}`);
console.log(`  标题 ${out.titles.length} 个，路径 ${out.paths.length} 个，视图目录 ${out.viewDirs.length} 个`);
