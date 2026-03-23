/**
 * Endpoint-mode tools — resource-oriented API with method dispatch.
 *
 * Instead of ~33 flat tools, endpoints group related operations under a single resource:
 *   nodes(method: "get", nodeId: "1:23")   → getNodeInfoLogic()
 *   nodes(method: "update", patches: [...]) → bridge.request('patch_nodes', ...)
 *
 * Phase 1: endpoints coexist with legacy flat tools (controlled by FIGCRAFT_API_MODE).
 * Phase 2: deprecate flat tools. Phase 3: remove flat tools.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Bridge } from '../bridge.js';
import type { McpResponse } from './logic/node-logic.js';
import { getNodeInfoLogic, searchNodesLogic } from './logic/node-logic.js';
import { listLibraryComponentsLogic } from './logic/component-logic.js';
import {
  GENERATED_ENDPOINT_METHOD_ACCESS,
} from './_registry.js';
import { getAccessLevel } from './toolset-manager.js';

// ─── Generated endpoint Zod schemas ───
import {
  nodesEndpointSchema,
  textEndpointSchema,
  shapesEndpointSchema,
  componentsEndpointSchema,
  variables_epEndpointSchema,
  styles_epEndpointSchema,
} from './_generated.js';

// ─── Shared helpers ───

function jsonResponse(result: unknown): McpResponse {
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}

function errorResponse(message: string): McpResponse {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: message }, null, 2) }],
    isError: true,
  };
}

// ─── bridgeRequestLogic: generic wrapper for simple bridge methods ───

export async function bridgeRequestLogic(
  bridge: Bridge,
  bridgeMethod: string,
  params: Record<string, unknown>,
): Promise<McpResponse> {
  const result = await bridge.request(bridgeMethod, params);
  return jsonResponse(result);
}

// ─── Method Dispatcher ───

type MethodHandler = (
  bridge: Bridge,
  params: Record<string, unknown>,
) => Promise<McpResponse>;

interface EndpointConfig {
  name: string;
  methods: Record<string, MethodHandler>;
}

/**
 * Create a method dispatcher for an endpoint.
 * Validates method name, checks access control, then routes to the handler.
 */
function createMethodDispatcher(
  config: EndpointConfig,
  bridge: Bridge,
): (params: Record<string, unknown>) => Promise<McpResponse> {
  return async (params: Record<string, unknown>) => {
    const method = params.method as string;

    // 1. Validate method
    if (!config.methods[method]) {
      return errorResponse(
        `Unknown method "${method}" for endpoint "${config.name}". ` +
        `Available methods: ${Object.keys(config.methods).join(', ')}`,
      );
    }

    // 2. Method-level access control
    const methodAccess = GENERATED_ENDPOINT_METHOD_ACCESS[config.name]?.[method];
    if (methodAccess?.write) {
      const accessLevel = getAccessLevel();
      const methodAccessLevel = methodAccess.access ?? 'edit';

      if (accessLevel === 'read') {
        const readMethods = Object.entries(GENERATED_ENDPOINT_METHOD_ACCESS[config.name] ?? {})
          .filter(([, v]) => !v.write)
          .map(([k]) => k);
        return errorResponse(
          `Method "${method}" blocked by FIGCRAFT_ACCESS=read. ` +
          `Allowed read methods: ${readMethods.join(', ')}`,
        );
      }

      if (accessLevel === 'create' && methodAccessLevel === 'edit') {
        const allowedMethods = Object.entries(GENERATED_ENDPOINT_METHOD_ACCESS[config.name] ?? {})
          .filter(([, v]) => !v.write || v.access === 'create')
          .map(([k]) => k);
        return errorResponse(
          `Method "${method}" blocked by FIGCRAFT_ACCESS=create (edit-level method). ` +
          `Allowed methods: ${allowedMethods.join(', ')}`,
        );
      }
    }

    // 3. Route to handler
    return config.methods[method](bridge, params);
  };
}

// ─── Endpoint Registration ───

/**
 * Register all endpoint tools on the MCP server.
 * Each endpoint uses a generated Zod schema and a method dispatcher.
 */
