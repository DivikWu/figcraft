import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const moduleDump = execFileSync(
  process.execPath,
  [
    '--import',
    'tsx',
    '-e',
    `
import {
  GENERATED_TOOL_RESPONSE_EXAMPLES,
  GENERATED_ENDPOINT_METHOD_RESPONSE_EXAMPLES,
} from './packages/core-mcp/src/tools/_contracts.js';
import {
  GENERATED_FLAT_TOOL_MIGRATIONS,
} from './packages/core-mcp/src/tools/_registry.js';

console.log(JSON.stringify({
  GENERATED_TOOL_RESPONSE_EXAMPLES,
  GENERATED_ENDPOINT_METHOD_RESPONSE_EXAMPLES,
  GENERATED_FLAT_TOOL_MIGRATIONS,
}));
    `.trim(),
  ],
  {
    cwd: process.cwd(),
    encoding: 'utf-8',
  },
);

const {
  GENERATED_TOOL_RESPONSE_EXAMPLES,
  GENERATED_ENDPOINT_METHOD_RESPONSE_EXAMPLES,
  GENERATED_FLAT_TOOL_MIGRATIONS,
} = JSON.parse(moduleDump);

function renderJson(value) {
  return JSON.stringify(value, null, 2);
}

function renderToolSection() {
  const toolNames = Object.keys(GENERATED_TOOL_RESPONSE_EXAMPLES).sort();
  const lines = [
    '## Tool Response Coverage',
    '',
    `Covered flat/custom tools: ${toolNames.length}`,
    '',
  ];

  for (const toolName of toolNames) {
    const examples = GENERATED_TOOL_RESPONSE_EXAMPLES[toolName] ?? [];
    lines.push(`### \`${toolName}\``);
    lines.push('');
    lines.push(`- Example payloads: ${examples.length}`);
    if (examples.length > 0) {
      lines.push('');
      lines.push('```json');
      lines.push(renderJson(examples[0]));
      lines.push('```');
    }
    lines.push('');
  }

  return lines.join('\n');
}

function renderEndpointSection() {
  const endpointNames = Object.keys(GENERATED_ENDPOINT_METHOD_RESPONSE_EXAMPLES).sort();
  const lines = [
    '## Endpoint Response Coverage',
    '',
  ];

  let totalMethods = 0;
  for (const endpointName of endpointNames) {
    totalMethods += Object.keys(GENERATED_ENDPOINT_METHOD_RESPONSE_EXAMPLES[endpointName] ?? {}).length;
  }
  lines.push(`Covered endpoint methods: ${totalMethods}`);
  lines.push('');

  for (const endpointName of endpointNames) {
    const methods = GENERATED_ENDPOINT_METHOD_RESPONSE_EXAMPLES[endpointName] ?? {};
    for (const methodName of Object.keys(methods).sort()) {
      const examples = methods[methodName] ?? [];
      lines.push(`### \`${endpointName}.${methodName}\``);
      lines.push('');
      lines.push(`- Example payloads: ${examples.length}`);
      if (examples.length > 0) {
        lines.push('');
        lines.push('```json');
        lines.push(renderJson(examples[0]));
        lines.push('```');
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

function renderMigrationSection() {
  const flatTools = Object.keys(GENERATED_FLAT_TOOL_MIGRATIONS).sort();
  const lines = [
    '## Flat To Endpoint Migration Map',
    '',
    `Mapped flat tools: ${flatTools.length}`,
    '',
    '| Flat Tool | Replacement | Toolset | Write | Access |',
    '| --- | --- | --- | --- | --- |',
  ];

  for (const flatTool of flatTools) {
    const migration = GENERATED_FLAT_TOOL_MIGRATIONS[flatTool];
    lines.push(
      `| \`${flatTool}\` | \`${migration.endpoint}(method: "${migration.method}")\` | \`${migration.toolset}\` | \`${migration.write}\` | \`${migration.access ?? 'read'}\` |`,
    );
  }

  lines.push('');
  return lines.join('\n');
}

const outputPath = path.join('docs', 'generated', 'api-contracts.md');

const content = [
  '# FigCraft API Contracts',
  '',
  'This document is generated from `schema/tools.yaml`, `packages/core-mcp/src/tools/_contracts.ts`, and `packages/core-mcp/src/tools/_registry.ts`.',
  '',
  renderToolSection(),
  renderEndpointSection(),
  renderMigrationSection(),
].join('\n');

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, content, 'utf-8');
console.log(`API contract doc written to ${outputPath}`);
