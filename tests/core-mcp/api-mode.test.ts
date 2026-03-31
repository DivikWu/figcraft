/**
 * Tests for endpoint-mode tool enable/disable behavior.
 *
 * Tests the logic using the generated registry data structures directly,
 * similar to how access-control.test.ts tests access control logic without
 * module reloading.
 *
 * **Validates: Requirements 12.5**
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  GENERATED_CORE_TOOLS,
  GENERATED_TOOLSETS,
  GENERATED_ENDPOINT_TOOLS,
  GENERATED_ENDPOINT_REPLACES,
  GENERATED_REMOVED_TOOLS,
} from '../../packages/core-mcp/src/tools/_registry.js';

// ─── Helpers: simulate what toolset-manager does ───

/** Standalone tools: in CORE_TOOLS but not an endpoint and not replaced by any endpoint. */
function getStandaloneTools(): Set<string> {
  const allReplaced = new Set<string>();
  for (const replaces of Object.values(GENERATED_ENDPOINT_REPLACES)) {
    for (const t of replaces) allReplaced.add(t);
  }
  const standalone = new Set<string>();
  for (const tool of GENERATED_CORE_TOOLS) {
    if (!GENERATED_ENDPOINT_TOOLS.has(tool) && !allReplaced.has(tool)) {
      standalone.add(tool);
    }
  }
  return standalone;
}

/**
 * Simulate endpoint mode: replaced flat tools (that are core) are disabled,
 * core endpoint tools are re-enabled.
 * Returns the set of tools that would be disabled by API mode logic.
 */
function simulateEndpointModeDisabled(): Set<string> {
  const disabled = new Set<string>();
  for (const replaces of Object.values(GENERATED_ENDPOINT_REPLACES)) {
    for (const flatTool of replaces) {
      if (GENERATED_CORE_TOOLS.has(flatTool)) {
        disabled.add(flatTool);
      }
    }
  }
  return disabled;
}

/**
 * Simulate load_toolset — returns which tools would be enabled vs skipped.
 */
function simulateLoadToolset(
  toolsetName: string,
): { enabled: string[]; skipped: string[] } {
  const def = GENERATED_TOOLSETS[toolsetName];
  if (!def) return { enabled: [], skipped: [] };

  const enabled: string[] = [];
  const skipped: string[] = [];

  const allReplaced = new Set<string>();
  for (const replaces of Object.values(GENERATED_ENDPOINT_REPLACES)) {
    for (const t of replaces) allReplaced.add(t);
  }

  for (const tool of def.tools) {
    if (!GENERATED_ENDPOINT_TOOLS.has(tool) && allReplaced.has(tool)) {
      skipped.push(tool);
    } else {
      enabled.push(tool);
    }
  }

  return { enabled, skipped };
}

// ─── Endpoint mode tool enable/disable ───

describe('endpoint mode tool enable/disable', () => {
  const disabled = simulateEndpointModeDisabled();

  it('does not disable endpoint tools', () => {
    for (const ep of GENERATED_ENDPOINT_TOOLS) {
      expect(disabled.has(ep)).toBe(false);
    }
  });

  it('standalone tools remain enabled', () => {
    const standalone = getStandaloneTools();
    for (const tool of standalone) {
      expect(disabled.has(tool)).toBe(false);
    }
  });

  it('only disables flat tools that appear in GENERATED_ENDPOINT_REPLACES', () => {
    const allReplaced = new Set<string>();
    for (const replaces of Object.values(GENERATED_ENDPOINT_REPLACES)) {
      for (const t of replaces) allReplaced.add(t);
    }
    for (const t of disabled) {
      expect(allReplaced.has(t)).toBe(true);
    }
  });
});

// ─── Standalone tools are never disabled ───

describe('standalone tools are never disabled', () => {
  const standalone = getStandaloneTools();
  const expectedStandalone = [
    'ping', 'get_mode', 'set_mode', 'get_design_guidelines', 'audit_node',
    'join_channel', 'get_channel', 'export_image', 'lint_fix_all',
    'set_current_page', 'save_version_history', 'set_selection',
    'get_selection', 'get_current_page', 'get_document_info',
    'list_fonts',
  ];

  it('known standalone tools are in the standalone set', () => {
    for (const tool of expectedStandalone) {
      if (GENERATED_CORE_TOOLS.has(tool)) {
        expect(standalone.has(tool)).toBe(true);
      }
    }
  });

  it('standalone tools are not disabled in endpoint mode', () => {
    const endpointDisabled = simulateEndpointModeDisabled();
    for (const tool of standalone) {
      expect(endpointDisabled.has(tool)).toBe(false);
    }
  });
});

// ─── load_toolset awareness ───

