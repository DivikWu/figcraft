/**
 * Registration consistency tests — verifies that tool registration
 * in _registry.ts is internally consistent and that toolset assignments
 * match the expected conventions.
 *
 * Feature: endpoint-mode-refactor, Property 12: 注册文件与 Toolset 归属一致性
 * Validates: Requirements 9.2
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  GENERATED_BRIDGE_TOOLS,
  GENERATED_CORE_TOOLS,
  GENERATED_CUSTOM_TOOLS,
  GENERATED_ENDPOINT_REPLACES,
  GENERATED_ENDPOINT_TOOLS,
  GENERATED_REMOVED_TOOLS,
  GENERATED_TOOLSETS,
} from '../../packages/core-mcp/src/tools/_registry.js';

// ─── 1. get_reactions belongs to prototype toolset (not core / nodes) ───

describe('get_reactions toolset assignment', () => {
  it('get_reactions is in the prototype toolset', () => {
    const prototypeTools = GENERATED_TOOLSETS.prototype?.tools ?? [];
    expect(prototypeTools).toContain('get_reactions');
  });

  it('get_reactions is NOT in GENERATED_CORE_TOOLS', () => {
    expect(GENERATED_CORE_TOOLS.has('get_reactions')).toBe(false);
  });

  it('get_reactions is NOT in any other toolset besides prototype', () => {
    for (const [name, toolset] of Object.entries(GENERATED_TOOLSETS)) {
      if (name === 'prototype') continue;
      expect(toolset.tools).not.toContain('get_reactions');
    }
  });
});

// ─── 2. No overlap between toolset tools and core tools (except endpoints) ───

describe('toolset vs core tool overlap', () => {
  it('every tool in GENERATED_TOOLSETS is NOT in GENERATED_CORE_TOOLS (except endpoint tools)', () => {
    for (const [toolsetName, toolset] of Object.entries(GENERATED_TOOLSETS)) {
      for (const tool of toolset.tools) {
        if (GENERATED_ENDPOINT_TOOLS.has(tool)) continue; // endpoints can be in both
        expect(
          GENERATED_CORE_TOOLS.has(tool),
          `Tool "${tool}" from toolset "${toolsetName}" should not be in GENERATED_CORE_TOOLS`,
        ).toBe(false);
      }
    }
  });
});

// ─── 3. No tool duplicated across multiple toolsets ───

describe('no cross-toolset duplication for core tools', () => {
  it('every tool in GENERATED_CORE_TOOLS appears in at most one toolset', () => {
    for (const coreTool of GENERATED_CORE_TOOLS) {
      const foundIn: string[] = [];
      for (const [name, toolset] of Object.entries(GENERATED_TOOLSETS)) {
        if (toolset.tools.includes(coreTool)) {
          foundIn.push(name);
        }
      }
      expect(
        foundIn.length,
        `Core tool "${coreTool}" found in multiple toolsets: ${foundIn.join(', ')}`,
      ).toBeLessThanOrEqual(1);
    }
  });
});

// ─── 4. GENERATED_ENDPOINT_TOOLS are all in GENERATED_CORE_TOOLS ───

describe('endpoint tools are core tools', () => {
  it('every GENERATED_ENDPOINT_TOOL is in GENERATED_CORE_TOOLS', () => {
    for (const ep of GENERATED_ENDPOINT_TOOLS) {
      // Endpoint tools that belong to a toolset (not core) are excluded
      // Only core endpoints (nodes, text, shapes, components) must be in CORE_TOOLS
      // Toolset endpoints (variables_ep, styles_ep) may or may not be in core
      const isToolsetEndpoint = Object.entries(GENERATED_TOOLSETS).some(
        ([, ts]) => ts.tools.includes(ep) && !GENERATED_CORE_TOOLS.has(ep),
      );
      if (isToolsetEndpoint) continue;

      expect(GENERATED_CORE_TOOLS.has(ep), `Endpoint tool "${ep}" should be in GENERATED_CORE_TOOLS`).toBe(true);
    }
  });
});

// ─── 5. GENERATED_ENDPOINT_REPLACES maps to valid flat tool names ───

describe('endpoint replaces mapping validity', () => {
  // Collect all known tool names (core + all toolsets)
  const allKnownTools = new Set<string>(GENERATED_CORE_TOOLS);
  for (const toolset of Object.values(GENERATED_TOOLSETS)) {
    for (const tool of toolset.tools) {
      allKnownTools.add(tool);
    }
  }

  it('every endpoint in GENERATED_ENDPOINT_REPLACES references valid endpoint tools', () => {
    for (const [endpoint, replacedTools] of Object.entries(GENERATED_ENDPOINT_REPLACES)) {
      expect(
        GENERATED_ENDPOINT_TOOLS.has(endpoint),
        `Endpoint "${endpoint}" in ENDPOINT_REPLACES should be in ENDPOINT_TOOLS`,
      ).toBe(true);

      // Replaced flat tools may no longer exist in CORE_TOOLS/TOOLSETS (Phase 3 removal)
      // but they should still be valid tool name strings
      for (const flatTool of replacedTools) {
        expect(typeof flatTool).toBe('string');
        expect(flatTool.length).toBeGreaterThan(0);
      }
    }
  });

  it('every GENERATED_ENDPOINT_TOOL has an entry in GENERATED_ENDPOINT_REPLACES', () => {
    for (const ep of GENERATED_ENDPOINT_TOOLS) {
      expect(
        GENERATED_ENDPOINT_REPLACES,
        `Endpoint "${ep}" should have an entry in GENERATED_ENDPOINT_REPLACES`,
      ).toHaveProperty(ep);
    }
  });

  it('every replaced flat tool has a reverse entry in GENERATED_REMOVED_TOOLS', () => {
    for (const [endpoint, replacedTools] of Object.entries(GENERATED_ENDPOINT_REPLACES)) {
      for (const flatTool of replacedTools) {
        expect(
          GENERATED_REMOVED_TOOLS,
          `Flat tool "${flatTool}" should have a removal entry for endpoint "${endpoint}"`,
        ).toHaveProperty(flatTool);
        expect(GENERATED_REMOVED_TOOLS[flatTool]?.endpoint).toBe(endpoint);
      }
    }
  });

  it('reverse removal entries point back to a valid endpoint replacement', () => {
    for (const [flatTool, removal] of Object.entries(GENERATED_REMOVED_TOOLS)) {
      expect(GENERATED_ENDPOINT_TOOLS.has(removal.endpoint)).toBe(true);
      expect(GENERATED_ENDPOINT_REPLACES[removal.endpoint]).toContain(flatTool);
      expect(typeof removal.method).toBe('string');
      expect(removal.method.length).toBeGreaterThan(0);
    }
  });
});

// ─── 6. Property test: no duplicate tools within any toolset ───

describe('Feature: endpoint-mode-refactor, Property 12: 注册文件与 Toolset 归属一致性', () => {
  const toolsetNames = Object.keys(GENERATED_TOOLSETS);

  it('for any toolset name from GENERATED_TOOLSETS, all its tools are unique (no duplicates within a toolset)', () => {
    /**
     * Validates: Requirements 9.2
     *
     * Property: for any toolset, the tool list contains no duplicate entries.
     * We use fast-check to sample from the actual toolset names.
     */
    fc.assert(
      fc.property(fc.constantFrom(...toolsetNames), (toolsetName) => {
        const tools = GENERATED_TOOLSETS[toolsetName].tools;
        const uniqueTools = new Set(tools);
        expect(
          uniqueTools.size,
          `Toolset "${toolsetName}" has duplicate tools: ${tools.filter((t, i) => tools.indexOf(t) !== i).join(', ')}`,
        ).toBe(tools.length);
      }),
      { numRuns: Math.max(100, toolsetNames.length * 10) },
    );
  });
});

