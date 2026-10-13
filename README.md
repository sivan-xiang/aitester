# AI 自动测试工具（AI Test Kit）

给**测试人员**用的 Web 工具：填入**测试地址 / 账号密码 / 需求ID**，自动完成
**读取云效需求 → AI 生成测试用例 → Playwright 自动执行 → 生成 HTML 测试报告**。

针对系统：货代 OSS 财务后台（`freighthouse`，Vue + Element UI 微前端），云效项目 **WYWC 财务系统**。

---

## 一、它能做什么

1. **拉需求**：输入需求编号（如 `WYWC-12149`）或直接粘贴需求详情页 URL，自动从云效 projex 读取需求标题/状态/正文/截图链接。
2. **AI 生成用例**：把需求 + （测试员粘贴的 PRD / 上传的截图）+ 应用上下文（路由/菜单）交给大模型，产出**结构化测试用例 JSON**（只含白名单安全动作，不生成可执行代码）。
3. **自动执行**：服务端 Playwright 自动登录（填账号密码、等登录成功），按用例逐步执行点击/填写/断言，失败自动截图。
4. **出报告**：生成可视化 HTML 报告（通过率、每条用例、每步结果、失败截图）。

---

## 二、快速开始

```bash
# 1. 安装依赖
npm install
# 2. 下载浏览器（执行用例必需）
npm run install:browsers

# 3. 配置（复制后填写你自己的 LLM；云效 org/project 已内置本项目默认值）
cp .env.example .env

# 4.（可选）从 freighthouse 源码提取路由/菜单上下文，提升选择器准确度
#    在 .env 设置 FREIGHTHOUSE_SRC=E:/freighthouse 后：
npm run extract-context

# 5. 启动
npm start
# 打开 http://localhost:8787
```

> **LLM 说明**：本工具通过你自己的 **OpenAI 兼容接口**生成用例（免云密钥、无需开通任何云服务）。
> **推荐本地零成本方案 Ollama**（无需 key、完全离线）：
> ```bash
> # 安装 Ollama 后，拉取一个中文友好、支持结构化输出的模型
> ollama pull qwen2.5:7b
> ```
> 然后在 `.env` 配置：
> ```
> LLM_BASE_URL=http://localhost:11434/v1
> LLM_API_KEY=ollama          # Ollama 不校验，任意非空即可
> LLM_MODEL=qwen2.5:7b
> LLM_JSON_MODE=true           # 若模型不支持 json_object 报错，改为 false
> ```
> 也支持 DeepSeek / OpenAI / 通义等云端接口（填对应 key）。若模型支持图片，设 `LLM_SUPPORTS_VISION=true`，上传的截图会一并传入。
> 工具首页会自动检测 Ollama/LLM 是否就绪（模型是否拉取、是否运行），未就绪会给出提示。

> **云效令牌**：默认自动读取本机 `~/.workbuddy/mcp.json` 里 yunxiao 的 `YUNXIAO_ACCESS_TOKEN`，无需额外配置。
> 组织 ID `5f070913d2481460393369f3`、项目 `7d5f913802c9042432514c9441` 已内置默认值。

---

## 三、给测试人员的操作步骤

1. 打开 `http://localhost:8787`。
2. 填 **测试地址**（如 `http://lstest.com/#/dashboard`）、**账号**（admin）、**密码**（123456）。
3. 填 **需求ID** → 点「① 拉取需求」。若需求正文是飞书/截图，**粘贴 PRD 文本或上传截图**（强烈建议，能显著提升用例质量）。
4. 点「② AI 生成测试用例」→ 检查生成的用例是否合理。
5. 点「③ 执行测试」→ 等待执行，查看通过率与报告（报告内嵌截图）。

---

## 四、目录结构

```
ai-test-tool/
├─ server.js                 # Express 服务：/api/intake /api/generate /api/run
├─ src/
│  ├─ config.js              # 配置（.env）
│  ├─ yunxiao.js             # 云效 projex 需求拉取（搜索+详情）
│  ├─ llm.js                 # OpenAI 兼容 LLM 调用（支持图片）
│  ├─ plan.js                # 生成用例提示词 + JSON 解析校验（动作白名单）
│  ├─ runner.js              # Playwright 执行器（自动登录 + 动作解释器）
│  └─ report.js              # HTML 报告生成
├─ public/                   # 测试员前端页面
├─ scripts/
│  ├─ extract-context.mjs    # 从 freighthouse 源码提取路由/菜单上下文
│  ├─ mock-target.{mjs,html} # 本地模拟目标站点（无真实环境时验证 runner）
└─ generated/                # 产出：用例 JSON、app-context、截图、报告
```

---

## 五、用例 JSON 的动作白名单（安全设计）

大模型只能产出下列动作，runner 逐条解释执行，**不会执行任何模型生成的代码**：

| 动作 | 说明 |
|---|---|
| `login` | 用测试员账号密码自动登录 |
| `navigate` | 跳转页面 |
| `clickText` | 点击含某文字的菜单/按钮（按可见文字定位，鲁棒） |
| `click` | 按 CSS 选择器点击 |
| `fillText` | 按字段标签填写 |
| `fill` | 按 CSS 选择器填写 |
| `selectOption` | 下拉选择（兼容 Element UI el-select） |
| `assertText` | 断言元素文本包含某内容 |
| `assertVisible` | 断言元素可见 |
| `wait` | 等待元素或固定时长 |
| `screenshot` | 截图 |

---

## 六、已知限制与注意事项

- **登录域名**：`freighthouse` 的 token 写入域名写死 `.longsailing.net`。若测试地址是独立域名（如 `lstest.com`），cookie 可能不回传，但工具走 **UI 表单登录 + 等登录成功**，通常仍可用（token 多写入 localStorage）。如异常，请把测试环境配到 `*.longsailing.net` 或改 `src/utils/auth.js` 的 domain。
- **需求正文**：云效需求正文常为飞书文档/截图，OpenAPI 只能拿到标题和图片链接（图片需 Web 登录态，PAT 下载会 401）。**粘贴 PRD 或上传截图**是补齐正文的推荐做法。
- **选择器准确度**：建议运行 `npm run extract-context` 提供应用上下文；优先用 `clickText/fillText` 语义定位。
- **报告时效**：用例由大模型生成，关键断言建议人工复核后再纳入回归。

---

## 七、API 速览

- `POST /api/intake` `{requirementId}` → 需求详情
- `POST /api/generate`（multipart：`requirementId`、`prdText`、可选 `screenshot`）→ 用例 JSON
- `POST /api/run` `{plan, baseUrl, username, password}` → 执行结果 + 报告 URL
- `GET /generated/*` → 报告与截图
