import path from 'node:path';
import {
  collectBenchmarkPayload,
  findPreviousBenchmarkPayload,
  renderBenchmarkDashboard,
  readBenchmarkPayload,
  writeBenchmarkArtifacts,
} from './screen-benchmark-lib.js';
import { writeFile } from 'node:fs/promises';

const DEFAULT_DIR = 'reports/benchmarks';
const args = new Set(process.argv.slice(2));
const latestJson = path.join(DEFAULT_DIR, 'latest.json');
const dashboardPath = path.join(DEFAULT_DIR, 'dashboard.md');
const historyDir = path.join(DEFAULT_DIR, 'history');

const payload = args.has('--from-latest')
  ? await readBenchmarkPayload(latestJson)
  : await collectBenchmarkPayload();

await writeBenchmarkArtifacts(payload, {
  outJson: latestJson,
  historyDir,
  saveHistory: !args.has('--no-history'),
});

const previous = await findPreviousBenchmarkPayload(historyDir, payload.generatedAt);
const dashboard = renderBenchmarkDashboard(payload, previous);
await writeFile(dashboardPath, dashboard);
console.log(`Benchmark dashboard written to ${dashboardPath}`);