describe('load_toolset endpoint awareness', () => {
  it('variables toolset: enables variables_ep endpoint tool', () => {
    const { enabled } = simulateLoadToolset('variables');
    expect(enabled).toContain('variables_ep');
  });

  it('styles toolset: enables styles_ep endpoint tool', () => {
    const { enabled } = simulateLoadToolset('styles');
    expect(enabled).toContain('styles_ep');
  });

  it('toolsets without replaced tools are unaffected', () => {
    const { skipped: tokensSkipped } = simulateLoadToolset('tokens');
    expect(tokensSkipped.length).toBe(0);

    const { skipped: authSkipped } = simulateLoadToolset('auth');
    expect(authSkipped.length).toBe(0);
  });

  it('non-replaced flat tools in a toolset are still enabled', () => {
    const { enabled } = simulateLoadToolset('variables');
    const variablesReplaces = new Set(GENERATED_ENDPOINT_REPLACES['variables_ep'] ?? []);
    const nonReplacedEnabled = enabled.filter(
      t => !GENERATED_ENDPOINT_TOOLS.has(t) && !variablesReplaces.has(t),
    );
    expect(nonReplacedEnabled.length).toBeGreaterThan(0);
  });

  it('unknown toolset returns empty arrays', () => {
    const { enabled, skipped } = simulateLoadToolset('nonexistent');
    expect(enabled.length).toBe(0);
    expect(skipped.length).toBe(0);
  });
});

// ─── Registry consistency checks ───

describe('API mode registry consistency', () => {
  it('every endpoint tool has an entry in GENERATED_ENDPOINT_REPLACES', () => {
    for (const ep of GENERATED_ENDPOINT_TOOLS) {
      expect(GENERATED_ENDPOINT_REPLACES[ep]).toBeDefined();
      expect(GENERATED_ENDPOINT_REPLACES[ep].length).toBeGreaterThan(0);
    }
  });

  it('GENERATED_ENDPOINT_REPLACES only references known endpoint tools', () => {
    for (const ep of Object.keys(GENERATED_ENDPOINT_REPLACES)) {
      expect(GENERATED_ENDPOINT_TOOLS.has(ep)).toBe(true);
    }
  });

  it('replaced flat tools are tracked in GENERATED_REMOVED_TOOLS', () => {
    for (const [, replaces] of Object.entries(GENERATED_ENDPOINT_REPLACES)) {
      for (const flatTool of replaces) {
        expect(GENERATED_REMOVED_TOOLS[flatTool]).toBeDefined();
      }
    }
  });

  it('GENERATED_REMOVED_TOOLS contains 31 removed flat tools', () => {
    expect(Object.keys(GENERATED_REMOVED_TOOLS).length).toBe(31);
  });

  it('each removed tool has correct endpoint and method', () => {
    for (const [toolName, info] of Object.entries(GENERATED_REMOVED_TOOLS)) {
      expect(info.endpoint).toBeTruthy();
      expect(info.method).toBeTruthy();
      expect(GENERATED_ENDPOINT_TOOLS.has(info.endpoint)).toBe(true);
    }
  });

  it('endpoint tools that are core are in GENERATED_CORE_TOOLS', () => {
    const coreEndpoints = ['nodes', 'text', 'components'];
    for (const ep of coreEndpoints) {
      expect(GENERATED_CORE_TOOLS.has(ep)).toBe(true);
    }
  });

  it('toolset endpoint tools are in their respective toolset', () => {
    expect(GENERATED_TOOLSETS['variables'].tools).toContain('variables_ep');
    expect(GENERATED_TOOLSETS['styles'].tools).toContain('styles_ep');
  });
});

// ─── Property Tests ───

describe('Property: endpoint mode tool enable/disable correctness', () => {
  const coreToolsArray = [...GENERATED_CORE_TOOLS];
  const endpointToolsArray = [...GENERATED_ENDPOINT_TOOLS];
  const allToolNames = [...new Set([...coreToolsArray, ...endpointToolsArray])];

  const arbToolName = fc.constantFrom(...allToolNames);

  it('replaced flat tools disabled, endpoint tools enabled', () => {
    const disabled = simulateEndpointModeDisabled();
    const allReplaced = new Set<string>();
    for (const replaces of Object.values(GENERATED_ENDPOINT_REPLACES)) {
      for (const t of replaces) allReplaced.add(t);
    }

    fc.assert(
      fc.property(arbToolName, (toolName) => {
        if (GENERATED_ENDPOINT_TOOLS.has(toolName)) {
          expect(disabled.has(toolName)).toBe(false);
        } else if (allReplaced.has(toolName) && GENERATED_CORE_TOOLS.has(toolName)) {
          expect(disabled.has(toolName)).toBe(true);
        } else if (GENERATED_CORE_TOOLS.has(toolName) && !allReplaced.has(toolName)) {
          expect(disabled.has(toolName)).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe('Property: load_toolset endpoint awareness', () => {
  const toolsetNames = Object.keys(GENERATED_TOOLSETS);
  const arbToolsetName = fc.constantFrom(...toolsetNames);

  it('no replaced flat tool should appear in the enabled list', () => {
    const allReplaced = new Set<string>();
    for (const replaces of Object.values(GENERATED_ENDPOINT_REPLACES)) {
      for (const t of replaces) allReplaced.add(t);
    }

    fc.assert(
      fc.property(arbToolsetName, (toolsetName) => {
        const { enabled } = simulateLoadToolset(toolsetName);
        for (const tool of enabled) {
          if (!GENERATED_ENDPOINT_TOOLS.has(tool)) {
            expect(allReplaced.has(tool)).toBe(false);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('enabled + skipped covers all toolset tools', () => {
    fc.assert(
      fc.property(arbToolsetName, (toolsetName) => {
        const def = GENERATED_TOOLSETS[toolsetName];
        const { enabled, skipped } = simulateLoadToolset(toolsetName);
        const combined = new Set([...enabled, ...skipped]);
        for (const tool of def.tools) {
          expect(combined.has(tool)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });
});
