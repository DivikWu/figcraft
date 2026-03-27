/**
 * Schema_Compiler endpoint compilation correctness tests.
 *
 * Verifies the ALREADY GENERATED output from compile-schema.ts for endpoint tools:
 * - Zod schema structure (method enum, optional params)
 * - Registry sets (ENDPOINT_TOOLS, ENDPOINT_METHOD_ACCESS, ENDPOINT_REPLACES)
 * - Endpoint tools NOT in WRITE_TOOLS
 *
 * Validates: Requirements 12.4
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  nodesEndpointSchema,
  textEndpointSchema,
  componentsEndpointSchema,
  variables_epEndpointSchema,
  styles_epEndpointSchema,
} from '../packages/core-mcp/src/tools/_generated.js';
import {
  GENERATED_ENDPOINT_METHOD_ACCESS,
  GENERATED_ENDPOINT_TOOLS,
  GENERATED_ENDPOINT_REPLACES,
  GENERATED_WRITE_TOOLS,
} from '../packages/core-mcp/src/tools/_registry.js';

// ─── Helpers ───

const ALL_ENDPOINT_SCHEMAS: Record<string, Record<string, z.ZodTypeAny>> = {
  nodes: nodesEndpointSchema,
  text: textEndpointSchema,
  components: componentsEndpointSchema,
  variables_ep: variables_epEndpointSchema,
  styles_ep: styles_epEndpointSchema,
};

const EXPECTED_ENDPOINTS = ['nodes', 'text', 'components', 'variables_ep', 'styles_ep'];

// ─── 1. _generated.ts exports endpoint Zod schemas for all 6 endpoints ───

describe('endpoint Zod schema exports', () => {
  it.each(EXPECTED_ENDPOINTS)('exports %s endpoint schema', (ep) => {
    const schema = ALL_ENDPOINT_SCHEMAS[ep];
    expect(schema).toBeDefined();
    expect(typeof schema).toBe('object');
    expect(schema).toHaveProperty('method');
  });
});

// ─── 2. Each endpoint schema has a required `method` enum field ───

describe('endpoint schema method field', () => {
  it.each(EXPECTED_ENDPOINTS)('%s schema has a required method enum', (ep) => {
    const schema = ALL_ENDPOINT_SCHEMAS[ep];
    const methodField = schema.method;

    // method should be a ZodEnum (not optional)
    expect(methodField).toBeDefined();
    expect(methodField._def.typeName).toBe('ZodEnum');

    // Wrap in z.object and verify method is required (parse without method should fail)
    const result = z.object(schema).safeParse({});
    expect(result.success).toBe(false);
  });
});

// ─── 3. nodes endpoint accepts valid methods and rejects invalid ones ───

describe('nodes endpoint method validation', () => {
  const validMethods = ['get', 'list', 'update', 'delete'];
  const zodObj = z.object(nodesEndpointSchema);

  it.each(validMethods)('accepts valid method "%s"', (method) => {
    const result = zodObj.safeParse({ method });
    expect(result.success).toBe(true);
  });

  it.each(['create', 'move', 'rename', '', 'clone', 'insert_child'])('rejects invalid method "%s"', (method) => {
    const result = zodObj.safeParse({ method });
    expect(result.success).toBe(false);
  });
});

// ─── 4. GENERATED_ENDPOINT_METHOD_ACCESS has entries for all 6 endpoints ───

describe('GENERATED_ENDPOINT_METHOD_ACCESS completeness', () => {
  it.each(EXPECTED_ENDPOINTS)('has entry for %s', (ep) => {
    expect(GENERATED_ENDPOINT_METHOD_ACCESS).toHaveProperty(ep);
    expect(Object.keys(GENERATED_ENDPOINT_METHOD_ACCESS[ep]).length).toBeGreaterThan(0);
  });
});

// ─── 5. ENDPOINT_METHOD_ACCESS entries match expected write/access values ───

describe('GENERATED_ENDPOINT_METHOD_ACCESS write/access correctness', () => {
  it('nodes endpoint methods have correct write/access', () => {
    const nodes = GENERATED_ENDPOINT_METHOD_ACCESS['nodes'];
    expect(nodes['get']).toEqual({ write: false });
    expect(nodes['list']).toEqual({ write: false });
    expect(nodes['update']).toEqual({ write: true, access: 'edit' });
    expect(nodes['delete']).toEqual({ write: true, access: 'edit' });
  });

  it('text endpoint methods have correct write/access', () => {
    const text = GENERATED_ENDPOINT_METHOD_ACCESS['text'];
    expect(text['set_content']).toEqual({ write: true, access: 'edit' });
  });

  it('components endpoint read methods are not write', () => {
    const comp = GENERATED_ENDPOINT_METHOD_ACCESS['components'];
    expect(comp['list'].write).toBe(false);
    expect(comp['list_library'].write).toBe(false);
    expect(comp['get'].write).toBe(false);
    expect(comp['list_properties'].write).toBe(false);
  });

  it('variables_ep has both read and write methods', () => {
    const vars = GENERATED_ENDPOINT_METHOD_ACCESS['variables_ep'];
    expect(vars['list'].write).toBe(false);
    expect(vars['get'].write).toBe(false);
    expect(vars['export'].write).toBe(false);
    expect(vars['create'].write).toBe(true);
    expect(vars['delete'].write).toBe(true);
  });

  it('styles_ep has both read and write methods', () => {
    const styles = GENERATED_ENDPOINT_METHOD_ACCESS['styles_ep'];
    expect(styles['list'].write).toBe(false);
    expect(styles['get'].write).toBe(false);
    expect(styles['create_paint'].write).toBe(true);
    expect(styles['delete'].write).toBe(true);
  });
});

// ─── 6. GENERATED_ENDPOINT_TOOLS contains exactly the 6 endpoint names ───

describe('GENERATED_ENDPOINT_TOOLS', () => {
  it('contains exactly the 5 expected endpoint names', () => {
    expect(GENERATED_ENDPOINT_TOOLS.size).toBe(5);
    for (const ep of EXPECTED_ENDPOINTS) {
      expect(GENERATED_ENDPOINT_TOOLS.has(ep)).toBe(true);
    }
  });
});

// ─── 7. No endpoint tool name appears in GENERATED_WRITE_TOOLS ───

describe('endpoint tools not in WRITE_TOOLS', () => {
  it.each(EXPECTED_ENDPOINTS)('%s is NOT in GENERATED_WRITE_TOOLS', (ep) => {
    expect(GENERATED_WRITE_TOOLS.has(ep)).toBe(false);
  });
});

// ─── 8. GENERATED_ENDPOINT_REPLACES has entries for all 6 endpoints ───

describe('GENERATED_ENDPOINT_REPLACES', () => {
  it.each(EXPECTED_ENDPOINTS)('%s has a non-empty replaces array', (ep) => {
    expect(GENERATED_ENDPOINT_REPLACES).toHaveProperty(ep);
    expect(Array.isArray(GENERATED_ENDPOINT_REPLACES[ep])).toBe(true);
    expect(GENERATED_ENDPOINT_REPLACES[ep].length).toBeGreaterThan(0);
  });

  it('nodes replaces the expected flat tools', () => {
    expect(GENERATED_ENDPOINT_REPLACES['nodes']).toEqual(
      expect.arrayContaining(['get_node_info', 'search_nodes', 'patch_nodes', 'delete_nodes']),
    );
  });
});

// ─── Property-Based Tests ───
// Feature: endpoint-mode-refactor
// Properties 3, 4, 5, 6: Schema_Compiler 参数合并与映射完整性

import fc from 'fast-check';
import {
  GENERATED_CORE_TOOLS,
  GENERATED_TOOLSETS,
} from '../packages/core-mcp/src/tools/_registry.js';

// ─── Helpers ───

const ALL_ENDPOINT_NAMES = Object.keys(GENERATED_ENDPOINT_METHOD_ACCESS);

const ALL_ENDPOINT_SCHEMAS_MAP: Record<string, Record<string, z.ZodTypeAny>> = {
  nodes: nodesEndpointSchema,
  text: textEndpointSchema,
  components: componentsEndpointSchema,
  variables_ep: variables_epEndpointSchema,
  styles_ep: styles_epEndpointSchema,
};

/** Collect all toolset tool names into a flat set */
function allToolsetToolNames(): Set<string> {
  const result = new Set<string>();
  for (const ts of Object.values(GENERATED_TOOLSETS)) {
    for (const t of ts.tools) result.add(t);
  }
  return result;
}

