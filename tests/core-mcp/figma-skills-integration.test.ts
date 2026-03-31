/**
 * Figma Skills Integration — property tests for the remote channel removal.
 *
 * Property 1: Removed tools do not exist in the registry.
 * Property 5: All Plugin Channel toolsets are fully preserved.
 *
 * Feature: figma-skills-integration
 * Validates: Requirements 1.1, 1.3, 5.1, 6.1, 6.2, 6.5
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  GENERATED_CORE_TOOLS,
  GENERATED_TOOLSETS,
  GENERATED_TOOLSET_DESCRIPTIONS,
} from '../../packages/core-mcp/src/tools/_registry.js';

// ─── Removed figma-remote tools (17 total) ───

const REMOVED_TOOLS = [
  'figma_get_design_context',
  'figma_get_screenshot',
  'figma_get_metadata',
  'figma_get_variable_defs',
  'figma_search_design_system',
  'figma_get_code_connect_map',
  'figma_add_code_connect_map',
  'figma_get_code_connect_suggestions',
  'figma_send_code_connect_mappings',
  'figma_create_design_system_rules',
  'figma_use_figma',
  'figma_generate_design',
  'figma_generate_diagram',
  'figma_whoami',
  'figma_create_new_file',
  'figma_remote_status',
  'inspect_with_context',
];

// ─── Expected Plugin Channel toolsets ───

const EXPECTED_TOOLSETS = [
  'variables',
  'tokens',
  'styles',
  'components-advanced',
  'library',
  'shapes-vectors',
  'annotations',
  'prototype',
  'lint',
  'auth',
  'pages',
  'staging',
];

// ─── Property 1: Removed tools do not exist in registry ───

describe('Feature: figma-skills-integration, Property 1: Removed tools do not exist in registry', () => {
  it('no removed tool appears in GENERATED_CORE_TOOLS', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...REMOVED_TOOLS),
        (toolName) => {
          expect(
            GENERATED_CORE_TOOLS.has(toolName),
            `Removed tool "${toolName}" should not be in GENERATED_CORE_TOOLS`,
          ).toBe(false);
        },
      ),
      { numRuns: Math.max(100, REMOVED_TOOLS.length * 10) },
    );
  });

  it('no removed tool appears in any GENERATED_TOOLSETS', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...REMOVED_TOOLS),
        (toolName) => {
          for (const [tsName, ts] of Object.entries(GENERATED_TOOLSETS)) {
            expect(
              ts.tools.includes(toolName),
              `Removed tool "${toolName}" should not be in toolset "${tsName}"`,
            ).toBe(false);
          }
        },
      ),
      { numRuns: Math.max(100, REMOVED_TOOLS.length * 10) },
    );
  });

  it('no removed tool appears in schema/tools.yaml', () => {
    const yaml = readFileSync(join(process.cwd(), 'schema/tools.yaml'), 'utf8');
    fc.assert(
      fc.property(
        fc.constantFrom(...REMOVED_TOOLS),
        (toolName) => {
          // Check for tool definition (tool name at start of line followed by colon)
          const pattern = new RegExp(`^${toolName}:`, 'm');
          expect(
            pattern.test(yaml),
            `Removed tool "${toolName}" should not be defined in schema/tools.yaml`,
          ).toBe(false);
        },
      ),
      { numRuns: Math.max(100, REMOVED_TOOLS.length * 10) },
    );
  });

  it('"figma-remote" toolset does not exist', () => {
    expect(GENERATED_TOOLSETS).not.toHaveProperty('figma-remote');
    expect(GENERATED_TOOLSET_DESCRIPTIONS).not.toHaveProperty('figma-remote');
  });
});

// ─── Property 5: Plugin Channel toolsets fully preserved ───

describe('Feature: figma-skills-integration, Property 5: Plugin Channel toolsets fully preserved', () => {
  it('all expected toolsets exist in GENERATED_TOOLSETS', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...EXPECTED_TOOLSETS),
        (toolsetName) => {
          expect(
            GENERATED_TOOLSETS,
            `Expected toolset "${toolsetName}" should exist in GENERATED_TOOLSETS`,
          ).toHaveProperty(toolsetName);
        },
      ),
      { numRuns: Math.max(100, EXPECTED_TOOLSETS.length * 10) },
    );
  });

  it('all expected toolsets have descriptions', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...EXPECTED_TOOLSETS),
        (toolsetName) => {
          expect(
            GENERATED_TOOLSET_DESCRIPTIONS,
            `Expected toolset "${toolsetName}" should have a description`,
          ).toHaveProperty(toolsetName);
          expect(GENERATED_TOOLSET_DESCRIPTIONS[toolsetName].length).toBeGreaterThan(0);
        },
      ),
      { numRuns: Math.max(100, EXPECTED_TOOLSETS.length * 10) },
    );
  });

  it('all expected toolsets have at least one tool', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...EXPECTED_TOOLSETS),
        (toolsetName) => {
          const tools = GENERATED_TOOLSETS[toolsetName]?.tools ?? [];
          expect(
            tools.length,
            `Toolset "${toolsetName}" should have at least one tool`,
          ).toBeGreaterThan(0);
        },
      ),
      { numRuns: Math.max(100, EXPECTED_TOOLSETS.length * 10) },
    );
  });

  it('core tools set is non-empty', () => {
    expect(GENERATED_CORE_TOOLS.size).toBeGreaterThan(0);
  });
});
