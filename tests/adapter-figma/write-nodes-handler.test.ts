import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../packages/adapter-figma/src/utils/design-context.js', () => ({
  autoBindDefault: vi.fn().mockResolvedValue(null),
  autoBindTypography: vi.fn().mockResolvedValue(null),
}));

vi.mock('../packages/adapter-figma/src/utils/style-registry.js', () => ({
  ensureLoaded: vi.fn().mockResolvedValue(undefined),
  getTextStyleId: vi.fn().mockResolvedValue(null),
  suggestTextStyle: vi.fn(() => null),
}));

vi.mock('../packages/adapter-figma/src/utils/node-lookup.js', () => ({
  findNodeByIdAsync: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../packages/adapter-figma/src/utils/node-helpers.js', () => ({
  applyFill: vi.fn().mockResolvedValue({ autoBound: null }),
  applyStroke: vi.fn().mockResolvedValue(undefined),
  applyAutoLayout: vi.fn().mockResolvedValue([]),
  applyCornerRadius: vi.fn().mockResolvedValue([]),
  applyPerSideStrokeWeights: vi.fn().mockResolvedValue([]),
  translateSingleSizing: vi.fn(),
  applyTokenField: vi.fn(),
  applyTokenFields: vi.fn(),
}));

import {
  invalidateModeCache,
  registerWriteNodeHandlers,
} from '../../packages/adapter-figma/src/handlers/write-nodes.js';
import { handlers } from '../../packages/adapter-figma/src/registry.js';

type MockSceneNode = {
  id: string;
  type: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  parent: MockContainerNode | null;
  absoluteBoundingBox: { x: number; y: number; width: number; height: number };
  resize: (width: number, height: number) => void;
  remove: () => void;
  setPluginData: (key: string, value: string) => void;
  [key: string]: unknown;
};

type MockContainerNode = MockSceneNode & {
  children: MockSceneNode[];
  appendChild: (child: MockSceneNode) => void;
};

function createMockFigma() {
  let nextId = 1;
  const nodeMap = new Map<string, MockSceneNode>();

  const currentPage: MockContainerNode = {
    id: 'page:1',
    type: 'PAGE',
    name: 'Page 1',
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    parent: null,
    children: [],
    absoluteBoundingBox: { x: 0, y: 0, width: 0, height: 0 },
    resize(width: number, height: number) {
      this.width = width;
      this.height = height;
      this.absoluteBoundingBox = { x: this.x, y: this.y, width, height };
    },
    appendChild(child: MockSceneNode) {
      if (child.parent) {
        child.parent.children = child.parent.children.filter((candidate) => candidate.id !== child.id);
      }
      child.parent = this;
      this.children.push(child);
    },
    remove() {},
    setPluginData() {},
  };

  function registerNode<T extends MockSceneNode>(node: T): T {
    nodeMap.set(node.id, node);
    currentPage.appendChild(node);
    return node;
  }

  function createBaseNode(type: string, name: string, withChildren = false): MockSceneNode | MockContainerNode {
    const id = `${type.toLowerCase()}:${nextId++}`;
    const node: MockSceneNode = {
      id,
      type,
      name,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      parent: null,
      absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
      resize(width: number, height: number) {
        node.width = width;
        node.height = height;
        node.absoluteBoundingBox = { x: node.x, y: node.y, width, height };
      },
      remove() {
        if (node.parent) {
          node.parent.children = node.parent.children.filter((candidate) => candidate.id !== node.id);
          node.parent = null;
        }
        nodeMap.delete(node.id);
      },
      setPluginData() {},
    };

    if (!withChildren) return node;

    const containerNode = node as MockContainerNode;
    containerNode.children = [];
    containerNode.appendChild = (child: MockSceneNode) => {
      if (child.parent) {
        child.parent.children = child.parent.children.filter((candidate) => candidate.id !== child.id);
      }
      child.parent = containerNode;
      containerNode.children.push(child);
    };
    return containerNode;
  }

  return {
    currentPage: Object.assign(currentPage, {
      selection: [] as MockSceneNode[],
      findAll: (predicate: (node: MockSceneNode) => boolean) => {
        const results: MockSceneNode[] = [];
        const visit = (node: MockContainerNode | MockSceneNode) => {
          if (node.type !== 'PAGE' && predicate(node)) results.push(node);
          if ('children' in node) {
            for (const child of node.children) visit(child as MockContainerNode | MockSceneNode);
          }
        };
        visit(currentPage);
        return results;
      },
    }),
    viewport: {
      scrollAndZoomIntoView: vi.fn(),
    },
    ui: {
      postMessage: vi.fn(),
    },
    clientStorage: {
      getAsync: vi.fn().mockResolvedValue(undefined),
      setAsync: vi.fn().mockResolvedValue(undefined),
    },
    loadFontAsync: vi.fn().mockResolvedValue(undefined),
    getStyleByIdAsync: vi.fn(async (_id: string) => null),
    getNodeById: vi.fn((id: string) => nodeMap.get(id) ?? null),
    getNodeByIdAsync: vi.fn(async (id: string) => nodeMap.get(id) ?? null),
    createFrame: vi.fn(() => registerNode(createBaseNode('FRAME', 'Frame', true) as MockContainerNode)),
    createText: vi.fn(() => {
      const text = createBaseNode('TEXT', 'Text') as MockSceneNode & {
        characters: string;
        fontName?: { family: string; style: string };
        fontSize?: number;
        fills?: unknown[];
      };
      text.height = 16;
      text.absoluteBoundingBox = { x: 0, y: 0, width: 100, height: 16 };
      text.characters = '';
      return registerNode(text);
    }),
    createRectangle: vi.fn(() => registerNode(createBaseNode('RECTANGLE', 'Rectangle') as MockSceneNode)),
    createEllipse: vi.fn(() => registerNode(createBaseNode('ELLIPSE', 'Ellipse') as MockSceneNode)),
    createLine: vi.fn(() => registerNode(createBaseNode('LINE', 'Line') as MockSceneNode)),
    createNodeFromSvg: vi.fn(() => registerNode(createBaseNode('VECTOR', 'Vector') as MockSceneNode)),
  };
}

