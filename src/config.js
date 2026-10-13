import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');

export const config = {
  port: parseInt(process.env.PORT || '8787', 10),
  llm: {
    baseUrl: (process.env.LLM_BASE_URL || '').replace(/\/$/, ''),
    apiKey: process.env.LLM_API_KEY || '',
    model: process.env.LLM_MODEL || '',
    supportsVision: String(process.env.LLM_SUPPORTS_VISION || 'false').toLowerCase() === 'true',
  },
  yunxiao: {
    token: process.env.YUNXIAO_TOKEN || '',
    org: process.env.YUNXIAO_ORG || '',
    project: process.env.YUNXIAO_PROJECT || '7d5f913802c9042432514c9441',
    base: (process.env.YUNXIAO_BASE || 'https://openapi-rdc.aliyuncs.com').replace(/\/$/, ''),
  },
  freighthouseSrc: process.env.FREIGHTHOUSE_SRC || '',
  generatedDir: path.join(ROOT, 'generated'),
};

export function ensureGeneratedDir() {
  if (!fs.existsSync(config.generatedDir)) fs.mkdirSync(config.generatedDir, { recursive: true });
  return config.generatedDir;
}