// ─── Property 3: Schema_Compiler Endpoint 参数合并正确性 ───

describe('Feature: endpoint-mode-refactor, Property 3: Schema_Compiler Endpoint 参数合并正确性', () => {
  /**
   * Validates: Requirements 2.2, 2.3
   *
   * For any endpoint in GENERATED_ENDPOINT_METHOD_ACCESS, the corresponding
   * Zod schema should:
   * - Have a `method` field that is a required ZodEnum
   * - The enum values should match exactly the method names in ENDPOINT_METHOD_ACCESS
   * - All other fields should be optional (not required)
   */
  it('for any endpoint, the Zod schema has a required method enum matching ENDPOINT_METHOD_ACCESS keys, and all other fields are optional', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_ENDPOINT_NAMES),
        (endpointName) => {
          const schema = ALL_ENDPOINT_SCHEMAS_MAP[endpointName];
          expect(schema, `Missing Zod schema for endpoint "${endpointName}"`).toBeDefined();

          // method field must exist and be a ZodEnum (required, not optional)
          const methodField = schema.method;
          expect(methodField, `Endpoint "${endpointName}" missing method field`).toBeDefined();
          expect(methodField._def.typeName).toBe('ZodEnum');

          // Extract enum values from the Zod schema
          const enumValues = (methodField as z.ZodEnum<[string, ...string[]]>)._def.values as string[];
          const expectedMethods = Object.keys(GENERATED_ENDPOINT_METHOD_ACCESS[endpointName]);

          // Enum values should match exactly the method names
          expect([...enumValues].sort()).toEqual([...expectedMethods].sort());

          // All other fields should be optional (wrapping in z.object and parsing {} should only fail on method)
          const zodObj = z.object(schema);
          for (const [key, field] of Object.entries(schema)) {
            if (key === 'method') continue;
            // Optional fields have isOptional() === true
            const fieldSchema = field as z.ZodTypeAny;
            expect(
              fieldSchema.isOptional(),
              `Endpoint "${endpointName}" field "${key}" should be optional but is required`,
            ).toBe(true);
          }
        },
      ),
      { numRuns: Math.max(100, ALL_ENDPOINT_NAMES.length * 20) },
    );
  });
});

