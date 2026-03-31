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

import { handlers } from '../../packages/adapter-figma/src/registry.js';
import { invalidateModeCache, registerWriteNodeHandlers } from '../../packages/adapter-figma/src/handlers/write-nodes.js';

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
});
