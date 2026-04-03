/**
 * Property-based test: Method-level access control for endpoint tools.
 *
 * Feature: endpoint-mode-refactor, Property 9: Method 级别访问控制
 *
 * For any (endpoint, method, accessLevel) triple, Method_Dispatcher's
 * allow/reject behavior should satisfy:
 * - accessLevel=read: only allow methods where write: false
 * - accessLevel=create: allow write: false AND access: create methods, reject access: edit methods
 * - accessLevel=edit: allow ALL methods
 *
 * When rejected, the error response should contain:
 * - The current access level
 * - The blocked method name
 * - The list of allowed methods at that access level for that endpoint
 *
 * **Validates: Requirements 3.4, 5.1, 5.2, 5.3, 5.4**
 */

import fc from 'fast-check';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mock setup (same pattern as method-dispatcher.test.ts) ───

vi.mock('../../packages/core-mcp/src/tools/toolset-manager.js', () => ({
  getAccessLevel: vi.fn(() => 'edit'),
  isToolBlocked: vi.fn(() => null),
}));

vi.mock('../../packages/core-mcp/src/tools/logic/node-logic.js', () => ({
  getNodeInfoLogic: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: '{"id":"1:23"}' }],
  }),
  searchNodesLogic: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: '[]' }],
  }),
  getCurrentPageLogic: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: '{}' }],
  }),
}));

vi.mock('../../packages/core-mcp/src/rest-fallback.js', () => ({
  requestWithFallback: vi.fn(),
  restGetNodeInfo: vi.fn(),
  restExportImage: vi.fn(),
  setFileKey: vi.fn(),
  setFileContext: vi.fn(),
}));

vi.mock('../../packages/core-mcp/src/figma-api.js', () => ({
  extractFileKeyFromUrl: vi.fn(),
  extractNodeIdFromUrl: vi.fn(),
}));

// Mock component-logic (listLibraryComponentsLogic used by components endpoint)
vi.mock('../../packages/core-mcp/src/tools/logic/component-logic.js', () => ({
  listLibraryComponentsLogic: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: '{"componentSetCount":0,"standaloneCount":0,"componentSets":[],"standalone":[]}' }],
  }),
}));

import { GENERATED_ENDPOINT_METHOD_ACCESS } from '../../packages/core-mcp/src/tools/_registry.js';
import { registerEndpointTools } from '../../packages/core-mcp/src/tools/endpoints.js';
import { getAccessLevel } from '../../packages/core-mcp/src/tools/toolset-manager.js';
import { buildMinimalParams } from '../helpers/endpoint-test-utils.js';

const mockGetAccessLevel = vi.mocked(getAccessLevel);

// ─── Mock McpServer & Bridge ───

type ToolCallback = (params: Record<string, unknown>) => Promise<unknown>;

function createMockServer() {
  const registeredTools: Record<string, ToolCallback> = {};
  const mockServer = {
    tool: vi.fn((name: string, _desc: string, _schema: unknown, callback: ToolCallback) => {
      registeredTools[name] = callback;
    }),
  };
  return { server: mockServer as any, registeredTools };
}

function createMockBridge() {
  return {
    isConnected: true,
    request: vi.fn().mockResolvedValue({ ok: true }),
    setLibraryFileKey: vi.fn(),
    getLibraryFileKey: vi.fn(),
  } as any;
}

// ─── Build all valid (endpoint, method) pairs from the registry ───

const ALL_ENDPOINT_METHOD_PAIRS: Array<{ endpoint: string; method: string }> = [];
for (const [ep, methods] of Object.entries(GENERATED_ENDPOINT_METHOD_ACCESS)) {
  for (const m of Object.keys(methods)) {
    ALL_ENDPOINT_METHOD_PAIRS.push({ endpoint: ep, method: m });
  }
}

const ACCESS_LEVELS = ['read', 'create', 'edit'] as const;
type AccessLevel = (typeof ACCESS_LEVELS)[number];

/**
 * Determine expected behavior for a (endpoint, method, accessLevel) triple.
 * Returns 'allowed' or 'blocked'.
 */
function expectedBehavior(endpoint: string, method: string, accessLevel: AccessLevel): 'allowed' | 'blocked' {
  const methodAccess = GENERATED_ENDPOINT_METHOD_ACCESS[endpoint]?.[method];
  if (!methodAccess) return 'allowed'; // shouldn't happen for valid pairs

  if (accessLevel === 'edit') return 'allowed';

  if (!methodAccess.write) return 'allowed'; // read methods always allowed

  if (accessLevel === 'read') return 'blocked';

  // accessLevel === 'create'
  const methodAccessLevel = methodAccess.access ?? 'edit';
  if (methodAccessLevel === 'edit') return 'blocked';
  return 'allowed'; // access: create is allowed at create level
}

/**
 * Compute the list of allowed methods for a given endpoint at a given access level.
 */
function computeAllowedMethods(endpoint: string, accessLevel: AccessLevel): string[] {
  const methods = GENERATED_ENDPOINT_METHOD_ACCESS[endpoint] ?? {};

  if (accessLevel === 'edit') return Object.keys(methods);

  if (accessLevel === 'read') {
    return Object.entries(methods)
      .filter(([, v]) => !v.write)
      .map(([k]) => k);
  }

  // accessLevel === 'create'
  return Object.entries(methods)
    .filter(([, v]) => !v.write || v.access === 'create')
    .map(([k]) => k);
}

// ─── Property 9 Test ───

describe('Feature: endpoint-mode-refactor, Property 9: Method 级别访问控制', () => {
  /**
   * **Validates: Requirements 3.4, 5.1, 5.2, 5.3, 5.4**
   *
   * For any (endpoint, method, accessLevel) triple, Method_Dispatcher's
   * allow/reject behavior should match the access control rules.
   */
  let registeredTools: Record<string, ToolCallback>;
  let mockBridge: ReturnType<typeof createMockBridge>;

  beforeEach(() => {
    vi.clearAllMocks();
    const { server, registeredTools: tools } = createMockServer();
    mockBridge = createMockBridge();
    registerEndpointTools(server, mockBridge);
    registeredTools = tools;
  });

  it('correctly allows or rejects every (endpoint, method, accessLevel) triple', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...ALL_ENDPOINT_METHOD_PAIRS),
        fc.constantFrom(...ACCESS_LEVELS),
        async ({ endpoint, method }, accessLevel) => {
          // Set the mock access level for this iteration
          mockGetAccessLevel.mockReturnValue(accessLevel);

          const params = buildMinimalParams(endpoint, method);
          const result = (await registeredTools[endpoint](params)) as any;

          const expected = expectedBehavior(endpoint, method, accessLevel);

          if (expected === 'allowed') {
            // Should NOT be an error
            expect(result.isError).not.toBe(true);
          } else {
            // Should be an error
            expect(result.isError).toBe(true);
            expect(result.content).toHaveLength(1);

            const parsed = JSON.parse(result.content[0].text);

            // Error must mention the current access level
            expect(parsed.error).toContain(`FIGCRAFT_ACCESS=${accessLevel}`);

            // Error must mention the blocked method name
            expect(parsed.error).toContain(`"${method}"`);

            // Error must list the allowed methods at this access level
            const allowedMethods = computeAllowedMethods(endpoint, accessLevel);
            for (const allowed of allowedMethods) {
              expect(parsed.error).toContain(allowed);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