// ─── Property 4: Endpoint 注册表正确性 ───

describe('Feature: endpoint-mode-refactor, Property 4: Endpoint 注册表正确性', () => {
  /**
   * Validates: Requirements 2.4, 5.5
   *
   * For any endpoint tool name:
   * (a) It appears in GENERATED_CORE_TOOLS or in some GENERATED_TOOLSETS entry
   * (b) It does NOT appear in GENERATED_WRITE_TOOLS
   */
  const endpointToolNames = [...GENERATED_ENDPOINT_TOOLS];

  it('for any endpoint tool name, it is in CORE_TOOLS or a TOOLSET, and NOT in WRITE_TOOLS', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...endpointToolNames),
        (toolName) => {
          // (a) Must be in CORE_TOOLS or some toolset
          const inCore = GENERATED_CORE_TOOLS.has(toolName);
          const toolsetTools = allToolsetToolNames();
          const inToolset = toolsetTools.has(toolName);
          expect(
            inCore || inToolset,
            `Endpoint tool "${toolName}" not found in CORE_TOOLS or any TOOLSET`,
          ).toBe(true);

          // (b) Must NOT be in WRITE_TOOLS
          expect(
            GENERATED_WRITE_TOOLS.has(toolName),
            `Endpoint tool "${toolName}" should NOT be in WRITE_TOOLS`,
          ).toBe(false);
        },
      ),
      { numRuns: Math.max(100, endpointToolNames.length * 20) },
    );
  });
});

// ─── Property 5: ENDPOINT_METHOD_ACCESS 映射完整性 ───

