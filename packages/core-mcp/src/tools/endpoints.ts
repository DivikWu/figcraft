/**
 * Endpoint-mode tools — resource-oriented API with method dispatch.
 *
 * Endpoints group related operations under a single resource:
 *   nodes(method: "get", nodeId: "1:23")   → getNodeInfoLogic()
 *   nodes(method: "update", patches: [...]) → bridge.request('patch_nodes', ...)
 *
 * Creation endpoints (shapes, text.create, components.create_instance) have been
 * removed — creation is delegated to the official Figma MCP.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Bridge } from '../bridge.js';
// ─── Generated endpoint Zod schemas ───
import {
  componentsEndpointSchema,
  nodesEndpointSchema,
  styles_epEndpointSchema,
  textEndpointSchema,
  variables_epEndpointSchema,
} from './_generated.js';
import { GENERATED_ENDPOINT_METHOD_ACCESS } from './_registry.js';
import { listLibraryComponentsLogic } from './logic/component-logic.js';
import { getNodeInfoLogic, searchNodesLogic } from './logic/node-logic.js';
import type { McpResponse } from './response-helpers.js';
import { compactResponse, errorResponse } from './response-helpers.js';
import { getAccessLevel } from './toolset-manager.js';

/**
 * Build an access-aware description for an endpoint.
 * When access level restricts some methods, appends a note listing blocked methods.
 */
function buildEndpointDescription(endpointName: string, baseDescription: string): string {
  const accessLevel = getAccessLevel();
  if (accessLevel === 'edit') return baseDescription;

  const methodAccess = GENERATED_ENDPOINT_METHOD_ACCESS[endpointName];
  if (!methodAccess) return baseDescription;

  const blocked: string[] = [];
  for (const [method, access] of Object.entries(methodAccess)) {
    if (!access.write) continue;
    const methodLevel = access.access ?? 'edit';
    if (accessLevel === 'read') {
      blocked.push(method);
    } else if (accessLevel === 'create' && methodLevel === 'edit') {
      blocked.push(method);
    }
  }

  if (blocked.length === 0) return baseDescription;
  return `${baseDescription} [FIGCRAFT_ACCESS=${accessLevel}: ${blocked.join(', ')} blocked]`;
}

// ─── bridgeRequestLogic: generic wrapper for simple bridge methods ───

export async function bridgeRequestLogic(
  bridge: Bridge,
  bridgeMethod: string,
  params: Record<string, unknown>,
): Promise<McpResponse> {
  const result = await bridge.request(bridgeMethod, params);
  return compactResponse(result);
}

// ─── Method Dispatcher ───

type MethodHandler = (bridge: Bridge, params: Record<string, unknown>) => Promise<McpResponse>;

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
          `Method "${method}" blocked by FIGCRAFT_ACCESS=read. ` + `Allowed read methods: ${readMethods.join(', ')}`,
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
 *
 * Removed endpoints: shapes (all creation), text.create,
 * nodes.insert_child, components.create_instance.
 */