export function registerEndpointTools(server: McpServer, bridge: Bridge): void {
  // ── nodes endpoint ──
  const nodesDispatcher = createMethodDispatcher({
    name: 'nodes',
    methods: {
      get: (b, p) => getNodeInfoLogic(b, { nodeId: p.nodeId as string }),
      list: (b, p) => searchNodesLogic(b, {
        query: p.query as string,
        types: p.types as string[] | undefined,
        limit: p.limit as number | undefined,
      }),
      update: (b, p) => bridgeRequestLogic(b, 'patch_nodes', { patches: p.patches }),
      delete: (b, p) => bridgeRequestLogic(b, 'delete_nodes', { nodeIds: p.nodeIds }),
      clone: (b, p) => bridgeRequestLogic(b, 'clone_node', { nodeId: p.nodeId }),
      insert_child: (b, p) => bridgeRequestLogic(b, 'insert_child', {
        parentId: p.parentId, childId: p.childId, index: p.index,
      }),
    },
  }, bridge);

  server.tool(
    'nodes',
    'Node operations — get, list, update, delete, clone, insert_child. For creating nodes, use create_document (batch) or shapes/text endpoints.',
    nodesEndpointSchema,
    async (params) => nodesDispatcher(params as Record<string, unknown>),
  );

  // ── text endpoint ──
  const textDispatcher = createMethodDispatcher({
    name: 'text',
    methods: {
      create: (b, p) => bridgeRequestLogic(b, 'create_text', {
        content: p.content, name: p.name, x: p.x, y: p.y,
        fontSize: p.fontSize, fontFamily: p.fontFamily, fontStyle: p.fontStyle,
        fill: p.fill, parentId: p.parentId,
      }),
      set_content: (b, p) => bridgeRequestLogic(b, 'set_text_content', {
        nodeId: p.nodeId, content: p.content,
      }),
    },
  }, bridge);

  server.tool(
    'text',
    'Text node operations — create text nodes and update text content.',
    textEndpointSchema,
    async (params) => textDispatcher(params as Record<string, unknown>),
  );

  // ── shapes endpoint ──
  const shapesDispatcher = createMethodDispatcher({
    name: 'shapes',
    methods: {
      create_frame: (b, p) => bridgeRequestLogic(b, 'create_frame', {
        name: p.name, x: p.x, y: p.y, width: p.width, height: p.height,
        parentId: p.parentId, autoLayout: p.autoLayout, layoutDirection: p.layoutDirection,
        itemSpacing: p.itemSpacing, padding: p.padding,
        paddingLeft: p.paddingLeft, paddingRight: p.paddingRight,
        paddingTop: p.paddingTop, paddingBottom: p.paddingBottom,
        primaryAxisAlignItems: p.primaryAxisAlignItems,
        counterAxisAlignItems: p.counterAxisAlignItems, fill: p.fill,
      }),
      create_rectangle: (b, p) => bridgeRequestLogic(b, 'create_rectangle', {
        name: p.name, x: p.x, y: p.y, width: p.width, height: p.height,
        parentId: p.parentId, fill: p.fill, cornerRadius: p.cornerRadius,
        stroke: p.stroke, strokeWeight: p.strokeWeight,
      }),
      create_ellipse: (b, p) => bridgeRequestLogic(b, 'create_ellipse', {
        name: p.name, x: p.x, y: p.y, width: p.width, height: p.height,
        parentId: p.parentId, fill: p.fill, stroke: p.stroke, strokeWeight: p.strokeWeight,
      }),
      create_vector: (b, p) => bridgeRequestLogic(b, 'create_vector', {
        svg: p.svg, name: p.name, x: p.x, y: p.y, resize: p.resize, parentId: p.parentId,
      }),
    },
  }, bridge);

  server.tool(
    'shapes',
    'Shape creation operations — create frames, rectangles, ellipses, and vectors.',
    shapesEndpointSchema,
    async (params) => shapesDispatcher(params as Record<string, unknown>),
  );

  // ── components endpoint ──
  const componentsDispatcher = createMethodDispatcher({
    name: 'components',
    methods: {
      list: (b, _p) => bridgeRequestLogic(b, 'list_components', {}),
      list_library: (b, p) => listLibraryComponentsLogic(b, { fileKey: p.fileKey as string | undefined }),
      get: (b, p) => bridgeRequestLogic(b, 'get_component', { nodeId: p.nodeId }),
      create_instance: (b, p) => bridgeRequestLogic(b, 'create_instance', {
        componentId: p.componentId, componentKey: p.componentKey,
        properties: p.properties, parentId: p.parentId,
      }),
      list_properties: (b, p) => bridgeRequestLogic(b, 'list_component_properties', { nodeId: p.nodeId }),
    },
  }, bridge);

  server.tool(
    'components',
    'Component operations — list, get, create instances, and manage properties.',
    componentsEndpointSchema,
    async (params) => componentsDispatcher(params as Record<string, unknown>),
  );

  // ── variables_ep endpoint ──
  const variablesDispatcher = createMethodDispatcher({
    name: 'variables_ep',
    methods: {
      list: (b, p) => bridgeRequestLogic(b, 'list_variables', { collectionId: p.collectionId, type: p.type }),
      get: (b, p) => bridgeRequestLogic(b, 'get_variable', { variableId: p.variableId }),
      list_collections: (b, _p) => bridgeRequestLogic(b, 'list_collections', {}),
      get_bindings: (b, p) => bridgeRequestLogic(b, 'get_node_variables', { nodeId: p.nodeId }),
      set_binding: (b, p) => bridgeRequestLogic(b, 'set_variable_binding', {
        nodeId: p.nodeId, field: p.field, variableId: p.variableId,
      }),
      create: (b, p) => bridgeRequestLogic(b, 'create_variable', {
        name: p.name, collectionId: p.collectionId, resolvedType: p.resolvedType,
        value: p.value, modeId: p.modeId, description: p.description, scopes: p.scopes,
      }),
      update: (b, p) => bridgeRequestLogic(b, 'update_variable', {
        variableId: p.variableId, name: p.name, description: p.description,
        scopes: p.scopes, value: p.value, modeId: p.modeId,
      }),
      delete: (b, p) => bridgeRequestLogic(b, 'delete_variable', { variableId: p.variableId }),
      create_collection: (b, p) => bridgeRequestLogic(b, 'create_collection', { name: p.name }),
      delete_collection: (b, p) => bridgeRequestLogic(b, 'delete_collection', { collectionId: p.collectionId }),
      batch_create: (b, p) => bridgeRequestLogic(b, 'batch_create_variables', {
        collectionName: p.collectionName, modeName: p.modeName, variables: p.variables,
      }),
      export: (b, p) => bridgeRequestLogic(b, 'export_variables', { collectionId: p.collectionId }),
    },
  }, bridge);

  server.tool(
    'variables_ep',
    'Variable operations — list, get, create, update, delete variables, collections, and modes.',
    variables_epEndpointSchema,
    async (params) => variablesDispatcher(params as Record<string, unknown>),
  );

  // ── styles_ep endpoint ──
  const stylesDispatcher = createMethodDispatcher({
    name: 'styles_ep',
    methods: {
      list: (b, p) => bridgeRequestLogic(b, 'list_styles', { type: p.type }),
      get: (b, p) => bridgeRequestLogic(b, 'get_style', { styleId: p.styleId }),
      create_paint: (b, p) => bridgeRequestLogic(b, 'create_paint_style', {
        name: p.name, color: p.color, description: p.description,
      }),
      update_paint: (b, p) => bridgeRequestLogic(b, 'update_paint_style', {
        styleId: p.styleId, name: p.name, description: p.description, color: p.color,
      }),
      update_text: (b, p) => bridgeRequestLogic(b, 'update_text_style', {
        styleId: p.styleId, name: p.name, description: p.description,
        fontFamily: p.fontFamily, fontStyle: p.fontStyle, fontSize: p.fontSize,
        lineHeight: p.lineHeight, letterSpacing: p.letterSpacing,
      }),
      update_effect: (b, p) => bridgeRequestLogic(b, 'update_effect_style', {
        styleId: p.styleId, name: p.name, description: p.description, effects: p.effects,
      }),
      delete: (b, p) => bridgeRequestLogic(b, 'delete_style', { styleId: p.styleId }),
      sync: (b, p) => bridgeRequestLogic(b, 'sync_styles', { tokens: p.tokens }),
    },
  }, bridge);

  server.tool(
    'styles_ep',
    'Style operations — list, get, create, update, delete, and sync styles.',
    styles_epEndpointSchema,
    async (params) => stylesDispatcher(params as Record<string, unknown>),
  );
}