// ─── 7. Hand-written registration files should only register custom tools ───

describe('hand-written registration files', () => {
  const toolsDir = join(process.cwd(), 'packages/core-mcp/src/tools');
  const excludedFiles = new Set([
    '_generated.ts',
    '_registry.ts',
    '_contracts.ts',
    'toolset-manager.ts',
    'endpoints.ts',
    'help.ts',
  ]);

  function getHandWrittenRegistrations(): Map<string, string[]> {
    const registrations = new Map<string, string[]>();

    for (const file of readdirSync(toolsDir)) {
      if (!file.endsWith('.ts') || excludedFiles.has(file)) continue;
      const src = readFileSync(join(toolsDir, file), 'utf8');
      const names = [...src.matchAll(/server\.(?:tool|registerTool)\(\s*'([^']+)'/g)].map((m) => m[1]);
      if (names.length > 0) registrations.set(file, names);
    }

    return registrations;
  }

  it('hand-written registration files only register GENERATED_CUSTOM_TOOLS', () => {
    for (const [file, toolNames] of getHandWrittenRegistrations()) {
      for (const toolName of toolNames) {
        expect(
          GENERATED_CUSTOM_TOOLS.has(toolName),
          `${file} should only register custom tools, but found "${toolName}"`,
        ).toBe(true);
      }
    }
  });

  it('every GENERATED_CUSTOM_TOOL is covered by a hand-written registration file', () => {
    const registered = new Set<string>();
    for (const toolNames of getHandWrittenRegistrations().values()) {
      for (const toolName of toolNames) registered.add(toolName);
    }

    for (const toolName of GENERATED_CUSTOM_TOOLS) {
      expect(registered.has(toolName), `missing hand-written registration for custom tool "${toolName}"`).toBe(true);
    }
  });

  it('GENERATED_BRIDGE_TOOLS and GENERATED_CUSTOM_TOOLS do not overlap', () => {
    for (const toolName of GENERATED_BRIDGE_TOOLS) {
      expect(GENERATED_CUSTOM_TOOLS.has(toolName), `tool "${toolName}" cannot be both bridge and custom`).toBe(false);
    }
  });
});
