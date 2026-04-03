#!/usr/bin/env node
/**
 * Sync .mcp.json autoApprove list from the generated _registry.ts.
 *
 * Extracts all tool names from GENERATED_CORE_TOOLS, GENERATED_BRIDGE_TOOLS,
 * GENERATED_CUSTOM_TOOLS, and GENERATED_ENDPOINT_TOOLS, plus the meta tools
 * (load_toolset, unload_toolset, list_toolsets), and writes them into
 * .mcp.json → mcpServers.figcraft.autoApprove.
 *
 * Usage: node scripts/sync-auto-approve.mjs
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const registryPath = resolve(root, 'packages/core-mcp/src/tools/_registry.ts');
const mcpConfigPath = resolve(root, '.mcp.json');

// Skip in CI or when .mcp.json doesn't exist (it's gitignored)
if (!existsSync(mcpConfigPath)) {
  console.log('⏭️  .mcp.json not found (gitignored) — skipping autoApprove sync');
  process.exit(0);
}

// Extract all quoted tool names from Set/array declarations in _registry.ts
const registry = readFileSync(registryPath, 'utf8');
const toolNames = new Set();
for (const match of registry.matchAll(/'([a-z][a-z0-9_]*?)'/g)) {
  toolNames.add(match[1]);
}

// Add meta tools (not in registry but always registered)
for (const meta of ['load_toolset', 'unload_toolset', 'list_toolsets']) {
  toolNames.add(meta);
}

// Filter out non-tool entries (description strings, enum values, etc.)
// Tool names are lowercase with underscores, typically 3-40 chars
const filtered = [...toolNames].filter((n) => n.length >= 3 && n.length <= 50 && !n.includes(' ')).sort();

// Update .mcp.json
const mcpConfig = JSON.parse(readFileSync(mcpConfigPath, 'utf8'));
const serverKey = Object.keys(mcpConfig.mcpServers).find((k) => k === 'figcraft' || k.startsWith('figcraft'));

if (!serverKey) {
  console.error('❌ No figcraft server found in .mcp.json');
  process.exit(1);
}

const before = mcpConfig.mcpServers[serverKey].autoApprove?.length ?? 0;
mcpConfig.mcpServers[serverKey].autoApprove = filtered;

writeFileSync(mcpConfigPath, `${JSON.stringify(mcpConfig, null, 2)}\n`);
console.log(`✅ Updated .mcp.json autoApprove: ${before} → ${filtered.length} tools`);