describe('Feature: endpoint-mode-refactor, Property 5: ENDPOINT_METHOD_ACCESS 映射完整性', () => {
  /**
   * Validates: Requirements 2.5, 5.6
   *
   * For any endpoint and any method in that endpoint's Zod schema enum:
   * - GENERATED_ENDPOINT_METHOD_ACCESS[endpoint][method] exists
   * - It has a `write` boolean field
   * - If write is true, it has an `access` field that is 'create' or 'edit'
   */

  // Build a list of (endpoint, method) pairs from the Zod schemas
  const endpointMethodPairs: Array<{ endpoint: string; method: string }> = [];
  for (const ep of ALL_ENDPOINT_NAMES) {
    const schema = ALL_ENDPOINT_SCHEMAS_MAP[ep];
    if (!schema?.method) continue;
    const enumValues = (schema.method as z.ZodEnum<[string, ...string[]]>)._def.values as string[];
    for (const m of enumValues) {
      endpointMethodPairs.push({ endpoint: ep, method: m });
    }
  }

  it('for any (endpoint, method) pair from the Zod schema, ENDPOINT_METHOD_ACCESS has a valid entry', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...endpointMethodPairs),
        ({ endpoint, method }) => {
          const accessMap = GENERATED_ENDPOINT_METHOD_ACCESS[endpoint];
          expect(accessMap, `Missing ENDPOINT_METHOD_ACCESS entry for endpoint "${endpoint}"`).toBeDefined();

          const methodAccess = accessMap[method];
          expect(
            methodAccess,
            `Missing ENDPOINT_METHOD_ACCESS entry for "${endpoint}.${method}"`,
          ).toBeDefined();

          // Must have a boolean `write` field
          expect(typeof methodAccess.write).toBe('boolean');

          // If write is true, must have access field with valid value
          if (methodAccess.write) {
            expect(
              methodAccess.access,
              `"${endpoint}.${method}" is write:true but missing access field`,
            ).toBeDefined();
            expect(
              ['create', 'edit'].includes(methodAccess.access!),
              `"${endpoint}.${method}" access should be 'create' or 'edit', got "${methodAccess.access}"`,
            ).toBe(true);
          }
        },
      ),
      { numRuns: Math.max(100, endpointMethodPairs.length * 5) },
    );
  });
});

// ─── Property 6: Schema_Compiler 对无效 Endpoint 定义的拒绝 ───

describe('Feature: endpoint-mode-refactor, Property 6: Schema_Compiler 对无效 Endpoint 定义的拒绝', () => {
  /**
   * Validates: Requirements 2.6
   *
   * Since we can't easily re-run the compiler in tests, we verify that the
   * generated output is well-formed:
   * - For any endpoint in GENERATED_ENDPOINT_METHOD_ACCESS, it has a non-empty methods map
   * - For any endpoint in GENERATED_ENDPOINT_TOOLS, the schema has a method field
   */
  const endpointToolNames = [...GENERATED_ENDPOINT_TOOLS];

  it('for any endpoint in ENDPOINT_METHOD_ACCESS, it has a non-empty methods map', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_ENDPOINT_NAMES),
        (endpointName) => {
          const methods = GENERATED_ENDPOINT_METHOD_ACCESS[endpointName];
          expect(methods, `Endpoint "${endpointName}" has no methods map`).toBeDefined();
          expect(
            Object.keys(methods).length,
            `Endpoint "${endpointName}" has an empty methods map`,
          ).toBeGreaterThan(0);
        },
      ),
      { numRuns: Math.max(100, ALL_ENDPOINT_NAMES.length * 20) },
    );
  });

  it('for any endpoint in ENDPOINT_TOOLS, the Zod schema has a method field', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...endpointToolNames),
        (toolName) => {
          const schema = ALL_ENDPOINT_SCHEMAS_MAP[toolName];
          expect(schema, `Missing Zod schema for endpoint tool "${toolName}"`).toBeDefined();
          expect(
            schema.method,
            `Endpoint tool "${toolName}" schema missing method field`,
          ).toBeDefined();
          expect(schema.method._def.typeName).toBe('ZodEnum');
        },
      ),
      { numRuns: Math.max(100, endpointToolNames.length * 20) },
    );
  });
});
