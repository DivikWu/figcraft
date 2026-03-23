/**
 * Tool_Logic_Function behavioral equivalence unit tests.
 *
 * Validates that extracted logic functions return McpResponse format
 * and preserve key behaviors: URL parsing, node-not-found guidance,
 * recursive type validation, empty nodes rejection, etc.
 *
 * Validates: Requirements 1.5, 12.2
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpResponse } from '../packages/core-mcp/src/tools/logic/node-logic.js';

// ─── Mock setup ───

// Mock requestWithFallback before importing logic modules
vi.mock('../packages/core-mcp/src/rest-fallback.js', () => ({
  requestWithFallback: vi.fn(),
  restGetNodeInfo: vi.fn(),
  restExportImage: vi.fn(),
  setFileKey: vi.fn(),
  setFileContext: vi.fn(),
}));

vi.mock('../packages/core-mcp/src/tools/toolset-manager.js', () => ({
  getAccessLevel: vi.fn(() => 'edit'),
  isToolBlocked: vi.fn(() => null),
  getApiMode: vi.fn(() => 'both'),
}));

// Mock component-logic (listLibraryComponentsLogic used by components endpoint)
vi.mock('../packages/core-mcp/src/tools/logic/component-logic.js', () => ({
  listLibraryComponentsLogic: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: '{"count":0,"components":[]}' }],
  }),
}));

vi.mock('../packages/core-mcp/src/figma-api.js', () => ({
  extractFileKeyFromUrl: vi.fn((url: string) => {
    const match = url.match(/figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
  }),
  extractNodeIdFromUrl: vi.fn((url: string) => {
    const match = url.match(/node-id=([^&]+)/);
    if (!match) return null;
    return decodeURIComponent(match[1]).replaceAll('-', ':');
  }),
}));

import { requestWithFallback } from '../packages/core-mcp/src/rest-fallback.js';
import {
  getNodeInfoLogic,
  getCurrentPageLogic,
  searchNodesLogic,
} from '../packages/core-mcp/src/tools/logic/node-logic.js';
import { createDocumentLogic } from '../packages/core-mcp/src/tools/logic/write-node-logic.js';
import { createScreenLogic } from '../packages/core-mcp/src/tools/logic/create-screen-logic.js';
import { exportImageLogic } from '../packages/core-mcp/src/tools/logic/export-logic.js';

const mockRequestWithFallback = vi.mocked(requestWithFallback);

// ─── Bridge mock factory ───

function createMockBridge(overrides: Record<string, unknown> = {}) {
  return {
    isConnected: true,
    request: vi.fn().mockResolvedValue({ ok: true }),
    setLibraryFileKey: vi.fn(),
    getLibraryFileKey: vi.fn(),
    ...overrides,
  } as any;
}

// ─── McpResponse format helper ───

function assertValidMcpResponse(response: McpResponse) {
  expect(response).toHaveProperty('content');
  expect(Array.isArray(response.content)).toBe(true);
  expect(response.content.length).toBeGreaterThan(0);
  for (const item of response.content) {
    expect(item).toHaveProperty('type', 'text');
    expect(typeof item.text).toBe('string');
  }
  if (response.isError !== undefined) {
    expect(typeof response.isError).toBe('boolean');
  }
}

// ─── Tests ───

describe('getNodeInfoLogic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns valid McpResponse for a normal node ID', async () => {
    const bridge = createMockBridge();
    mockRequestWithFallback.mockResolvedValue({
      result: { id: '1:23', name: 'Frame', type: 'FRAME' },
      source: 'plugin',
    });

    const response = await getNodeInfoLogic(bridge, { nodeId: '1:23' });

    assertValidMcpResponse(response);
    expect(response.isError).toBeUndefined();
    expect(mockRequestWithFallback).toHaveBeenCalledWith(
      bridge,
      'get_node_info',
      { nodeId: '1:23' },
      expect.any(Function),
    );
  });

  it('extracts nodeId from a Figma URL with node-id param', async () => {
    const bridge = createMockBridge();
    mockRequestWithFallback.mockResolvedValue({
      result: { id: '705:60', name: 'Button' },
      source: 'plugin',
    });

    const url = 'https://www.figma.com/design/abc123?node-id=705-60';
    const response = await getNodeInfoLogic(bridge, { nodeId: url });

    assertValidMcpResponse(response);
    // Should have resolved to '705:60' after URL parsing
    expect(mockRequestWithFallback).toHaveBeenCalledWith(
      bridge,
      'get_node_info',
      { nodeId: '705:60' },
      expect.any(Function),
    );
  });

  it('returns error when Figma URL has no node-id', async () => {
    const bridge = createMockBridge();

    const url = 'https://www.figma.com/design/abc123';
    const response = await getNodeInfoLogic(bridge, { nodeId: url });

    assertValidMcpResponse(response);
    expect(response.content[0].text).toContain('Could not extract node ID');
    // Should NOT have called requestWithFallback
    expect(mockRequestWithFallback).not.toHaveBeenCalled();
  });

  it('returns guidance message when node is not found', async () => {
    const bridge = createMockBridge();
    mockRequestWithFallback.mockResolvedValue({
      result: { error: 'Node not found' },
      source: 'plugin',
    });

    const response = await getNodeInfoLogic(bridge, { nodeId: '999:999' });

    assertValidMcpResponse(response);
    expect(response.content.length).toBe(2);
    expect(response.content[1].text).toContain('Node not found');
    expect(response.content[1].text).toContain('create_document');
  });
});

describe('createDocumentLogic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects empty nodes array with isError: true', async () => {
    const bridge = createMockBridge();

    const response = await createDocumentLogic(bridge, { nodes: [] });

    assertValidMcpResponse(response);
    expect(response.isError).toBe(true);
    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain('nodes array must not be empty');
  });

  it('rejects invalid type in nodes with error info', async () => {
    const bridge = createMockBridge();

    const response = await createDocumentLogic(bridge, {
      nodes: [{ type: 'banana', name: 'Bad Node' }],
    });

    assertValidMcpResponse(response);
    expect(response.isError).toBe(true);
    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain('"banana"');
    expect(parsed.error).toContain('invalid');
  });

  it('rejects invalid role in nodes with error info', async () => {
    const bridge = createMockBridge();

    const response = await createDocumentLogic(bridge, {
      nodes: [{ type: 'frame', name: 'Bad Role', role: 'banana' }],
    });

    assertValidMcpResponse(response);
    expect(response.isError).toBe(true);
    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain('.role');
    expect(parsed.error).toContain('banana');
  });

  it('rejects missing type in nodes', async () => {
    const bridge = createMockBridge();

    const response = await createDocumentLogic(bridge, {
      nodes: [{ name: 'No Type' }],
    });

    assertValidMcpResponse(response);
    expect(response.isError).toBe(true);
    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.error).toContain('missing');
  });

  it('catches nested invalid type recursively', async () => {
    const bridge = createMockBridge();

    const response = await createDocumentLogic(bridge, {
      nodes: [{
        type: 'frame',
        children: [{
          type: 'text',
          children: [{ type: 'invalid_nested' }],
        }],
      }],
    });

    assertValidMcpResponse(response);
    expect(response.isError).toBe(true);
    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.error).toContain('invalid_nested');
    expect(parsed.error).toContain('children');
  });

  it('calls bridge.request for valid nodes', async () => {
    const bridge = createMockBridge();
    bridge.request.mockImplementation(async (method: string) => {
      if (method === 'create_document') {
        return {
          ok: true,
          created: [{ id: '1:1', name: 'Frame', type: 'FRAME' }],
        };
      }
      if (method === 'lint_check') {
        return {
          summary: { total: 1, pass: 1, violations: 0 },
          categories: [],
        };
      }
      if (method === 'lint_fix') {
        return { fixed: 0, failed: 0, errors: [] };
      }
      return { ok: true };
    });

    const response = await createDocumentLogic(bridge, {
      nodes: [{ type: 'frame', name: 'Test Frame' }],
    });

    assertValidMcpResponse(response);
    expect(response.isError).toBeUndefined();
    expect(bridge.request).toHaveBeenNthCalledWith(
      1,
      'create_document',
      { parentId: undefined, nodes: [{ type: 'frame', name: 'Test Frame', props: {} }] },
      120_000,
    );
    expect(bridge.request).toHaveBeenCalledWith(
      'lint_check',
      { nodeIds: ['1:1'], maxViolations: 200, minSeverity: 'warning' },
    );
    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.postCreateLint.final.violations).toBe(0);
  });

  it('accepts all valid node types', async () => {
    const bridge = createMockBridge();
    bridge.request.mockResolvedValue({ ok: true, created: [] });

    const validTypes = ['frame', 'text', 'rectangle', 'ellipse', 'line', 'vector', 'instance'];
    const nodes = validTypes.map((type) => ({ type, name: `Test ${type}` }));

    const response = await createDocumentLogic(bridge, { nodes });

    assertValidMcpResponse(response);
    expect(response.isError).toBeUndefined();
  });

  it('applies shared role defaults to explicit button/input specs before raw create_document', async () => {
    const bridge = createMockBridge();
    bridge.request.mockResolvedValue({ ok: true, created: [] });

    await createDocumentLogic(bridge, {
      nodes: [
        {
          type: 'frame',
          name: 'Primary CTA',
          role: 'button',
          children: [{ type: 'text', props: { content: 'Continue' } }],
        },
        {
          type: 'frame',
          name: 'Email Field',
          role: 'input',
          children: [{ type: 'text', props: { content: 'Email' } }],
        },
      ],
      autoLint: false,
    });

    const createCall = bridge.request.mock.calls[0];
    const sentNodes = createCall[1].nodes as Array<Record<string, unknown>>;
    const buttonProps = sentNodes[0].props as Record<string, unknown>;
    const inputProps = sentNodes[1].props as Record<string, unknown>;

    expect(buttonProps.autoLayout).toBe(true);
    expect(buttonProps.layoutDirection).toBe('HORIZONTAL');
    expect(buttonProps.height).toBe(48);
    expect(buttonProps.paddingLeft).toBe(24);
    expect(buttonProps.layoutAlign).toBe('STRETCH');

    expect(inputProps.autoLayout).toBe(true);
    expect(inputProps.layoutDirection).toBe('HORIZONTAL');
    expect(inputProps.height).toBe(48);
    expect(inputProps.stroke).toBe('#E0E0E0');
    expect(inputProps.layoutAlign).toBe('STRETCH');
  });

  it('converts raw margin helpers into inset wrappers before create_document', async () => {
    const bridge = createMockBridge();
    bridge.request.mockResolvedValue({ ok: true, created: [] });

    await createDocumentLogic(bridge, {
      nodes: [{
        type: 'frame',
        name: 'Primary CTA',
        role: 'button',
        props: { fill: '#111111', marginHorizontal: 24 },
        children: [{ type: 'text', props: { content: 'Continue' } }],
      }],
      autoLint: false,
    });

    const createCall = bridge.request.mock.calls[0];
    const wrapper = (createCall[1].nodes as Array<Record<string, unknown>>)[0];
    const wrapperProps = wrapper.props as Record<string, unknown>;
    const inner = (wrapper.children as Array<Record<string, unknown>>)[0];
    const innerProps = inner.props as Record<string, unknown>;

    expect(wrapper.name).toBe('Primary CTA Wrapper');
    expect(wrapper.type).toBe('frame');
    expect(wrapperProps.paddingLeft).toBe(24);
    expect(wrapperProps.paddingRight).toBe(24);
    expect(inner.name).toBe('Primary CTA');
    expect(inner.role).toBe('button');
    expect(innerProps.fill).toBe('#111111');
    expect(innerProps.marginHorizontal).toBeUndefined();
  });

  it('can skip scoped post-create lint when autoLint=false', async () => {
    const bridge = createMockBridge();
    bridge.request.mockResolvedValue({
      ok: true,
      created: [{ id: '1:1', name: 'Frame', type: 'FRAME' }],
    });

    const response = await createDocumentLogic(bridge, {
      nodes: [{ type: 'frame', name: 'Test Frame' }],
      autoLint: false,
    });

    assertValidMcpResponse(response);
    expect(bridge.request).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.postCreateLint.skipped).toBe(true);
  });

  it('runs scoped lint_fix on newly created roots and returns summary', async () => {
    const bridge = createMockBridge();
    let lintCheckCount = 0;
    bridge.request.mockImplementation(async (method: string, params: Record<string, unknown>) => {
      if (method === 'create_document') {
        return {
          ok: true,
          created: [{ id: '1:1', name: 'Frame', type: 'FRAME' }],
        };
      }
      if (method === 'lint_check') {
        lintCheckCount += 1;
        return lintCheckCount === 1
          ? {
              summary: { total: 1, pass: 0, violations: 1 },
              categories: [{ rule: 'button-structure', nodes: [{ nodeId: '1:1', autoFixable: true }] }],
            }
          : {
              summary: { total: 1, pass: 1, violations: 0 },
              categories: [],
            };
      }
      if (method === 'lint_fix') {
        expect(params.violations).toHaveLength(1);
        return { fixed: 1, failed: 0, errors: [] };
      }
      return { ok: true };
    });

    const response = await createDocumentLogic(bridge, {
      nodes: [{ type: 'frame', name: 'Test Frame' }],
    });

    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.postCreateLint.fixable).toBe(1);
    expect(parsed.postCreateLint.fixed).toBe(1);
    expect(parsed.postCreateLint.remaining).toBe(0);
  });

  it('keeps creation successful even when post-create lint fails', async () => {
    const bridge = createMockBridge();
    bridge.request.mockImplementation(async (method: string) => {
      if (method === 'create_document') {
        return {
          ok: true,
          created: [{ id: '1:1', name: 'Frame', type: 'FRAME' }],
        };
      }
      if (method === 'lint_check') {
        throw new Error('lint unavailable');
      }
      return { ok: true };
    });

    const response = await createDocumentLogic(bridge, {
      nodes: [{ type: 'frame', name: 'Test Frame' }],
    });

    assertValidMcpResponse(response);
    expect(response.isError).toBeUndefined();
    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.ok).toBe(true);
    expect(parsed.postCreateLint.error).toContain('lint unavailable');
  });

  it('marks the MCP response as error when create_document returns structural errors', async () => {
    const bridge = createMockBridge();
    bridge.request.mockResolvedValue({
      ok: false,
      created: [],
      structuralErrors: ['Root frame looks like a screen but is marked interactive'],
    });

    const response = await createDocumentLogic(bridge, {
      nodes: [{ type: 'frame', name: 'Sign In', role: 'button' }],
      autoLint: false,
    });

    assertValidMcpResponse(response);
    expect(response.isError).toBe(true);
    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.structuralErrors).toHaveLength(1);
  });
});

describe('createScreenLogic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates shell first, then sections under the created root, then final lint', async () => {
    const bridge = createMockBridge();
    const createCalls: Array<{ parentId?: string; nodes: Array<Record<string, unknown>> }> = [];
    let lintChecks = 0;

    bridge.request.mockImplementation(async (method: string, params: Record<string, unknown>) => {
      if (method === 'create_document') {
        createCalls.push(params as { parentId?: string; nodes: Array<Record<string, unknown>> });
        if (createCalls.length === 1) {
          return { ok: true, created: [{ id: 'screen:1', name: 'Auth Screen', type: 'FRAME' }] };
        }
        if (createCalls.length === 2) {
          return { ok: true, created: [{ id: 'header:1', name: 'Header', type: 'FRAME' }] };
        }
        return { ok: true, created: [{ id: 'form:1', name: 'Form', type: 'FRAME' }] };
      }
      if (method === 'lint_check') {
        lintChecks += 1;
        return { summary: { total: 1, pass: 1, violations: 0 }, categories: [] };
      }
      if (method === 'lint_fix') {
        return { fixed: 0, failed: 0, errors: [] };
      }
      return { ok: true };
    });

    const response = await createScreenLogic(bridge, {
      name: 'Auth Screen',
      platform: 'ios',
      shell: { props: { fill: '#FFFFFF' } },
      sections: [
        { name: 'Header', role: 'header', children: [{ type: 'text', props: { content: 'Sign In' } }] },
        { name: 'Form', role: 'form', children: [{ type: 'text', props: { content: 'Email' } }] },
      ],
    });

    assertValidMcpResponse(response);
    expect(createCalls).toHaveLength(3);
    expect(createCalls[0].parentId).toBeUndefined();
    expect(createCalls[0].nodes[0].role).toBe('screen');
    expect(createCalls[0].nodes[0].type).toBe('frame');
    expect((createCalls[0].nodes[0].props as Record<string, unknown>).width).toBe(402);
    expect((createCalls[0].nodes[0].props as Record<string, unknown>).itemSpacing).toBe(20);
    expect(createCalls[1].parentId).toBe('screen:1');
    expect(createCalls[2].parentId).toBe('screen:1');
    expect((createCalls[1].nodes[0].props as Record<string, unknown>).paddingLeft).toBe(24);
    expect((createCalls[1].nodes[0].props as Record<string, unknown>).itemSpacing).toBe(8);
    expect((createCalls[2].nodes[0].props as Record<string, unknown>).itemSpacing).toBe(16);
    expect(lintChecks).toBeGreaterThanOrEqual(4);

    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.ok).toBe(true);
    expect(parsed.screenRootId).toBe('screen:1');
    expect(parsed.sections).toHaveLength(2);
    expect(parsed.pipelineStages).toHaveLength(4);
    expect(parsed.pipelineStages[0].stage).toBe('shell');
    expect(parsed.pipelineStages[1].stage).toBe('section:1');
    expect(parsed.pipelineStages[3].stage).toBe('final');
    expect(parsed.pipelineSummary.stageCount).toBe(4);
    expect(parsed.finalLint.final.violations).toBe(0);
  });

  it('can wrap the created screen in a Figma Section', async () => {
    const bridge = createMockBridge();

    bridge.request.mockImplementation(async (method: string) => {
      if (method === 'create_document') {
        return { ok: true, created: [{ id: 'screen:1', name: 'Screen', type: 'FRAME' }] };
      }
      if (method === 'create_section') {
        return { id: 'section:1', name: 'Screen Section' };
      }
      if (method === 'lint_check') {
        return { summary: { total: 1, pass: 1, violations: 0 }, categories: [] };
      }
      if (method === 'lint_fix') {
        return { fixed: 0, failed: 0, errors: [] };
      }
      return { ok: true };
    });

    const response = await createScreenLogic(bridge, { wrapInSection: true });
    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.canvasSection.id).toBe('section:1');
  });

  it('fails fast when a section creation errors and does not proceed to later sections or final lint', async () => {
    const bridge = createMockBridge();
    const createCalls: Array<{ parentId?: string; nodes: Array<Record<string, unknown>> }> = [];

    bridge.request.mockImplementation(async (method: string, params: Record<string, unknown>) => {
      if (method === 'create_document') {
        createCalls.push(params as { parentId?: string; nodes: Array<Record<string, unknown>> });
        if (createCalls.length === 1) {
          return { ok: true, created: [{ id: 'screen:1', name: 'Screen', type: 'FRAME' }] };
        }
        return { ok: false, created: [], structuralErrors: ['section failed'] };
      }
      if (method === 'lint_check') {
        return { summary: { total: 1, pass: 1, violations: 0, bySeverity: { error: 0, warning: 0, info: 0, hint: 0 } }, categories: [] };
      }
      if (method === 'lint_fix') {
        return { fixed: 0, failed: 0, errors: [] };
      }
      return { ok: true };
    });

    const response = await createScreenLogic(bridge, {
      sections: [
        { name: 'Header', role: 'header' },
        { name: 'Form', role: 'form' },
      ],
    });

    expect(response.isError).toBe(true);
    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.failedStage).toBe('section:1');
    expect(parsed.sections).toHaveLength(1);
    expect(parsed.finalLint).toBeUndefined();
    expect(createCalls).toHaveLength(2);
  });

  it('applies one bounded patch_nodes pass for safe residual layout violations during final lint', async () => {
    const bridge = createMockBridge();
    let patched = false;

    bridge.request.mockImplementation(async (method: string, params: Record<string, unknown>, timeout?: number) => {
      if (method === 'create_document') {
        if (!params.parentId) {
          return { ok: true, created: [{ id: 'screen:1', name: 'Screen', type: 'FRAME' }] };
        }
        return { ok: true, created: [{ id: 'form:1', name: 'Form', type: 'FRAME' }] };
      }
      if (method === 'lint_check') {
        if (!patched) {
          return {
            summary: { total: 1, pass: 0, violations: 1, bySeverity: { error: 0, warning: 1, info: 0, hint: 0 } },
            categories: [{
              rule: 'cta-width-inconsistent',
              description: 'CTA width should match sibling fields',
              count: 1,
              nodes: [{
                nodeId: 'button:1',
                nodeName: 'Primary CTA',
                rule: 'cta-width-inconsistent',
                severity: 'warning',
                currentValue: 'CTA width 280px vs field width 320px',
                suggestion: 'Stretch the CTA.',
                autoFixable: true,
                fixData: { fix: 'stretch', layoutAlign: 'STRETCH' },
              }],
            }],
          };
        }
        return {
          summary: { total: 1, pass: 1, violations: 0, bySeverity: { error: 0, warning: 0, info: 0, hint: 0 } },
          categories: [],
        };
      }
      if (method === 'lint_fix') {
        return { fixed: 0, failed: 0, errors: [] };
      }
      if (method === 'patch_nodes') {
        patched = true;
        expect(params).toEqual({
          patches: [{
            nodeId: 'button:1',
            props: { layoutAlign: 'STRETCH' },
          }],
        });
        expect(timeout).toBe(60_000);
        return { results: [{ nodeId: 'button:1', ok: true }] };
      }
      return { ok: true };
    });

    const response = await createScreenLogic(bridge, {
      autoLint: false,
      sections: [{ name: 'Form', role: 'form' }],
    });

    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.ok).toBe(true);
    expect(parsed.finalLint.final.violations).toBe(0);
    expect(parsed.finalLint.patchAutoFix.patchCallCount).toBe(1);
    expect(parsed.finalLint.patchAutoFix.patchNodeCount).toBe(1);
    expect(parsed.finalLint.patchAutoFix.patchRules).toEqual(['cta-width-inconsistent']);
    expect(parsed.pipelineSummary.patchCallCount).toBe(1);
    expect(parsed.pipelineSummary.patchNodeCount).toBe(1);
    expect(bridge.request).toHaveBeenCalledWith('patch_nodes', {
      patches: [{
        nodeId: 'button:1',
        props: { layoutAlign: 'STRETCH' },
      }],
    }, 60_000);
  });

  it('applies role-driven defaults for button and input sections before creation', async () => {
    const bridge = createMockBridge();
    const createCalls: Array<{ parentId?: string; nodes: Array<Record<string, unknown>> }> = [];

    bridge.request.mockImplementation(async (method: string, params: Record<string, unknown>) => {
      if (method === 'create_document') {
        createCalls.push(params as { parentId?: string; nodes: Array<Record<string, unknown>> });
        if (createCalls.length === 1) {
          return { ok: true, created: [{ id: 'screen:1', name: 'Screen', type: 'FRAME' }] };
        }
        return { ok: true, created: [{ id: `node:${createCalls.length}`, name: 'Node', type: 'FRAME' }] };
      }
      if (method === 'lint_check') {
        return { summary: { total: 1, pass: 1, violations: 0 }, categories: [] };
      }
      if (method === 'lint_fix') {
        return { fixed: 0, failed: 0, errors: [] };
      }
      return { ok: true };
    });

    await createScreenLogic(bridge, {
      sections: [
        { name: 'Primary CTA', role: 'button', children: [{ type: 'text', props: { content: 'Continue' } }] },
        { name: 'Email Field', role: 'input', children: [{ type: 'text', props: { content: 'Email' } }] },
      ],
    });

    const buttonProps = createCalls[1].nodes[0].props as Record<string, unknown>;
    const inputProps = createCalls[2].nodes[0].props as Record<string, unknown>;
    expect(buttonProps.height).toBe(48);
    expect(buttonProps.layoutAlign).toBe('STRETCH');
    expect(inputProps.height).toBe(48);
    expect(inputProps.stroke).toBe('#E0E0E0');
    expect(inputProps.layoutAlign).toBe('STRETCH');
  });

  it('wraps inset sections in a transparent wrapper and strips orchestration-only margin props', async () => {
    const bridge = createMockBridge();
    const createCalls: Array<{ parentId?: string; nodes: Array<Record<string, unknown>> }> = [];

    bridge.request.mockImplementation(async (method: string, params: Record<string, unknown>) => {
      if (method === 'create_document') {
        createCalls.push(params as { parentId?: string; nodes: Array<Record<string, unknown>> });
        if (createCalls.length === 1) {
          return { ok: true, created: [{ id: 'screen:1', name: 'Screen', type: 'FRAME' }] };
        }
        return { ok: true, created: [{ id: 'node:2', name: 'Primary CTA Wrapper', type: 'FRAME' }] };
      }
      if (method === 'lint_check') {
        return { summary: { total: 1, pass: 1, violations: 0 }, categories: [] };
      }
      if (method === 'lint_fix') {
        return { fixed: 0, failed: 0, errors: [] };
      }
      return { ok: true };
    });

    await createScreenLogic(bridge, {
      sections: [
        {
          name: 'Primary CTA',
          role: 'button',
          props: { fill: '#111111', marginHorizontal: 24 },
          children: [{ type: 'text', props: { content: 'Continue' } }],
        },
      ],
    });

    const wrapper = createCalls[1].nodes[0];
    const wrapperProps = wrapper.props as Record<string, unknown>;
    const inner = (wrapper.children as Array<Record<string, unknown>>)[0];
    const innerProps = inner.props as Record<string, unknown>;

    expect(wrapper.name).toBe('Primary CTA Wrapper');
    expect(wrapper.type).toBe('frame');
    expect(wrapperProps.layoutAlign).toBe('STRETCH');
    expect(wrapperProps.paddingLeft).toBe(24);
    expect(wrapperProps.paddingRight).toBe(24);
    expect(inner.name).toBe('Primary CTA');
    expect(inner.role).toBe('button');
    expect(innerProps.fill).toBe('#111111');
    expect(innerProps.layoutAlign).toBe('STRETCH');
    expect(innerProps.marginHorizontal).toBeUndefined();
  });

  it('applies role-driven defaults for hero, content, and card sections', async () => {
    const bridge = createMockBridge();
    const createCalls: Array<{ parentId?: string; nodes: Array<Record<string, unknown>> }> = [];

    bridge.request.mockImplementation(async (method: string, params: Record<string, unknown>) => {
      if (method === 'create_document') {
        createCalls.push(params as { parentId?: string; nodes: Array<Record<string, unknown>> });
        if (createCalls.length === 1) {
          return { ok: true, created: [{ id: 'screen:1', name: 'Screen', type: 'FRAME' }] };
        }
        return { ok: true, created: [{ id: `node:${createCalls.length}`, name: 'Node', type: 'FRAME' }] };
      }
      if (method === 'lint_check') {
        return { summary: { total: 1, pass: 1, violations: 0 }, categories: [] };
      }
      if (method === 'lint_fix') {
        return { fixed: 0, failed: 0, errors: [] };
      }
      return { ok: true };
    });

    await createScreenLogic(bridge, {
      sections: [
        { name: 'Hero', role: 'hero' },
        { name: 'Content', role: 'content' },
        { name: 'Feature Card', role: 'card' },
      ],
    });

    const heroProps = createCalls[1].nodes[0].props as Record<string, unknown>;
    const contentProps = createCalls[2].nodes[0].props as Record<string, unknown>;
    const cardProps = createCalls[3].nodes[0].props as Record<string, unknown>;

    expect(heroProps.itemSpacing).toBe(12);
    expect(heroProps.paddingTop).toBe(24);
    expect(heroProps.paddingBottom).toBe(24);
    expect(contentProps.itemSpacing).toBe(20);
    expect(contentProps.paddingLeft).toBe(24);
    expect(contentProps.paddingRight).toBe(24);
    expect(cardProps.itemSpacing).toBe(12);
    expect(cardProps.paddingLeft).toBe(16);
    expect(cardProps.paddingTop).toBe(16);
    expect(cardProps.cornerRadius).toBe(16);
  });

  it('applies role-driven defaults for nav, list, row, and stats sections', async () => {
    const bridge = createMockBridge();
    const createCalls: Array<{ parentId?: string; nodes: Array<Record<string, unknown>> }> = [];

    bridge.request.mockImplementation(async (method: string, params: Record<string, unknown>) => {
      if (method === 'create_document') {
        createCalls.push(params as { parentId?: string; nodes: Array<Record<string, unknown>> });
        if (createCalls.length === 1) {
          return { ok: true, created: [{ id: 'screen:1', name: 'Screen', type: 'FRAME' }] };
        }
        return { ok: true, created: [{ id: `node:${createCalls.length}`, name: 'Node', type: 'FRAME' }] };
      }
      if (method === 'lint_check') {
        return { summary: { total: 1, pass: 1, violations: 0 }, categories: [] };
      }
      if (method === 'lint_fix') {
        return { fixed: 0, failed: 0, errors: [] };
      }
      return { ok: true };
    });

    await createScreenLogic(bridge, {
      sections: [
        { name: 'Primary Nav', role: 'nav' },
        { name: 'Metrics', role: 'stats' },
        { name: 'Activity List', role: 'list' },
        { name: 'Activity Row', role: 'row' },
      ],
    });

    const navProps = createCalls[1].nodes[0].props as Record<string, unknown>;
    const statsProps = createCalls[2].nodes[0].props as Record<string, unknown>;
    const listProps = createCalls[3].nodes[0].props as Record<string, unknown>;
    const rowProps = createCalls[4].nodes[0].props as Record<string, unknown>;

    expect(navProps.layoutDirection).toBe('HORIZONTAL');
    expect(navProps.primaryAxisAlignItems).toBe('SPACE_BETWEEN');
    expect(navProps.paddingLeft).toBe(24);
    expect(statsProps.layoutDirection).toBe('HORIZONTAL');
    expect(statsProps.itemSpacing).toBe(16);
    expect(statsProps.counterAxisAlignItems).toBe('CENTER');
    expect(statsProps.layoutAlign).toBe('STRETCH');
    expect(listProps.layoutDirection).toBe('VERTICAL');
    expect(listProps.itemSpacing).toBe(12);
    expect(rowProps.layoutDirection).toBe('HORIZONTAL');
    expect(rowProps.counterAxisAlignItems).toBe('CENTER');
    expect(rowProps.layoutAlign).toBe('STRETCH');
  });
});

describe('searchNodesLogic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns valid McpResponse format', async () => {
    const bridge = createMockBridge();
    bridge.request.mockResolvedValue([
      { id: '1:1', name: 'Button', type: 'FRAME' },
    ]);

    const response = await searchNodesLogic(bridge, { query: 'Button' });

    assertValidMcpResponse(response);
    expect(bridge.request).toHaveBeenCalledWith('search_nodes', {
      query: 'Button',
      types: undefined,
      limit: undefined,
    });
  });
});

describe('getCurrentPageLogic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns valid McpResponse with workflow hint', async () => {
    const bridge = createMockBridge();
    bridge.request.mockResolvedValue({
      name: 'Page 1',
      children: [],
    });

    const response = await getCurrentPageLogic(bridge, {});

    assertValidMcpResponse(response);
    // Should have 2 content items: data + workflow hint
    expect(response.content.length).toBe(2);
    expect(response.content[1].text).toContain('NEXT');
    expect(response.content[1].text).toContain('create_document');
  });
});

describe('exportImageLogic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns valid McpResponse format', async () => {
    const bridge = createMockBridge();
    mockRequestWithFallback.mockResolvedValue({
      result: { base64: 'abc123', format: 'PNG' },
      source: 'plugin',
    });

    const response = await exportImageLogic(bridge, { nodeId: '1:23' });

    assertValidMcpResponse(response);
    expect(response.isError).toBeUndefined();
    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.base64).toBe('abc123');
  });
});

// ─── Property-Based Tests ───
// Feature: endpoint-mode-refactor, Property 2: Tool_Logic_Function 返回格式一致性
// Validates: Requirements 1.2, 3.5

import fc from 'fast-check';
import { bridgeRequestLogic, registerEndpointTools } from '../packages/core-mcp/src/tools/endpoints.js';
import { listLibraryComponentsLogic } from '../packages/core-mcp/src/tools/logic/component-logic.js';

const mockListLibraryComponentsLogic = vi.mocked(listLibraryComponentsLogic);

/**
 * Validates that a value conforms to the McpResponse format:
 * { content: Array<{ type: 'text'; text: string }>; isError?: boolean }
 */
