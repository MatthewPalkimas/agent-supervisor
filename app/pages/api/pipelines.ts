import type { NextApiRequest, NextApiResponse } from 'next';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const hubDir = path.join(os.homedir(), 'visualize-hub');

  if (req.method === 'DELETE') {
    const { name } = req.query;
    if (!name || typeof name !== 'string' || name.includes('..') || name.includes('/')) {
      return res.status(400).json({ error: 'Invalid pipeline name' });
    }
    const dir = path.join(hubDir, name);
    try {
      fs.rmSync(dir, { recursive: true });
      res.json({ ok: true });
    } catch {
      res.status(404).json({ error: 'Pipeline not found' });
    }
    return;
  }

  try {
    const entries = fs.readdirSync(hubDir, { withFileTypes: true });
    const pipelines = entries
      .filter(e => e.isDirectory() && fs.existsSync(path.join(hubDir, e.name, 'index.html')))
      .map(e => {
        const stat = fs.statSync(path.join(hubDir, e.name));
        return { name: e.name, addedAt: stat.birthtimeMs || stat.ctimeMs };
      });
    res.json({ pipelines });
  } catch {
    res.json({ pipelines: [] });
  }
}
