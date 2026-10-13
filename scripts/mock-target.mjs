// 模拟目标站点（结构仿 freighthouse：UI 表单登录 + hash 路由 + Element-UI 风格菜单/表单），
// 用于在没有真实测试环境时验证 runner 的登录/点击/填写/断言链路。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = parseInt(process.env.PORT || '8799', 10);

const html = fs.readFileSync(path.join(__dirname, 'mock-target.html'), 'utf8');

http.createServer((req, res) => {
  // 统一返回 SPA 页面（hash 路由由客户端处理）
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}).listen(port, () => console.log(`mock target on http://localhost:${port}/#/dashboard`));
