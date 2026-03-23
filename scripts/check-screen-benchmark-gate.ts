import path from 'node:path';
import {
  DEFAULT_BENCHMARK_THRESHOLDS,
  collectBenchmarkPayload,
  evaluateBenchmarkGate,
  readBenchmarkPayload,
} from './screen-benchmark-lib.js';

const latestJson = path.join('reports', 'benchmarks', 'latest.json');
const useLatest = process.argv.includes('--from-latest');
const payload = useLatest
  ? await readBenchmarkPayload(latestJson)
  : await collectBenchmarkPayload();

const gate = evaluateBenchmarkGate(payload, DEFAULT_BENCHMARK_THRESHOLDS);

console.log('FigCraft benchmark gate');
console.log('=======================');
for (const check of gate.checks) {
  console.log(`${check.ok ? 'PASS' : 'FAIL'}  ${check.name}: actual=${check.actual} expected=${check.expected}`);
}

if (!gate.ok) {
  process.exitCode = 1;
}
