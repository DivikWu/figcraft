/**
 * Method_Dispatcher routing and rejection tests.
 *
 * Tests that endpoint tools correctly route valid methods to the right
 * logic functions, reject invalid methods with available method lists,
 * and convert parameters correctly.
 *
 * Validates: Requirements 12.1
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock setup ───

// Mock toolset-manager to control access level
vi.mock('../src/mcp-server/tools/toolset-manager.js', () => ({
  getAccessLevel: vi.fn(() => 'edit'),
  isToolBlocked: vi.fn(() => null),
  getApiMode: vi.fn(() => 'both'),
}));

// Mock node-logic functions
vi.mock('../src/mcp-server/tools/logic/node-logic.js', () => ({
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

// Mock component-logic (listLibraryComponentsLogic used by components endpoint)
vi.mock('../src/mcp-server/tools/logic/component-logic.js', () => ({
  listLibraryComponentsLogic: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: '{"count":0,"components":[]}' }],
  }),
}));

// Mock rest-fallback (needed by node-logic imports)
vi.mock('../src/mcp-server/rest-fallback.js', () => ({
  requestWithFallback: vi.fn(),
  restGetNodeInfo: vi.fn(),
  restExportImage: vi.fn(),
  setFileKey: vi.fn(),
  setFileContext: vi.fn(),
}));

vi.mock('../src/mcp-server/figma-api.js', () => ({
  extractFileKeyFromUrl: vi.fn(),
  extractNodeIdFromUrl: vi.fn(),
}));

import { registerEndpointTools, bridgeRequestLogic } from '../src/mcp-server/tools/endpoints.js';
import { getNodeInfoLogic, searchNodesLogic } from '../src/mcp-server/tools/logic/node-logic.js';
import { listLibraryComponentsLogic } from '../src/mcp-server/tools/logic/component-logic.js';

const mockGetNodeInfoLogic = vi.mocked(getNodeInfoLogic);
const mockSearchNodesLogic = vi.mocked(searchNodesLogic);
const mockListLibraryComponentsLogic = vi.mocked(listLibraryComponentsLogic);

// ─── Mock McpServer that captures tool registrations ───

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

// ─── Tests ───

describe('Method_Dispatcher routing', () => {
  let registeredTools: Record<string, ToolCallback>;
  let mockBridge: ReturnType<typeof createMockBridge>;

  beforeEach(() => {
    vi.clearAllMocks();
    const { server, registeredTools: tools } = createMockServer();
    mockBridge = createMockBridge();
    registerEndpointTools(server, mockBridge);
    registeredTools = tools;
  });

  it('registers all 6 endpoint tools', () => {
    expect(registeredTools['nodes']).toBeDefined();
    expect(registeredTools['text']).toBeDefined();
    expect(registeredTools['shapes']).toBeDefined();
    expect(registeredTools['components']).toBeDefined();
    expect(registeredTools['variables_ep']).toBeDefined();
    expect(registeredTools['styles_ep']).toBeDefined();
  });

  // ── nodes endpoint routing ──

  describe('nodes endpoint', () => {
    it('routes method "get" to getNodeInfoLogic with correct params', async () => {
      await registeredTools['nodes']({ method: 'get', nodeId: '1:23' });

      expect(mockGetNodeInfoLogic).toHaveBeenCalledWith(
        mockBridge,
        { nodeId: '1:23' },
      );
    });

    it('routes method "list" to searchNodesLogic with correct params', async () => {
      await registeredTools['nodes']({
        method: 'list',
        query: 'Button',
        types: ['FRAME', 'TEXT'],
        limit: 10,
      });

      expect(mockSearchNodesLogic).toHaveBeenCalledWith(
        mockBridge,
        { query: 'Button', types: ['FRAME', 'TEXT'], limit: 10 },
      );
    });

    it('routes method "update" to bridge.request with patch_nodes', async () => {
      const patches = [{ nodeId: '1:1', props: { name: 'New' } }];
      await registeredTools['nodes']({ method: 'update', patches });

      expect(mockBridge.request).toHaveBeenCalledWith('patch_nodes', { patches });
    });

    it('routes method "delete" to bridge.request with delete_nodes', async () => {
      const nodeIds = ['1:1', '2:2'];
      await registeredTools['nodes']({ method: 'delete', nodeIds });

      expect(mockBridge.request).toHaveBeenCalledWith('delete_nodes', { nodeIds });
    });

    it('routes method "clone" to bridge.request with clone_node', async () => {
      await registeredTools['nodes']({ method: 'clone', nodeId: '3:3' });

      expect(mockBridge.request).toHaveBeenCalledWith('clone_node', { nodeId: '3:3' });
    });

    it('routes method "insert_child" to bridge.request with correct params', async () => {
      await registeredTools['nodes']({
        method: 'insert_child',
        parentId: '1:1',
        childId: '2:2',
        index: 0,
      });

      expect(mockBridge.request).toHaveBeenCalledWith('insert_child', {
        parentId: '1:1',
        childId: '2:2',
        index: 0,
      });
    });
  });

  // ── text endpoint routing ──

  describe('text endpoint', () => {
    it('routes method "create" to bridge.request with create_text', async () => {
      await registeredTools['text']({
        method: 'create',
        content: 'Hello',
        name: 'Label',
        x: 10,
        y: 20,
        fontSize: 16,
        fontFamily: 'Inter',
        fontStyle: 'Bold',
        fill: '#000000',
        parentId: '1:1',
      });

      expect(mockBridge.request).toHaveBeenCalledWith('create_text', {
        content: 'Hello',
        name: 'Label',
        x: 10,
        y: 20,
        fontSize: 16,
        fontFamily: 'Inter',
        fontStyle: 'Bold',
        fill: '#000000',
        parentId: '1:1',
      });
    });

    it('routes method "set_content" to bridge.request with set_text_content', async () => {
      await registeredTools['text']({
        method: 'set_content',
        nodeId: '5:5',
        content: 'Updated text',
      });

      expect(mockBridge.request).toHaveBeenCalledWith('set_text_content', {
        nodeId: '5:5',
        content: 'Updated text',
      });
    });
  });

  // ── shapes endpoint routing ──

  describe('shapes endpoint', () => {
    it('routes method "create_frame" to bridge.request with create_frame', async () => {
      await registeredTools['shapes']({
        method: 'create_frame',
        name: 'Container',
        width: 400,
        height: 300,
        autoLayout: true,
        layoutDirection: 'VERTICAL',
        itemSpacing: 8,
        padding: 16,
      });

      expect(mockBridge.request).toHaveBeenCalledWith('create_frame', expect.objectContaining({
        name: 'Container',
        width: 400,
        height: 300,
        autoLayout: true,
        layoutDirection: 'VERTICAL',
        itemSpacing: 8,
        padding: 16,
      }));
    });

    it('routes method "create_rectangle" to bridge.request', async () => {
      await registeredTools['shapes']({
        method: 'create_rectangle',
        name: 'Rect',
        width: 100,
        height: 50,
        fill: '#FF0000',
        cornerRadius: 8,
      });

      expect(mockBridge.request).toHaveBeenCalledWith('create_rectangle', expect.objectContaining({
        name: 'Rect',
        width: 100,
        height: 50,
        fill: '#FF0000',
        cornerRadius: 8,
      }));
    });

    it('routes method "create_ellipse" to bridge.request', async () => {
      await registeredTools['shapes']({
        method: 'create_ellipse',
        name: 'Circle',
        width: 50,
        height: 50,
        fill: '#00FF00',
      });

      expect(mockBridge.request).toHaveBeenCalledWith('create_ellipse', expect.objectContaining({
        name: 'Circle',
        width: 50,
        height: 50,
        fill: '#00FF00',
      }));
    });

    it('routes method "create_vector" to bridge.request', async () => {
      await registeredTools['shapes']({
        method: 'create_vector',
        svg: '<svg><path d="M0 0"/></svg>',
        name: 'Icon',
        resize: [24, 24],
      });

      expect(mockBridge.request).toHaveBeenCalledWith('create_vector', expect.objectContaining({
        svg: '<svg><path d="M0 0"/></svg>',
        name: 'Icon',
        resize: [24, 24],
      }));
    });
  });

  // ── components endpoint routing ──

  describe('components endpoint', () => {
    it('routes method "list" to bridge.request with list_components', async () => {
      await registeredTools['components']({ method: 'list' });

      expect(mockBridge.request).toHaveBeenCalledWith('list_components', {});
    });

    it('routes method "list_library" to listLibraryComponentsLogic with correct params', async () => {
      await registeredTools['components']({
        method: 'list_library',
        fileKey: 'abc123',
      });

      expect(mockListLibraryComponentsLogic).toHaveBeenCalledWith(
        mockBridge,
        { fileKey: 'abc123' },
      );
    });

    it('routes method "get" to bridge.request with get_component', async () => {
      await registeredTools['components']({
        method: 'get',
        nodeId: '10:20',
      });

      expect(mockBridge.request).toHaveBeenCalledWith('get_component', {
        nodeId: '10:20',
      });
    });

    it('routes method "create_instance" to bridge.request', async () => {
      await registeredTools['components']({
        method: 'create_instance',
        componentKey: 'key123',
        properties: { variant: 'primary' },
        parentId: '1:1',
      });

      expect(mockBridge.request).toHaveBeenCalledWith('create_instance', {
        componentId: undefined,
        componentKey: 'key123',
        properties: { variant: 'primary' },
        parentId: '1:1',
      });
    });

    it('routes method "list_properties" to bridge.request', async () => {
      await registeredTools['components']({
        method: 'list_properties',
        nodeId: '15:30',
      });

      expect(mockBridge.request).toHaveBeenCalledWith('list_component_properties', {
        nodeId: '15:30',
      });
    });
  });
});

// ── Invalid method rejection ──

describe('Method_Dispatcher invalid method rejection', () => {
  let registeredTools: Record<string, ToolCallback>;
  let mockBridge: ReturnType<typeof createMockBridge>;

  beforeEach(() => {
    vi.clearAllMocks();
    const { server, registeredTools: tools } = createMockServer();
    mockBridge = createMockBridge();
    registerEndpointTools(server, mockBridge);
    registeredTools = tools;
  });

  it('nodes endpoint rejects invalid method with available methods list', async () => {
    const result = await registeredTools['nodes']({ method: 'create' }) as any;

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toContain('Unknown method "create"');
    expect(parsed.error).toContain('nodes');
    // Should list all valid methods
    expect(parsed.error).toContain('get');
    expect(parsed.error).toContain('list');
    expect(parsed.error).toContain('update');
    expect(parsed.error).toContain('delete');
    expect(parsed.error).toContain('clone');
    expect(parsed.error).toContain('insert_child');
  });

  it('text endpoint rejects invalid method with available methods list', async () => {
    const result = await registeredTools['text']({ method: 'delete' }) as any;

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toContain('Unknown method "delete"');
    expect(parsed.error).toContain('text');
    expect(parsed.error).toContain('create');
    expect(parsed.error).toContain('set_content');
  });

  it('shapes endpoint rejects invalid method', async () => {
    const result = await registeredTools['shapes']({ method: 'delete' }) as any;

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toContain('Unknown method "delete"');
    expect(parsed.error).toContain('create_frame');
    expect(parsed.error).toContain('create_rectangle');
    expect(parsed.error).toContain('create_ellipse');
    expect(parsed.error).toContain('create_vector');
  });

  it('components endpoint rejects invalid method', async () => {
    const result = await registeredTools['components']({ method: 'rename' }) as any;

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toContain('Unknown method "rename"');
    expect(parsed.error).toContain('list');
    expect(parsed.error).toContain('get');
    expect(parsed.error).toContain('create_instance');
  });

  it('variables_ep endpoint rejects invalid method', async () => {
    const result = await registeredTools['variables_ep']({ method: 'rename' }) as any;

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toContain('Unknown method "rename"');
    expect(parsed.error).toContain('variables_ep');
  });

  it('styles_ep endpoint rejects invalid method', async () => {
    const result = await registeredTools['styles_ep']({ method: 'rename' }) as any;

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toContain('Unknown method "rename"');
    expect(parsed.error).toContain('styles_ep');
  });

  it('rejects empty string as method', async () => {
    const result = await registeredTools['nodes']({ method: '' }) as any;

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toContain('Unknown method ""');
  });
});

// ── Parameter conversion correctness ──

describe('Method_Dispatcher parameter conversion', () => {
  let registeredTools: Record<string, ToolCallback>;
  let mockBridge: ReturnType<typeof createMockBridge>;

  beforeEach(() => {
    vi.clearAllMocks();
    const { server, registeredTools: tools } = createMockServer();
    mockBridge = createMockBridge();
    registerEndpointTools(server, mockBridge);
    registeredTools = tools;
  });

  it('nodes "get" extracts only nodeId from params', async () => {
    await registeredTools['nodes']({
      method: 'get',
      nodeId: '1:23',
      query: 'should-be-ignored',
    });

    expect(mockGetNodeInfoLogic).toHaveBeenCalledWith(
      mockBridge,
      { nodeId: '1:23' },
    );
  });

  it('nodes "list" extracts query, types, and limit', async () => {
    await registeredTools['nodes']({
      method: 'list',
      query: 'Frame',
      types: ['FRAME'],
      limit: 5,
      nodeId: 'should-be-ignored',
    });

    expect(mockSearchNodesLogic).toHaveBeenCalledWith(
      mockBridge,
      { query: 'Frame', types: ['FRAME'], limit: 5 },
    );
  });

  it('nodes "list" passes undefined for optional params when not provided', async () => {
    await registeredTools['nodes']({
      method: 'list',
      query: 'Button',
    });

    expect(mockSearchNodesLogic).toHaveBeenCalledWith(
      mockBridge,
      { query: 'Button', types: undefined, limit: undefined },
    );
  });

  it('text "create" passes all text creation params to bridge', async () => {
    await registeredTools['text']({
      method: 'create',
      content: 'Hello World',
      fontSize: 24,
    });

    expect(mockBridge.request).toHaveBeenCalledWith('create_text', expect.objectContaining({
      content: 'Hello World',
      fontSize: 24,
    }));
  });

  it('shapes "create_frame" passes layout params correctly', async () => {
    await registeredTools['shapes']({
      method: 'create_frame',
      name: 'Layout',
      paddingLeft: 16,
      paddingRight: 16,
      paddingTop: 8,
      paddingBottom: 8,
      primaryAxisAlignItems: 'CENTER',
      counterAxisAlignItems: 'CENTER',
    });

    expect(mockBridge.request).toHaveBeenCalledWith('create_frame', expect.objectContaining({
      name: 'Layout',
      paddingLeft: 16,
      paddingRight: 16,
      paddingTop: 8,
      paddingBottom: 8,
      primaryAxisAlignItems: 'CENTER',
      counterAxisAlignItems: 'CENTER',
    }));
  });

  it('components "create_instance" passes componentId and componentKey', async () => {
    await registeredTools['components']({
      method: 'create_instance',
      componentId: 'local-123',
      componentKey: undefined,
      properties: { size: 'large' },
      parentId: '1:1',
    });

    expect(mockBridge.request).toHaveBeenCalledWith('create_instance', {
      componentId: 'local-123',
      componentKey: undefined,
      properties: { size: 'large' },
      parentId: '1:1',
    });
  });
});

// ── bridgeRequestLogic unit tests ──

describe('bridgeRequestLogic', () => {
  it('wraps bridge.request result in McpResponse format', async () => {
    const bridge = createMockBridge();
    bridge.request.mockResolvedValue({ ok: true, data: [1, 2, 3] });

    const result = await bridgeRequestLogic(bridge, 'some_method', { key: 'value' });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.ok).toBe(true);
    expect(parsed.data).toEqual([1, 2, 3]);
  });

  it('passes params to bridge.request correctly', async () => {
    const bridge = createMockBridge();
    bridge.request.mockResolvedValue({});

    await bridgeRequestLogic(bridge, 'test_method', { a: 1, b: 'two' });

    expect(bridge.request).toHaveBeenCalledWith('test_method', { a: 1, b: 'two' });
  });
});


// ── Property-Based Tests: Method_Dispatcher routing & rejection ──

import fc from 'fast-check';
import { GENERATED_ENDPOINT_METHOD_ACCESS } from '../src/mcp-server/tools/_registry.js';
import { buildMinimalParams } from './helpers/endpoint-test-utils.js';

/**
 * Complete mapping of endpoint → method → expected handler behavior.
 * For logic-function methods: handler is 'logic' (calls getNodeInfoLogic or searchNodesLogic).
 * For bridge methods: handler is the bridge method name string.
 */