export function registerEndpointTools(server: McpServer, bridge: Bridge): void {
  // ── nodes endpoint (get, list, update, delete) ──
  const nodesDispatcher = createMethodDispatcher(
    {
      name: 'nodes',
      methods: {
        get: (b, p) => getNodeInfoLogic(b, { nodeId: p.nodeId as string }),
        get_batch: async (b, p) => {
          const result = await b.request('get_node_info_batch', {
            nodeIds: p.nodeIds,
            detail: p.detail ?? 'standard',
          });
          return compactResponse(result);
        },
        list: (b, p) =>
          searchNodesLogic(b, {
            query: p.query as string,
            types: p.types as string[] | undefined,
            limit: p.limit as number | undefined,
          }),
        update: (b, p) => bridgeRequestLogic(b, 'patch_nodes', { patches: p.patches }),
        delete: (b, p) =>
          bridgeRequestLogic(b, 'delete_nodes', {
            nodeIds: p.nodeIds ?? (p.nodeId ? [p.nodeId as string] : []),
          }),
        clone: (b, p) => bridgeRequestLogic(b, 'clone_nodes', { items: p.items }),
        reparent: (b, p) => bridgeRequestLogic(b, 'reparent_nodes', { items: p.items }),
      },
    },
    bridge,
  );

  server.tool(
    'nodes',
    buildEndpointDescription('nodes', 'Node operations — get, list, update, delete, clone, reparent.'),
    nodesEndpointSchema,
    async (params) => nodesDispatcher(params as Record<string, unknown>),
  );

  // ── text endpoint ──
  const textDispatcher = createMethodDispatcher(
    {
      name: 'text',
      methods: {
        set_content: (b, p) =>
          bridgeRequestLogic(b, 'set_text_content', {
            nodeId: p.nodeId,
            content: p.content,
          }),
        set_range: (b, p) =>
          bridgeRequestLogic(b, 'set_text_range', {
            nodeId: p.nodeId,
            operations: p.operations,
          }),
      },
    },
    bridge,
  );

  server.tool(
    'text',
    buildEndpointDescription('text', 'Text node operations — update text content.'),
    textEndpointSchema,
    async (params) => textDispatcher(params as Record<string, unknown>),
  );

  // ── components endpoint (list, list_library, get, list_properties) ──
  const componentsDispatcher = createMethodDispatcher(
    {
      name: 'components',
      methods: {
        list: (b, _p) => bridgeRequestLogic(b, 'list_components', {}),
        list_library: (b, p) => listLibraryComponentsLogic(b, { fileKey: p.fileKey as string | undefined }),
        get: (b, p) => bridgeRequestLogic(b, 'get_component', { nodeId: p.nodeId }),
        list_properties: (b, p) => bridgeRequestLogic(b, 'list_component_properties', { nodeId: p.nodeId }),
      },
    },
    bridge,
  );

  server.tool(
    'components',
    buildEndpointDescription('components', 'Component operations — list, get, and inspect properties.'),
    componentsEndpointSchema,
    async (params) => componentsDispatcher(params as Record<string, unknown>),
  );

  // ── variables_ep endpoint ──
  const variablesDispatcher = createMethodDispatcher(
    {
      name: 'variables_ep',
      methods: {
        list: (b, p) => bridgeRequestLogic(b, 'list_variables', { collectionId: p.collectionId, type: p.type }),
        get: (b, p) => bridgeRequestLogic(b, 'get_variable', { variableId: p.variableId }),
        list_collections: (b, _p) => bridgeRequestLogic(b, 'list_collections', {}),
        get_bindings: (b, p) => bridgeRequestLogic(b, 'get_node_variables', { nodeId: p.nodeId }),
        set_binding: (b, p) =>
          bridgeRequestLogic(b, 'set_variable_binding', {
            nodeId: p.nodeId,
            field: p.field,
            variableId: p.variableId,
          }),
        create: (b, p) =>
          bridgeRequestLogic(b, 'create_variable', {
            name: p.name,
            collectionId: p.collectionId,
            resolvedType: p.resolvedType,
            value: p.value,
            modeId: p.modeId,
            description: p.description,
            scopes: p.scopes,
          }),
        update: (b, p) =>
          bridgeRequestLogic(b, 'update_variable', {
            variableId: p.variableId,
            name: p.name,
            description: p.description,
            scopes: p.scopes,
            value: p.value,
            modeId: p.modeId,
          }),
        delete: (b, p) => bridgeRequestLogic(b, 'delete_variable', { variableId: p.variableId }),
        create_collection: (b, p) => bridgeRequestLogic(b, 'create_collection', { name: p.name }),
        delete_collection: (b, p) => bridgeRequestLogic(b, 'delete_collection', { collectionId: p.collectionId }),
        batch_create: (b, p) =>
          bridgeRequestLogic(b, 'batch_create_variables', {
            collectionName: p.collectionName,
            modeName: p.modeName,
            variables: p.variables,
          }),
        export: (b, p) => bridgeRequestLogic(b, 'export_variables', { collectionId: p.collectionId }),
        set_code_syntax: (b, p) =>
          bridgeRequestLogic(b, 'set_variable_code_syntax', {
            variableId: p.variableId,
            syntax: p.syntax,
          }),
        batch_bind: (b, p) =>
          bridgeRequestLogic(b, 'batch_set_variable_binding', {
            bindings: p.bindings,
          }),
        set_values_multi_mode: (b, p) =>
          bridgeRequestLogic(b, 'set_variable_values_multi_mode', {
            variableId: p.variableId,
            valuesByMode: p.valuesByMode,
          }),
        extend_collection: (b, p) =>
          bridgeRequestLogic(b, 'extend_collection', {
            collectionId: p.collectionId,
            collectionKey: p.collectionKey,
            name: p.name,
          }),
        get_overrides: (b, p) =>
          bridgeRequestLogic(b, 'get_collection_overrides', {
            collectionId: p.collectionId,
          }),
        remove_override: (b, p) =>
          bridgeRequestLogic(b, 'remove_collection_override', {
            collectionId: p.collectionId,
            variableId: p.variableId,
          }),
      },
    },
    bridge,
  );

  server.tool(
    'variables_ep',
    buildEndpointDescription(
      'variables_ep',
      'Variable operations — list, get, create, update, delete variables, collections, and modes.',
    ),
    variables_epEndpointSchema,
    async (params) => variablesDispatcher(params as Record<string, unknown>),
  );

  // ── styles_ep endpoint ──
  const stylesDispatcher = createMethodDispatcher(
    {
      name: 'styles_ep',
      methods: {
        list: (b, p) => bridgeRequestLogic(b, 'list_styles', { type: p.type }),
        get: (b, p) => bridgeRequestLogic(b, 'get_style', { styleId: p.styleId }),
        create_paint: (b, p) =>
          bridgeRequestLogic(b, 'create_paint_style', {
            name: p.name,
            color: p.color,
            description: p.description,
          }),
        update_paint: (b, p) =>
          bridgeRequestLogic(b, 'update_paint_style', {
            styleId: p.styleId,
            name: p.name,
            description: p.description,
            color: p.color,
          }),
        update_text: (b, p) =>
          bridgeRequestLogic(b, 'update_text_style', {
            styleId: p.styleId,
            name: p.name,
            description: p.description,
            fontFamily: p.fontFamily,
            fontStyle: p.fontStyle,
            fontSize: p.fontSize,
            lineHeight: p.lineHeight,
            letterSpacing: p.letterSpacing,
          }),
        update_effect: (b, p) =>
          bridgeRequestLogic(b, 'update_effect_style', {
            styleId: p.styleId,
            name: p.name,
            description: p.description,
            effects: p.effects,
          }),
        delete: (b, p) => bridgeRequestLogic(b, 'delete_style', { styleId: p.styleId }),
        sync: (b, p) => bridgeRequestLogic(b, 'sync_styles', { tokens: p.tokens }),
        create_text: (b, p) =>
          bridgeRequestLogic(b, 'create_text_style', {
            name: p.name,
            fontFamily: p.fontFamily,
            fontStyle: p.fontStyle,
            fontWeight: p.fontWeight,
            fontSize: p.fontSize,
            lineHeight: p.lineHeight,
            letterSpacing: p.letterSpacing,
            description: p.description,
          }),
        create_effect: (b, p) =>
          bridgeRequestLogic(b, 'create_effect_style', {
            name: p.name,
            description: p.description,
            effects: p.effects,
          }),
      },
    },
    bridge,
  );

  server.tool(
    'styles_ep',
    buildEndpointDescription('styles_ep', 'Style operations — list, get, create, update, delete, and sync styles.'),
    styles_epEndpointSchema,
    async (params) => stylesDispatcher(params as Record<string, unknown>),
  );
}
