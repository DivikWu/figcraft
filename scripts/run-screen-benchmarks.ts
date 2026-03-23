import path from 'node:path';
import { collectBenchmarkPayload, renderBenchmarkReport, writeBenchmarkArtifacts } from './screen-benchmark-lib.js';

const args = process.argv.slice(2);
const payload = await collectBenchmarkPayload();
const report = renderBenchmarkReport(payload);
const generationSummary = payload.logicPathSummary;

const latestJson = path.join('reports', 'benchmarks', 'latest.json');
const historyDir = path.join('reports', 'benchmarks', 'history');

if (args.includes('--out-default')) {
  await writeBenchmarkArtifacts(payload, {
    outJson: latestJson,
    historyDir,
    saveHistory: true,
  });
}

if (args.includes('--json')) {
  console.log(JSON.stringify(payload, null, 2));
  if (payload.summary.failed > 0 || (generationSummary && generationSummary.failed > 0)) process.exitCode = 1;
  process.exit();
}

console.log(report);
if (payload.summary.failed > 0 || (generationSummary && generationSummary.failed > 0)) {
  process.exitCode = 1;
}