const ENDPOINT_METHOD_BRIDGE_MAP: Record<string, Record<string, { type: 'logic'; fn: string } | { type: 'bridge'; method: string }>> = {
  nodes: {
    get: { type: 'logic', fn: 'getNodeInfoLogic' },
    list: { type: 'logic', fn: 'searchNodesLogic' },
    update: { type: 'bridge', method: 'patch_nodes' },
    delete: { type: 'bridge', method: 'delete_nodes' },
    clone: { type: 'bridge', method: 'clone_node' },
    insert_child: { type: 'bridge', method: 'insert_child' },
  },
  text: {
    create: { type: 'bridge', method: 'create_text' },
    set_content: { type: 'bridge', method: 'set_text_content' },
  },
  shapes: {
    create_frame: { type: 'bridge', method: 'create_frame' },
    create_rectangle: { type: 'bridge', method: 'create_rectangle' },
    create_ellipse: { type: 'bridge', method: 'create_ellipse' },
    create_vector: { type: 'bridge', method: 'create_vector' },
  },
  components: {
    list: { type: 'bridge', method: 'list_components' },
    list_library: { type: 'logic', fn: 'listLibraryComponentsLogic' },
    get: { type: 'bridge', method: 'get_component' },
    create_instance: { type: 'bridge', method: 'create_instance' },
    list_properties: { type: 'bridge', method: 'list_component_properties' },
  },
  variables_ep: {
    list: { type: 'bridge', method: 'list_variables' },
    get: { type: 'bridge', method: 'get_variable' },
    list_collections: { type: 'bridge', method: 'list_collections' },
    get_bindings: { type: 'bridge', method: 'get_node_variables' },
    set_binding: { type: 'bridge', method: 'set_variable_binding' },
    create: { type: 'bridge', method: 'create_variable' },
    update: { type: 'bridge', method: 'update_variable' },
    delete: { type: 'bridge', method: 'delete_variable' },
    create_collection: { type: 'bridge', method: 'create_collection' },
    delete_collection: { type: 'bridge', method: 'delete_collection' },
    batch_create: { type: 'bridge', method: 'batch_create_variables' },
    export: { type: 'bridge', method: 'export_variables' },
  },
  styles_ep: {
    list: { type: 'bridge', method: 'list_styles' },
    get: { type: 'bridge', method: 'get_style' },
    create_paint: { type: 'bridge', method: 'create_paint_style' },
    update_paint: { type: 'bridge', method: 'update_paint_style' },
    update_text: { type: 'bridge', method: 'update_text_style' },
    update_effect: { type: 'bridge', method: 'update_effect_style' },
    delete: { type: 'bridge', method: 'delete_style' },
    sync: { type: 'bridge', method: 'sync_styles' },
  },
};