function isValidMcpResponse(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (!Array.isArray(obj.content)) return false;
  if (obj.content.length === 0) return false;
  for (const item of obj.content) {
    if (typeof item !== 'object' || item === null) return false;
    const entry = item as Record<string, unknown>;
    if (entry.type !== 'text') return false;
    if (typeof entry.text !== 'string') return false;
  }
  if (obj.isError !== undefined && typeof obj.isError !== 'boolean') return false;
  return true;
}

describe('Feature: endpoint-mode-refactor, Property 2: Tool_Logic_Function 返回格式一致性', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('bridgeRequestLogic always returns valid McpResponse for any bridge method name and any JSON-serializable result', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random method names (non-empty strings)
        fc.string({ minLength: 1, maxLength: 50 }),
        // Generate random JSON-serializable objects as bridge results
        fc.jsonValue(),
        async (methodName, bridgeResult) => {
          const bridge = createMockBridge();
          bridge.request.mockResolvedValue(bridgeResult);

          const response = await bridgeRequestLogic(bridge, methodName, { someParam: 'value' });

          expect(isValidMcpResponse(response)).toBe(true);
          expect(response.content.length).toBeGreaterThan(0);
          expect(response.content[0].type).toBe('text');
          expect(typeof response.content[0].text).toBe('string');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('createDocumentLogic always returns valid McpResponse for any input (valid or invalid nodes)', async () => {
    const validTypes = ['frame', 'text', 'rectangle', 'ellipse', 'line', 'vector', 'instance'];
    const invalidTypes = ['banana', 'div', 'span', '', 'FRAME', 'TEXT', 'unknown', '123'];
    const allTypes = [...validTypes, ...invalidTypes];

    await fc.assert(
      fc.asyncProperty(
        // Generate random arrays of node objects with random type fields
        fc.array(
          fc.record({
            type: fc.oneof(
              fc.constantFrom(...allTypes),
              fc.string({ minLength: 0, maxLength: 20 }),
            ),
            name: fc.option(fc.string({ minLength: 0, maxLength: 30 }), { nil: undefined }),
          }),
          { minLength: 0, maxLength: 10 },
        ),
        async (nodes) => {
          const bridge = createMockBridge();
          bridge.request.mockResolvedValue({
            ok: true,
            created: [{ id: '1:1', name: 'Node', type: 'FRAME' }],
          });

          const response = await createDocumentLogic(bridge, { nodes: nodes as any });

          // Regardless of input validity, the response must conform to McpResponse format
          expect(isValidMcpResponse(response)).toBe(true);
          expect(response.content.length).toBeGreaterThan(0);
          expect(response.content[0].type).toBe('text');
          expect(typeof response.content[0].text).toBe('string');
          if (response.isError !== undefined) {
            expect(typeof response.isError).toBe('boolean');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('getNodeInfoLogic always returns valid McpResponse for any nodeId string', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random strings as nodeId (including URLs, empty strings, special chars)
        fc.oneof(
          fc.string({ minLength: 0, maxLength: 100 }),
          fc.constantFrom(
            '1:23',
            '999:999',
            '',
            'https://www.figma.com/design/abc123?node-id=705-60',
            'https://www.figma.com/design/abc123',
            'https://www.figma.com/file/xyz',
            'not-a-url',
            '0:0',
          ),
        ),
        async (nodeId) => {
          const bridge = createMockBridge();
          // Mock requestWithFallback to return random results
          mockRequestWithFallback.mockResolvedValue({
            result: { id: nodeId, name: 'TestNode', type: 'FRAME' },
            source: 'plugin',
          });

          const response = await getNodeInfoLogic(bridge, { nodeId });

          // Response must always conform to McpResponse format
          expect(isValidMcpResponse(response)).toBe(true);
          expect(response.content.length).toBeGreaterThan(0);
          expect(response.content[0].type).toBe('text');
          expect(typeof response.content[0].text).toBe('string');
          if (response.isError !== undefined) {
            expect(typeof response.isError).toBe('boolean');
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ─── Property-Based Tests ───
// Feature: endpoint-mode-refactor, Property 1: Endpoint 与 Flat Tool 行为等价
// Validates: Requirements 1.1, 1.3, 6.2, 12.2

/**
 * Mapping of endpoint methods to their "flat tool equivalent" handler type.
 *
 * - 'logic:getNodeInfoLogic' / 'logic:searchNodesLogic' → calls the named logic function
 * - 'bridge:<method>' → calls bridgeRequestLogic(bridge, '<method>', params)
 *
 * Both the endpoint dispatcher and the flat tool ultimately call the same function,
 * so we verify equivalence by calling both paths and comparing results.
 */
const ENDPOINT_FLAT_EQUIVALENCE: Array<{
  endpoint: string;
  method: string;
  handler: { type: 'logic'; fn: 'getNodeInfoLogic' | 'searchNodesLogic' | 'listLibraryComponentsLogic' } | { type: 'bridge'; bridgeMethod: string };
  /** Factory that produces random valid params for this method (excluding `method` key) */
  paramsArb: fc.Arbitrary<Record<string, unknown>>;
}> = [
  // ── nodes endpoint ──
  {
    endpoint: 'nodes', method: 'get',
    handler: { type: 'logic', fn: 'getNodeInfoLogic' },
    paramsArb: fc.record({ nodeId: fc.stringMatching(/^[0-9]{1,4}:[0-9]{1,4}$/) }),
  },
  {
    endpoint: 'nodes', method: 'list',
    handler: { type: 'logic', fn: 'searchNodesLogic' },
    paramsArb: fc.record({
      query: fc.string({ minLength: 1, maxLength: 30 }),
      types: fc.option(fc.array(fc.constantFrom('FRAME', 'TEXT', 'RECTANGLE', 'ELLIPSE'), { minLength: 0, maxLength: 3 }), { nil: undefined }),
      limit: fc.option(fc.integer({ min: 1, max: 100 }), { nil: undefined }),
    }),
  },
  {
    endpoint: 'nodes', method: 'update',
    handler: { type: 'bridge', bridgeMethod: 'patch_nodes' },
    paramsArb: fc.record({
      patches: fc.array(
        fc.record({
          nodeId: fc.stringMatching(/^[0-9]{1,4}:[0-9]{1,4}$/),
          props: fc.constant({ name: 'Updated' }),
        }),
        { minLength: 0, maxLength: 3 },
      ),
    }),
  },
  {
    endpoint: 'nodes', method: 'delete',
    handler: { type: 'bridge', bridgeMethod: 'delete_nodes' },
    paramsArb: fc.record({
      nodeIds: fc.array(fc.stringMatching(/^[0-9]{1,4}:[0-9]{1,4}$/), { minLength: 0, maxLength: 5 }),
    }),
  },
  {
    endpoint: 'nodes', method: 'clone',
    handler: { type: 'bridge', bridgeMethod: 'clone_node' },
    paramsArb: fc.record({ nodeId: fc.stringMatching(/^[0-9]{1,4}:[0-9]{1,4}$/) }),
  },
  {
    endpoint: 'nodes', method: 'insert_child',
    handler: { type: 'bridge', bridgeMethod: 'insert_child' },
    paramsArb: fc.record({
      parentId: fc.stringMatching(/^[0-9]{1,4}:[0-9]{1,4}$/),
      childId: fc.stringMatching(/^[0-9]{1,4}:[0-9]{1,4}$/),
      index: fc.option(fc.integer({ min: 0, max: 20 }), { nil: undefined }),
    }),
  },
  // ── text endpoint ──
  {
    endpoint: 'text', method: 'create',
    handler: { type: 'bridge', bridgeMethod: 'create_text' },
    paramsArb: fc.record({
      content: fc.string({ minLength: 1, maxLength: 50 }),
      name: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
      fontSize: fc.option(fc.integer({ min: 8, max: 72 }), { nil: undefined }),
    }),
  },
  {
    endpoint: 'text', method: 'set_content',
    handler: { type: 'bridge', bridgeMethod: 'set_text_content' },
    paramsArb: fc.record({
      nodeId: fc.stringMatching(/^[0-9]{1,4}:[0-9]{1,4}$/),
      content: fc.string({ minLength: 1, maxLength: 50 }),
    }),
  },
  // ── shapes endpoint ──
  {
    endpoint: 'shapes', method: 'create_frame',
    handler: { type: 'bridge', bridgeMethod: 'create_frame' },
    paramsArb: fc.record({
      name: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
      width: fc.option(fc.integer({ min: 1, max: 1000 }), { nil: undefined }),
      height: fc.option(fc.integer({ min: 1, max: 1000 }), { nil: undefined }),
    }),
  },
  {
    endpoint: 'shapes', method: 'create_rectangle',
    handler: { type: 'bridge', bridgeMethod: 'create_rectangle' },
    paramsArb: fc.record({
      name: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
      width: fc.option(fc.integer({ min: 1, max: 1000 }), { nil: undefined }),
      height: fc.option(fc.integer({ min: 1, max: 1000 }), { nil: undefined }),
      fill: fc.option(fc.stringMatching(/^#[0-9A-F]{6}$/), { nil: undefined }),
    }),
  },
  {
    endpoint: 'shapes', method: 'create_ellipse',
    handler: { type: 'bridge', bridgeMethod: 'create_ellipse' },
    paramsArb: fc.record({
      name: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
      width: fc.option(fc.integer({ min: 1, max: 500 }), { nil: undefined }),
      height: fc.option(fc.integer({ min: 1, max: 500 }), { nil: undefined }),
    }),
  },
  {
    endpoint: 'shapes', method: 'create_vector',
    handler: { type: 'bridge', bridgeMethod: 'create_vector' },
    paramsArb: fc.record({
      svg: fc.constant('<svg><path d="M0 0"/></svg>'),
      name: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
    }),
  },
  // ── components endpoint ──
  {
    endpoint: 'components', method: 'list',
    handler: { type: 'bridge', bridgeMethod: 'list_components' },
    paramsArb: fc.constant({}),
  },
  {
    endpoint: 'components', method: 'get',
    handler: { type: 'bridge', bridgeMethod: 'get_component' },
    paramsArb: fc.record({ nodeId: fc.stringMatching(/^[0-9]{1,4}:[0-9]{1,4}$/) }),
  },
  {
    endpoint: 'components', method: 'create_instance',
    handler: { type: 'bridge', bridgeMethod: 'create_instance' },
    paramsArb: fc.record({
      componentKey: fc.option(fc.stringMatching(/^[a-z0-9]{5,10}$/), { nil: undefined }),
      componentId: fc.option(fc.stringMatching(/^[0-9]{1,4}:[0-9]{1,4}$/), { nil: undefined }),
      parentId: fc.option(fc.stringMatching(/^[0-9]{1,4}:[0-9]{1,4}$/), { nil: undefined }),
    }),
  },
  {
    endpoint: 'components', method: 'list_properties',
    handler: { type: 'bridge', bridgeMethod: 'list_component_properties' },
    paramsArb: fc.record({ nodeId: fc.stringMatching(/^[0-9]{1,4}:[0-9]{1,4}$/) }),
  },
  {
    endpoint: 'components', method: 'list_library',
    handler: { type: 'logic', fn: 'listLibraryComponentsLogic' },
    paramsArb: fc.record({
      fileKey: fc.option(fc.stringMatching(/^[a-zA-Z0-9]{5,15}$/), { nil: undefined }),
    }),
  },
];

/** Helper: create a mock MCP server that captures tool registrations */
function createMockServerForEndpoints() {
  const registeredTools: Record<string, (params: Record<string, unknown>) => Promise<unknown>> = {};
  const mockServer = {
    tool: vi.fn((name: string, _desc: string, _schema: unknown, callback: (params: Record<string, unknown>) => Promise<unknown>) => {
      registeredTools[name] = callback;
    }),
  };
  return { server: mockServer as any, registeredTools };
}

describe('Feature: endpoint-mode-refactor, Property 1: Endpoint 与 Flat Tool 行为等价', () => {
  /**
   * **Validates: Requirements 1.1, 1.3, 6.2, 12.2**
   *
   * For any valid tool operation parameters, calling through the endpoint method path
   * (e.g., nodes(method: "get", nodeId: X)) and through the corresponding flat tool path
   * (e.g., get_node_info(nodeId: X)) should produce the same result, because both call
   * the same Tool_Logic_Function.
   *
   * We verify this by:
   * 1. Registering endpoint tools on a mock server
   * 2. For each (endpoint, method, params), calling the endpoint dispatcher
   * 3. Independently calling the same logic function (getNodeInfoLogic / searchNodesLogic / bridgeRequestLogic)
   * 4. Asserting both produce deeply equal results
   */

  let registeredTools: Record<string, (params: Record<string, unknown>) => Promise<unknown>>;
  let sharedBridge: ReturnType<typeof createMockBridge>;

  beforeEach(() => {
    vi.clearAllMocks();
    const { server, registeredTools: tools } = createMockServerForEndpoints();
    sharedBridge = createMockBridge();
    // Deterministic bridge response for bridge-based methods
    sharedBridge.request.mockResolvedValue({ ok: true, data: 'mock-result' });
    // Deterministic requestWithFallback response for logic-function methods
    mockRequestWithFallback.mockResolvedValue({
      result: { id: '1:1', name: 'MockNode', type: 'FRAME' },
      source: 'plugin',
    });
    registerEndpointTools(server, sharedBridge);
    registeredTools = tools;
  });

  it('endpoint call and direct logic function call produce identical results for any valid (endpoint, method, params)', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Pick a random entry from the equivalence table, then generate random params for it
        fc.constantFrom(...ENDPOINT_FLAT_EQUIVALENCE).chain((entry) =>
          entry.paramsArb.map((params) => ({ ...entry, generatedParams: params })),
        ),
        async ({ endpoint, method, handler, generatedParams }) => {
          // Reset call tracking between iterations (but keep mock implementations)
          sharedBridge.request.mockClear();
          mockRequestWithFallback.mockClear();
          vi.mocked(getNodeInfoLogic).mockClear?.();
          vi.mocked(searchNodesLogic).mockClear?.();
          mockListLibraryComponentsLogic.mockClear();

          // ── Path A: Call through the endpoint dispatcher ──
          const endpointParams = { method, ...generatedParams };
          const endpointResult = await registeredTools[endpoint](endpointParams) as McpResponse;

          // ── Path B: Call the equivalent flat tool logic directly ──
          let flatResult: McpResponse;
          if (handler.type === 'logic') {
            if (handler.fn === 'getNodeInfoLogic') {
              flatResult = await getNodeInfoLogic(sharedBridge, { nodeId: generatedParams.nodeId as string });
            } else if (handler.fn === 'searchNodesLogic') {
              flatResult = await searchNodesLogic(sharedBridge, {
                query: generatedParams.query as string,
                types: generatedParams.types as string[] | undefined,
                limit: generatedParams.limit as number | undefined,
              });
            } else {
              // listLibraryComponentsLogic
              flatResult = await listLibraryComponentsLogic(sharedBridge, {
                fileKey: generatedParams.fileKey as string | undefined,
              });
            }
          } else {
            flatResult = await bridgeRequestLogic(sharedBridge, handler.bridgeMethod, generatedParams);
          }

          // ── Assert equivalence ──
          // Both paths should produce the same McpResponse content
          expect(endpointResult.content).toEqual(flatResult.content);
          expect(endpointResult.isError).toEqual(flatResult.isError);
        },
      ),
      { numRuns: 100 },
    );
  });
});