describe('write-nodes handler (patch/delete)', () => {
  beforeEach(() => {
    handlers.clear();
    invalidateModeCache();
    vi.stubGlobal('figma', createMockFigma());
    registerWriteNodeHandlers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    handlers.clear();
  });

  it('set_text_content handler is registered', () => {
    expect(handlers.get('set_text_content')).toBeDefined();
  });

  it('patch_nodes handler is registered', () => {
    expect(handlers.get('patch_nodes')).toBeDefined();
  });

  it('delete_node handler is registered', () => {
    expect(handlers.get('delete_node')).toBeDefined();
  });

  it('delete_nodes handler is registered', () => {
    expect(handlers.get('delete_nodes')).toBeDefined();
  });

  // ── P1-2: patch_nodes textStyleId support ──
  // Regression guards for the "rebind text style after detach" path.
  // Previously textStyleId was silently dropped into _unknownProps because it
  // wasn't in ALL_KNOWN — see components.ts P0-1 plan for the full story.
  describe('patch_nodes textStyleId (P1-2)', () => {
    // Create a TEXT node, attach setTextStyleIdAsync spy, register in figma.
    // Returns { textNode, setTextStyleIdAsyncSpy } for assertions.
    function createTextNodeWithStyleSpy(id: string) {
      const setTextStyleIdAsyncSpy = vi.fn().mockResolvedValue(undefined);
      const textNode = {
        id,
        type: 'TEXT',
        name: 'Button Label',
        x: 0,
        y: 0,
        width: 100,
        height: 20,
        parent: null,
        absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 20 },
        characters: 'Click me',
        fontName: { family: 'Inter', style: 'Regular' },
        fontSize: 14,
        setTextStyleIdAsync: setTextStyleIdAsyncSpy,
        resize: vi.fn(),
        remove: vi.fn(),
        setPluginData: vi.fn(),
      };
      // Stub getNodeByIdAsync to return this node for the given id.
      (figma.getNodeByIdAsync as ReturnType<typeof vi.fn>).mockImplementation(async (nodeId: string) =>
        nodeId === id ? textNode : null,
      );
      return { textNode, setTextStyleIdAsyncSpy };
    }

    it('accepts textStyleId in props and does not treat it as unknown', async () => {
      const { setTextStyleIdAsyncSpy } = createTextNodeWithStyleSpy('text:1');
      // Mock getStyleByIdAsync to return a valid TEXT style.
      (figma.getStyleByIdAsync as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'S:xyz',
        type: 'TEXT',
        fontName: { family: 'Inter', style: 'Semi Bold' },
      });

      const patchHandler = handlers.get('patch_nodes');
      expect(patchHandler).toBeDefined();
      const response = (await patchHandler!({
        patches: [{ nodeId: 'text:1', props: { textStyleId: 'S:xyz' } }],
      })) as { results: Array<{ nodeId: string; ok: boolean; _unknownProps?: string[]; _warnings?: string[] }> };

      expect(response.results).toHaveLength(1);
      const [result] = response.results;
      expect(result.ok).toBe(true);
      // textStyleId must NOT be reported as unknown — the dedicated branch handles it.
      expect(result._unknownProps ?? []).not.toContain('textStyleId');
      // The dedicated branch must call setTextStyleIdAsync with the requested id.
      expect(setTextStyleIdAsyncSpy).toHaveBeenCalledWith('S:xyz');
      // And must preload the target style's font first (otherwise Figma throws).
      expect(figma.loadFontAsync).toHaveBeenCalledWith({ family: 'Inter', style: 'Semi Bold' });
    });

    it('emits a warning (not a hard failure) when textStyleId does not resolve to a TEXT style', async () => {
      const { setTextStyleIdAsyncSpy } = createTextNodeWithStyleSpy('text:2');
      // Return a PAINT style for the id — should be rejected as non-TEXT.
      (figma.getStyleByIdAsync as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'S:paint',
        type: 'PAINT',
      });

      const patchHandler = handlers.get('patch_nodes');
      const response = (await patchHandler!({
        patches: [{ nodeId: 'text:2', props: { textStyleId: 'S:paint' } }],
      })) as { results: Array<{ nodeId: string; ok: boolean; _unknownProps?: string[]; _warnings?: string[] }> };

      const [result] = response.results;
      // Patch still succeeds — textStyleId mismatch is a warning, not a fatal error.
      expect(result.ok).toBe(true);
      // A warning must be attached explaining the mismatch.
      expect(result._warnings ?? []).toEqual(
        expect.arrayContaining([expect.stringContaining('does not resolve to a TEXT style')]),
      );
      // setTextStyleIdAsync must NOT be called on a non-TEXT style.
      expect(setTextStyleIdAsyncSpy).not.toHaveBeenCalled();
    });
  });
});