/** Build all valid (endpoint, method) pairs for Property 7 generator */
const ALL_VALID_PAIRS: Array<{ endpoint: string; method: string }> = [];
for (const [ep, methods] of Object.entries(ENDPOINT_METHOD_BRIDGE_MAP)) {
  for (const m of Object.keys(methods)) {
    ALL_VALID_PAIRS.push({ endpoint: ep, method: m });
  }
}

describe('Feature: endpoint-mode-refactor, Property 7: Method_Dispatcher routing correctness', () => {
  /**
   * **Validates: Requirements 3.1**
   *
   * For any endpoint and any valid method name, Method_Dispatcher should route
   * the request to the corresponding Tool_Logic_Function or bridge handler.
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

  it('routes every valid (endpoint, method) pair to the correct handler', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...ALL_VALID_PAIRS),
        async ({ endpoint, method }) => {
          // Reset mocks for each iteration
          mockBridge.request.mockClear();
          mockGetNodeInfoLogic.mockClear();
          mockSearchNodesLogic.mockClear();
          mockListLibraryComponentsLogic.mockClear();

          // Build minimal valid params using shared utility
          const params = buildMinimalParams(endpoint, method);

          const result = await registeredTools[endpoint](params) as any;

          // The call should NOT be an error (valid method)
          expect(result.isError).not.toBe(true);

          const mapping = ENDPOINT_METHOD_BRIDGE_MAP[endpoint][method];
          if (mapping.type === 'logic') {
            // Verify the correct logic function was called
            if (mapping.fn === 'getNodeInfoLogic') {
              expect(mockGetNodeInfoLogic).toHaveBeenCalledTimes(1);
            } else if (mapping.fn === 'searchNodesLogic') {
              expect(mockSearchNodesLogic).toHaveBeenCalledTimes(1);
            } else if (mapping.fn === 'listLibraryComponentsLogic') {
              expect(mockListLibraryComponentsLogic).toHaveBeenCalledTimes(1);
            }
          } else {
            // Verify bridge.request was called with the correct mapped method name
            expect(mockBridge.request).toHaveBeenCalledTimes(1);
            expect(mockBridge.request).toHaveBeenCalledWith(
              mapping.method,
              expect.any(Object),
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Feature: endpoint-mode-refactor, Property 8: Method_Dispatcher rejects invalid methods', () => {
  /**
   * **Validates: Requirements 3.2**
   *
   * For any endpoint and any method string NOT in that endpoint's supported list,
   * Method_Dispatcher should return an error response containing all valid method names.
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

  /** All endpoint names */
  const ENDPOINT_NAMES = Object.keys(GENERATED_ENDPOINT_METHOD_ACCESS);

  it('rejects any invalid method with an error listing all valid methods', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...ENDPOINT_NAMES),
        fc.stringMatching(/^[a-z_][a-z0-9_]{0,19}$/),
        async (endpoint, randomMethod) => {
          const validMethods = Object.keys(GENERATED_ENDPOINT_METHOD_ACCESS[endpoint]);

          // Skip if the random string happens to be a valid method
          fc.pre(!validMethods.includes(randomMethod));

          const result = await registeredTools[endpoint]({ method: randomMethod }) as any;

          // Must be an error
          expect(result.isError).toBe(true);
          expect(result.content).toHaveLength(1);

          const parsed = JSON.parse(result.content[0].text);

          // Error message must mention the invalid method name
          expect(parsed.error).toContain(`Unknown method "${randomMethod}"`);

          // Error message must contain ALL valid method names for this endpoint
          for (const validMethod of validMethods) {
            expect(parsed.error).toContain(validMethod);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
