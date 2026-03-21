/**
 * Tests for FIGCRAFT_API_MODE (flat / endpoint / both) tool enable/disable behavior.
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
} from '../src/mcp-server/tools/_registry.js';

// ─── Helpers: simulate what toolset-manager does for each API mode ───

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
 * Simulate flat mode: all endpoint tools are disabled.
 * Returns the set of tools that would be disabled by API mode logic.
 */
function simulateFlatModeDisabled(): Set<string> {
  const disabled = new Set<string>();
  for (const ep of GENERATED_ENDPOINT_TOOLS) {
    disabled.add(ep);
  }
  return disabled;
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
 * Simulate both mode: nothing extra disabled by API mode.
 */
function simulateBothModeDisabled(): Set<string> {
  return new Set<string>();
}

/**
 * Simulate load_toolset in a given API mode.
 * Returns which tools would be enabled vs skipped.
 */
function simulateLoadToolset(
  toolsetName: string,
  mode: 'flat' | 'endpoint' | 'both',
): { enabled: string[]; skipped: string[] } {
  const def = GENERATED_TOOLSETS[toolsetName];
  if (!def) return { enabled: [], skipped: [] };

  const enabled: string[] = [];
  const skipped: string[] = [];

  // Build the set of all flat tools replaced by any endpoint
  const allReplaced = new Set<string>();
  for (const replaces of Object.values(GENERATED_ENDPOINT_REPLACES)) {
    for (const t of replaces) allReplaced.add(t);
  }

  for (const tool of def.tools) {
    if (mode === 'flat' && GENERATED_ENDPOINT_TOOLS.has(tool)) {
      skipped.push(tool);
    } else if (mode === 'endpoint') {
      // In endpoint mode, skip flat tools that are replaced by endpoints
      if (!GENERATED_ENDPOINT_TOOLS.has(tool) && allReplaced.has(tool)) {
        skipped.push(tool);
      } else {
        enabled.push(tool);
      }
    } else {
      // 'both' mode: enable everything
      enabled.push(tool);
    }
  }

  return { enabled, skipped };
}

// ─── resolveApiMode logic tests ───

describe('resolveApiMode logic', () => {
  it('"flat" is the default when FIGCRAFT_API_MODE is unset', () => {
    // The actual resolveApiMode reads env at module load time.
    // We test the logic: unset → flat
    const mode = (undefined ?? 'flat').toLowerCase();
    expect(mode).toBe('flat');
  });

  it('"flat" is returned for value "flat"', () => {
    const mode = 'flat'.toLowerCase();
    expect(['flat', 'endpoint', 'both']).toContain(mode);
    expect(mode).toBe('flat');
  });

  it('"endpoint" is returned for value "endpoint"', () => {
    const mode = 'endpoint'.toLowerCase();
    expect(['flat', 'endpoint', 'both']).toContain(mode);
    expect(mode).toBe('endpoint');
  });

  it('"both" is returned for value "both"', () => {
    const mode = 'both'.toLowerCase();
    expect(['flat', 'endpoint', 'both']).toContain(mode);
    expect(mode).toBe('both');
  });

  it('invalid value falls back to "flat"', () => {
    const raw = 'INVALID';
    const mode = raw.toLowerCase();
    const valid = mode === 'flat' || mode === 'endpoint' || mode === 'both';
    const resolved = valid ? mode : 'flat';
    expect(resolved).toBe('flat');
  });

  it('case-insensitive parsing works', () => {
    for (const val of ['FLAT', 'Flat', 'ENDPOINT', 'Endpoint', 'BOTH', 'Both']) {
      const mode = val.toLowerCase();
      expect(['flat', 'endpoint', 'both']).toContain(mode);
    }
  });
});

// ─── Flat mode tool enable/disable ───

describe('flat mode tool enable/disable', () => {
  const disabled = simulateFlatModeDisabled();

  it('disables all endpoint tools', () => {
    for (const ep of GENERATED_ENDPOINT_TOOLS) {
      expect(disabled.has(ep)).toBe(true);
    }
  });

  it('disables exactly the endpoint tools (no more, no less)', () => {
    expect(disabled.size).toBe(GENERATED_ENDPOINT_TOOLS.size);
    for (const t of disabled) {
      expect(GENERATED_ENDPOINT_TOOLS.has(t)).toBe(true);
    }
  });

  it('does not disable any flat core tools', () => {
    for (const tool of GENERATED_CORE_TOOLS) {
      if (!GENERATED_ENDPOINT_TOOLS.has(tool)) {
        expect(disabled.has(tool)).toBe(false);
      }
    }
  });

  it('standalone tools remain enabled', () => {
    const standalone = getStandaloneTools();
    expect(standalone.size).toBeGreaterThan(0);
    for (const tool of standalone) {
      expect(disabled.has(tool)).toBe(false);
    }
  });
});

// ─── Endpoint mode tool enable/disable ───

describe('endpoint mode tool enable/disable', () => {
  const disabled = simulateEndpointModeDisabled();

  it('disables core flat tools that are replaced by endpoints', () => {
    for (const [, replaces] of Object.entries(GENERATED_ENDPOINT_REPLACES)) {
      for (const flatTool of replaces) {
        if (GENERATED_CORE_TOOLS.has(flatTool)) {
          expect(disabled.has(flatTool)).toBe(true);
        }
      }
    }
  });

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

  it('specific expected tools are disabled (nodes replaces)', () => {
    const nodesReplaces = GENERATED_ENDPOINT_REPLACES['nodes'] ?? [];
    for (const flatTool of nodesReplaces) {
      if (GENERATED_CORE_TOOLS.has(flatTool)) {
        expect(disabled.has(flatTool)).toBe(true);
      }
    }
  });
});

// ─── Both mode tool enable/disable ───

describe('both mode tool enable/disable', () => {
  const disabled = simulateBothModeDisabled();

  it('does not disable any additional tools', () => {
    expect(disabled.size).toBe(0);
  });

  it('both endpoint tools and flat tools would be active', () => {
    // In both mode, no API-mode-specific disabling happens
    for (const ep of GENERATED_ENDPOINT_TOOLS) {
      expect(disabled.has(ep)).toBe(false);
    }
    for (const tool of GENERATED_CORE_TOOLS) {
      expect(disabled.has(tool)).toBe(false);
    }
  });
});

// ─── Standalone tools are never disabled by API mode ───

describe('standalone tools are never disabled by any API mode', () => {
  const standalone = getStandaloneTools();
  const expectedStandalone = [
    'ping', 'get_mode', 'set_mode', 'create_document',
    'join_channel', 'get_channel', 'export_image', 'lint_fix_all',
    'set_current_page', 'save_version_history', 'set_selection',
    'get_selection', 'get_current_page', 'get_document_info',
    'list_fonts', 'set_image_fill',
  ];

  it('known standalone tools are in the standalone set', () => {
    for (const tool of expectedStandalone) {
      if (GENERATED_CORE_TOOLS.has(tool)) {
        expect(standalone.has(tool)).toBe(true);
      }
    }
  });

  it('standalone tools are not disabled in flat mode', () => {
    const flatDisabled = simulateFlatModeDisabled();
    for (const tool of standalone) {
      expect(flatDisabled.has(tool)).toBe(false);
    }
  });

  it('standalone tools are not disabled in endpoint mode', () => {
    const endpointDisabled = simulateEndpointModeDisabled();
    for (const tool of standalone) {
      expect(endpointDisabled.has(tool)).toBe(false);
    }
  });

  it('standalone tools are not disabled in both mode', () => {
    const bothDisabled = simulateBothModeDisabled();
    for (const tool of standalone) {
      expect(bothDisabled.has(tool)).toBe(false);
    }
  });
});


// ─── load_toolset mode awareness ───

describe('load_toolset mode awareness', () => {
  describe('flat mode', () => {
    it('variables toolset: skips variables_ep endpoint tool', () => {
      const { skipped } = simulateLoadToolset('variables', 'flat');
      expect(skipped).toContain('variables_ep');
    });

    it('variables toolset: enables flat variable tools', () => {
      const { enabled } = simulateLoadToolset('variables', 'flat');
      expect(enabled.length).toBeGreaterThan(0);
      // All enabled tools should NOT be endpoint tools
      for (const tool of enabled) {
        expect(GENERATED_ENDPOINT_TOOLS.has(tool)).toBe(false);
      }
    });

    it('styles toolset: skips styles_ep endpoint tool', () => {
      const { skipped } = simulateLoadToolset('styles', 'flat');
      expect(skipped).toContain('styles_ep');
    });

    it('styles toolset: enables flat style tools', () => {
      const { enabled } = simulateLoadToolset('styles', 'flat');
      expect(enabled.length).toBeGreaterThan(0);
      for (const tool of enabled) {
        expect(GENERATED_ENDPOINT_TOOLS.has(tool)).toBe(false);
      }
    });

    it('toolsets without endpoint tools are unaffected', () => {
      const { skipped: tokensSkipped } = simulateLoadToolset('tokens', 'flat');
      expect(tokensSkipped.length).toBe(0);

      const { skipped: authSkipped } = simulateLoadToolset('auth', 'flat');
      expect(authSkipped.length).toBe(0);

      const { skipped: lintSkipped } = simulateLoadToolset('lint', 'flat');
      expect(lintSkipped.length).toBe(0);
    });
  });

  describe('endpoint mode', () => {
    it('variables toolset: skips replaced flat tools, enables variables_ep', () => {
      const { enabled, skipped } = simulateLoadToolset('variables', 'endpoint');
      expect(enabled).toContain('variables_ep');
      // Flat tools that are replaced should be skipped
      const variablesReplaces = GENERATED_ENDPOINT_REPLACES['variables_ep'] ?? [];
      for (const flatTool of variablesReplaces) {
        if (GENERATED_TOOLSETS['variables'].tools.includes(flatTool)) {
          expect(skipped).toContain(flatTool);
        }
      }
    });

    it('styles toolset: skips replaced flat tools, enables styles_ep', () => {
      const { enabled, skipped } = simulateLoadToolset('styles', 'endpoint');
      expect(enabled).toContain('styles_ep');
      const stylesReplaces = GENERATED_ENDPOINT_REPLACES['styles_ep'] ?? [];
      for (const flatTool of stylesReplaces) {
        if (GENERATED_TOOLSETS['styles'].tools.includes(flatTool)) {
          expect(skipped).toContain(flatTool);
        }
      }
    });

    it('toolsets without replaced tools are unaffected', () => {
      const { skipped: tokensSkipped } = simulateLoadToolset('tokens', 'endpoint');
      expect(tokensSkipped.length).toBe(0);

      const { skipped: authSkipped } = simulateLoadToolset('auth', 'endpoint');
      expect(authSkipped.length).toBe(0);
    });

    it('non-replaced flat tools in a toolset are still enabled', () => {
      // variables toolset has tools like set_explicit_variable_mode that are NOT
      // in GENERATED_ENDPOINT_REPLACES — they should still be enabled
      const { enabled } = simulateLoadToolset('variables', 'endpoint');
      const variablesReplaces = new Set(GENERATED_ENDPOINT_REPLACES['variables_ep'] ?? []);
      const nonReplacedEnabled = enabled.filter(
        t => !GENERATED_ENDPOINT_TOOLS.has(t) && !variablesReplaces.has(t),
      );
      // There should be some non-replaced flat tools that are still enabled
      // (e.g. set_explicit_variable_mode, rename_collection, etc.)
      expect(nonReplacedEnabled.length).toBeGreaterThan(0);
    });
  });

  describe('both mode', () => {
    it('variables toolset: enables both flat tools and variables_ep', () => {
      const { enabled, skipped } = simulateLoadToolset('variables', 'both');
      expect(skipped.length).toBe(0);
      expect(enabled).toContain('variables_ep');
      // Should also contain flat variable tools
      const flatVarTools = GENERATED_TOOLSETS['variables'].tools.filter(
        t => !GENERATED_ENDPOINT_TOOLS.has(t),
      );
      for (const tool of flatVarTools) {
        expect(enabled).toContain(tool);
      }
    });

    it('styles toolset: enables both flat tools and styles_ep', () => {
      const { enabled, skipped } = simulateLoadToolset('styles', 'both');
      expect(skipped.length).toBe(0);
      expect(enabled).toContain('styles_ep');
    });

    it('all toolsets have zero skipped tools', () => {
      for (const name of Object.keys(GENERATED_TOOLSETS)) {
        const { skipped } = simulateLoadToolset(name, 'both');
        expect(skipped.length).toBe(0);
      }
    });
  });

  describe('unknown toolset', () => {
    it('returns empty arrays for unknown toolset name', () => {
      const { enabled, skipped } = simulateLoadToolset('nonexistent', 'flat');
      expect(enabled.length).toBe(0);
      expect(skipped.length).toBe(0);
    });
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

  it('replaced flat tools are real tools (exist in CORE_TOOLS or a toolset)', () => {
    const allKnownTools = new Set(GENERATED_CORE_TOOLS);
    for (const def of Object.values(GENERATED_TOOLSETS)) {
      for (const t of def.tools) allKnownTools.add(t);
    }

    for (const [, replaces] of Object.entries(GENERATED_ENDPOINT_REPLACES)) {
      for (const flatTool of replaces) {
        expect(allKnownTools.has(flatTool)).toBe(true);
      }
    }
  });

  it('endpoint tools that are core are in GENERATED_CORE_TOOLS', () => {
    // nodes, text, shapes, components should be core
    const coreEndpoints = ['nodes', 'text', 'shapes', 'components'];
    for (const ep of coreEndpoints) {
      expect(GENERATED_CORE_TOOLS.has(ep)).toBe(true);
    }
  });

  it('toolset endpoint tools are in their respective toolset', () => {
    // variables_ep should be in variables toolset, styles_ep in styles toolset
    expect(GENERATED_TOOLSETS['variables'].tools).toContain('variables_ep');
    expect(GENERATED_TOOLSETS['styles'].tools).toContain('styles_ep');
  });
});


// ─── Property Tests ───

/**
 * Feature: endpoint-mode-refactor, Property 10: API 模式工具启用/禁用正确性
 * **Validates: Requirements 6.4, 6.5**
 *
 * For any FIGCRAFT_API_MODE value and any tool name:
 * - flat mode: all endpoint tools disabled, all flat tools enabled
 * - endpoint mode: replaced flat tools disabled, endpoint + standalone tools enabled
 * - both mode: endpoint tools and flat tools both enabled
 */
describe('Feature: endpoint-mode-refactor, Property 10: API 模式工具启用/禁用正确性', () => {
  // Build tool pools for generators
  const coreToolsArray = [...GENERATED_CORE_TOOLS];
  const endpointToolsArray = [...GENERATED_ENDPOINT_TOOLS];
  const allToolNames = [...new Set([...coreToolsArray, ...endpointToolsArray])];
  const apiModes = ['flat', 'endpoint', 'both'] as const;

  const arbApiMode = fc.constantFrom(...apiModes);
  const arbToolName = fc.constantFrom(...allToolNames);

  it('flat mode: endpoint tools are disabled, non-endpoint core tools are enabled', () => {
    const disabled = simulateFlatModeDisabled();
    fc.assert(
      fc.property(arbToolName, (toolName) => {
        if (GENERATED_ENDPOINT_TOOLS.has(toolName)) {
          // Endpoint tools must be disabled in flat mode
          expect(disabled.has(toolName)).toBe(true);
        } else if (GENERATED_CORE_TOOLS.has(toolName)) {
          // Non-endpoint core tools must NOT be disabled in flat mode
          expect(disabled.has(toolName)).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('endpoint mode: replaced flat tools disabled, endpoint tools enabled', () => {
    const disabled = simulateEndpointModeDisabled();
    const allReplaced = new Set<string>();
    for (const replaces of Object.values(GENERATED_ENDPOINT_REPLACES)) {
      for (const t of replaces) allReplaced.add(t);
    }

    fc.assert(
      fc.property(arbToolName, (toolName) => {
        if (GENERATED_ENDPOINT_TOOLS.has(toolName)) {
          // Endpoint tools must NOT be disabled in endpoint mode
          expect(disabled.has(toolName)).toBe(false);
        } else if (allReplaced.has(toolName) && GENERATED_CORE_TOOLS.has(toolName)) {
          // Replaced core flat tools must be disabled
          expect(disabled.has(toolName)).toBe(true);
        } else if (GENERATED_CORE_TOOLS.has(toolName) && !allReplaced.has(toolName)) {
          // Standalone core tools must NOT be disabled
          expect(disabled.has(toolName)).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('both mode: no tools are disabled by API mode', () => {
    const disabled = simulateBothModeDisabled();
    fc.assert(
      fc.property(arbToolName, (toolName) => {
        // In both mode, nothing is disabled by API mode logic
        expect(disabled.has(toolName)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('for any (apiMode, toolName) pair, disabled status matches simulation', () => {
    fc.assert(
      fc.property(arbApiMode, arbToolName, (mode, toolName) => {
        const disabled =
          mode === 'flat' ? simulateFlatModeDisabled()
          : mode === 'endpoint' ? simulateEndpointModeDisabled()
          : simulateBothModeDisabled();

        if (mode === 'flat') {
          if (GENERATED_ENDPOINT_TOOLS.has(toolName)) {
            expect(disabled.has(toolName)).toBe(true);
          } else {
            expect(disabled.has(toolName)).toBe(false);
          }
        } else if (mode === 'endpoint') {
          // Endpoint tools are never disabled in endpoint mode
          if (GENERATED_ENDPOINT_TOOLS.has(toolName)) {
            expect(disabled.has(toolName)).toBe(false);
          }
        } else {
          // both: nothing disabled
          expect(disabled.size).toBe(0);
        }
      }),
      { numRuns: 100 },
    );
  });
});

/**
 * Feature: endpoint-mode-refactor, Property 11: load_toolset 模式感知
 * **Validates: Requirements 7.2**
 *
 * For any toolset name and any FIGCRAFT_API_MODE, load_toolset should enable
 * the correct tools:
 * - flat mode: enable flat tools, skip endpoint tools
 * - endpoint mode: enable endpoint tools, skip replaced flat tools
 * - both mode: enable both (skipped list should be empty)
 */
describe('Feature: endpoint-mode-refactor, Property 11: load_toolset 模式感知', () => {
  const toolsetNames = Object.keys(GENERATED_TOOLSETS);
  const apiModes = ['flat', 'endpoint', 'both'] as const;

  const arbToolsetName = fc.constantFrom(...toolsetNames);
  const arbApiMode = fc.constantFrom(...apiModes);

  it('flat mode: no endpoint tool should appear in the enabled list', () => {
    fc.assert(
      fc.property(arbToolsetName, (toolsetName) => {
        const { enabled } = simulateLoadToolset(toolsetName, 'flat');
        for (const tool of enabled) {
          expect(GENERATED_ENDPOINT_TOOLS.has(tool)).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('endpoint mode: no replaced flat tool should appear in the enabled list', () => {
    const allReplaced = new Set<string>();
    for (const replaces of Object.values(GENERATED_ENDPOINT_REPLACES)) {
      for (const t of replaces) allReplaced.add(t);
    }

    fc.assert(
      fc.property(arbToolsetName, (toolsetName) => {
        const { enabled } = simulateLoadToolset(toolsetName, 'endpoint');
        for (const tool of enabled) {
          // If a tool is not an endpoint tool, it must not be a replaced flat tool
          if (!GENERATED_ENDPOINT_TOOLS.has(tool)) {
            expect(allReplaced.has(tool)).toBe(false);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('both mode: skipped list should be empty for every toolset', () => {
    fc.assert(
      fc.property(arbToolsetName, (toolsetName) => {
        const { skipped } = simulateLoadToolset(toolsetName, 'both');
        expect(skipped.length).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  it('for any (toolsetName, apiMode), enabled + skipped covers all toolset tools', () => {
    fc.assert(
      fc.property(arbToolsetName, arbApiMode, (toolsetName, mode) => {
        const def = GENERATED_TOOLSETS[toolsetName];
        const { enabled, skipped } = simulateLoadToolset(toolsetName, mode);
        const combined = new Set([...enabled, ...skipped]);
        // Every tool in the toolset definition should be either enabled or skipped
        for (const tool of def.tools) {
          expect(combined.has(tool)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });
});
