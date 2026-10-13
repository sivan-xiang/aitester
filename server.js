import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, config, ensureGeneratedDir } from './src/config.js';
import { fetchRequirement } from './src/yunxiao.js';
import { generatePlan } from './src/plan.js';
import { runPlan } from './src/runner.js';
import { buildReport } from './src/report.js';

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(ROOT, 'public')));

const genDir = ensureGeneratedDir();
app.use('/generated', express.static(genDir));

app.post('/api/intake', async (req, res) => {
  try {
    const { requirementId } = req.body || {};
    if (!requirementId) return res.status(400).json({ error: '请输入需求 ID' });
    const reqData = await fetchRequirement(requirementId);
    res.json({ requirement: reqData });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/generate', upload.single('screenshot'), async (req, res) => {
  try {
    const { requirementId, prdText } = req.body || {};
    let requirement = null;
    if (requirementId && requirementId.trim()) {
      requirement = await fetchRequirement(requirementId.trim());
    }
    const images = [];
    if (req.file) {
      images.push({ mime: req.file.mimetype || 'image/png', base64: req.file.buffer.toString('base64') });
    }
    const plan = await generatePlan({ requirement, prdText: prdText || '', images });
    const planFile = path.join(genDir, `plan-${Date.now()}.json`);
    fs.writeFileSync(planFile, JSON.stringify(plan, null, 2), 'utf8');
    res.json({ plan, planFile: path.basename(planFile) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/run', async (req, res) => {
  try {
    const { plan, baseUrl, username, password } = req.body || {};
    if (!plan) return res.status(400).json({ error: '缺少测试计划' });
    if (!baseUrl) return res.status(400).json({ error: '缺少测试地址' });
    const results = await runPlan(plan, { baseUrl, username, password });
    const reportFile = buildReport(results, plan);
    res.json({
      results,
      reportUrl: '/generated/' + path.basename(reportFile),
      reportFile: path.basename(reportFile),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(config.port, () => {
  console.log(`AI 自动测试工具已启动： http://localhost:${config.port}`);
  console.log(`LLM: ${config.llm.baseUrl || '(未配置)'} model=${config.llm.model || '-'}`);
  console.log(`yunxiao org: ${config.yunxiao.org || '(未配置)'}`);
});
