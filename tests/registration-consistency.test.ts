/**
 * Registration consistency tests — verifies that tool registration
 * in _registry.ts is internally consistent and that toolset assignments
 * match the expected conventions.
 *
 * Feature: endpoint-mode-refactor, Property 12: 注册文件与 Toolset 归属一致性
 * Validates: Requirements 9.2
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  GENERATED_CORE_TOOLS,
  GENERATED_TOOLSETS,
  GENERATED_ENDPOINT_TOOLS,
  GENERATED_ENDPOINT_REPLACES,
} from '../src/mcp-server/tools/_registry.js';

// ─── 1. get_reactions belongs to annotations toolset (not core / nodes) ───

describe('get_reactions toolset assignment', () => {
  it('get_reactions is in the annotations toolset', () => {
    const annotationsTools = GENERATED_TOOLSETS['annotations']?.tools ?? [];
    expect(annotationsTools).toContain('get_reactions');
  });

  it('get_reactions is NOT in GENERATED_CORE_TOOLS', () => {
    expect(GENERATED_CORE_TOOLS.has('get_reactions')).toBe(false);
  });

  it('get_reactions is NOT in any other toolset besides annotations', () => {
    for (const [name, toolset] of Object.entries(GENERATED_TOOLSETS)) {
      if (name === 'annotations') continue;
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

      expect(
        GENERATED_CORE_TOOLS.has(ep),
        `Endpoint tool "${ep}" should be in GENERATED_CORE_TOOLS`,
      ).toBe(true);
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

  it('every endpoint in GENERATED_ENDPOINT_REPLACES maps to existing flat tool names', () => {
    for (const [endpoint, replacedTools] of Object.entries(GENERATED_ENDPOINT_REPLACES)) {
      expect(
        GENERATED_ENDPOINT_TOOLS.has(endpoint),
        `Endpoint "${endpoint}" in ENDPOINT_REPLACES should be in ENDPOINT_TOOLS`,
      ).toBe(true);

      for (const flatTool of replacedTools) {
        expect(
          allKnownTools.has(flatTool),
          `Endpoint "${endpoint}" replaces "${flatTool}" which is not found in CORE_TOOLS or any TOOLSET`,
        ).toBe(true);
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
      fc.property(
        fc.constantFrom(...toolsetNames),
        (toolsetName) => {
          const tools = GENERATED_TOOLSETS[toolsetName].tools;
          const uniqueTools = new Set(tools);
          expect(
            uniqueTools.size,
            `Toolset "${toolsetName}" has duplicate tools: ${tools.filter((t, i) => tools.indexOf(t) !== i).join(', ')}`,
          ).toBe(tools.length);
        },
      ),
      { numRuns: Math.max(100, toolsetNames.length * 10) },
    );
  });
});
