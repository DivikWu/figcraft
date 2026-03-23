/**
 * Node write tools — MCP wrappers for creating/updating/deleting nodes.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Bridge } from '../bridge.js';
import { createDocumentLogic } from './logic/write-node-logic.js';
import { createScreenLogic } from './logic/create-screen-logic.js';

const NodeRoleSchema = z.enum([
  'screen', 'header', 'hero', 'nav', 'content', 'list', 'row', 'stats', 'card',
  'form', 'field', 'input', 'button', 'footer', 'actions', 'social_row', 'system_bar',
]);

const NodeTypeSchema = z.enum(['frame', 'text', 'rectangle', 'ellipse', 'line', 'vector', 'instance']);

const NodeSpecInputSchema: z.ZodType<Record<string, unknown>> = z.lazy(() =>
  z.object({
    type: NodeTypeSchema,
    name: z.string().optional(),
    role: NodeRoleSchema.optional(),
    props: z.record(z.unknown()).optional(),
    children: z.array(NodeSpecInputSchema).optional(),
  }),
);

export function registerWriteNodeTools(server: McpServer, bridge: Bridge): void {
  server.tool(
    'create_frame',
    'Create a new frame (optionally with auto layout). Returns the created node data. ' +
      'When a design library is selected and fill is not specified, auto-binds the default surface color token.',
    {
      name: z.string().optional().describe('Frame name'),
      x: z.number().optional().describe('X position'),
      y: z.number().optional().describe('Y position'),
      width: z.number().optional().describe('Width in px (default: 100)'),
      height: z.number().optional().describe('Height in px (default: 100)'),
      parentId: z.string().optional().describe('Parent node ID to append to'),
      autoLayout: z.boolean().optional().describe('Enable auto layout'),
      layoutDirection: z.enum(['HORIZONTAL', 'VERTICAL']).optional().describe('Auto layout direction'),
      itemSpacing: z.number().optional().describe('Spacing between items'),
      padding: z.number().optional().describe('Uniform padding'),
      paddingLeft: z.number().optional().describe('Left padding (overrides uniform padding)'),
      paddingRight: z.number().optional().describe('Right padding (overrides uniform padding)'),
      paddingTop: z.number().optional().describe('Top padding (overrides uniform padding)'),
      paddingBottom: z.number().optional().describe('Bottom padding (overrides uniform padding)'),
      primaryAxisAlignItems: z.enum(['MIN', 'CENTER', 'MAX', 'SPACE_BETWEEN']).optional().describe('Main axis alignment (default: MIN)'),
      counterAxisAlignItems: z.enum(['MIN', 'CENTER', 'MAX']).optional().describe('Cross axis alignment (default: MIN). Use CENTER to vertically center children in HORIZONTAL layout.'),
      fill: z.string().optional().describe('Fill color as hex (e.g. "#FF0000")'),
    },
    async (params) => {
      const result = await bridge.request('create_frame', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'create_text',
    'Create a text node with specified content and font. ' +
      'When a design library is selected: auto-applies matching Text Style if discovered in current page, ' +
      'falls back to typography variable binding (fontSize/fontFamily/fontWeight/lineHeight), ' +
      'and auto-binds text/primary color if fill not specified.',
    {
      content: z.string().describe('Text content'),
      name: z.string().optional().describe('Node name'),
      x: z.number().optional().describe('X position'),
      y: z.number().optional().describe('Y position'),
      fontSize: z.number().optional().describe('Font size (default: 16)'),
      fontFamily: z.string().optional().describe('Font family (default: Inter)'),
      fontStyle: z.string().optional().describe('Font style (default: Regular)'),
      fill: z.string().optional().describe('Text color as hex'),
      parentId: z.string().optional().describe('Parent node ID'),
    },
    async (params) => {
      const result = await bridge.request('create_text', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'patch_nodes',
    'Update properties on one or more existing nodes. ' +
      'Supports: x, y, name, visible, opacity, cornerRadius, resize, fills (hex string), strokes (hex string), strokeWeight, ' +
      'effects (raw Figma effect array), layoutMode (NONE/HORIZONTAL/VERTICAL), layoutAlign, layoutGrow, ' +
      'primaryAxisAlignItems, counterAxisAlignItems, itemSpacing, paddingLeft/Right/Top/Bottom, ' +
      'fontSize, fontName ({family,style}), rotation, constraints ({horizontal,vertical}), ' +
      'blendMode, isMask (boolean), clipsContent (boolean), minWidth, minHeight.',
    {
      patches: z.array(z.object({
        nodeId: z.string().describe('Node ID'),
        props: z.record(z.unknown()).describe('Properties to update'),
      })).describe('Array of node patches'),
    },
    async ({ patches }) => {
      const result = await bridge.request('patch_nodes', { patches });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'delete_node',
    'Delete a node by ID.',
    {
      nodeId: z.string().describe('Node ID to delete'),
    },
    async ({ nodeId }) => {
      const result = await bridge.request('delete_node', { nodeId });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'delete_nodes',
    'Delete multiple nodes by ID in one call. Preferred over multiple delete_node calls.',
    {
      nodeIds: z.array(z.string()).describe('Array of node IDs to delete'),
    },
    async ({ nodeIds }) => {
      const result = await bridge.request('delete_nodes', { nodeIds });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'clone_node',
    'Clone a node and return the new copy.',
    {
      nodeId: z.string().describe('Node ID to clone'),
    },
    async ({ nodeId }) => {
      const result = await bridge.request('clone_node', { nodeId });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'set_text_content',
    'Update the text content of an existing text node.',
    {
      nodeId: z.string().describe('Text node ID'),
      content: z.string().describe('New text content'),
    },
    async ({ nodeId, content }) => {
      const result = await bridge.request('set_text_content', { nodeId, content });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // Public MCP schema: recursive node specs with typed `type` and optional `role`.
  // Detailed prop semantics are still conveyed via description text so the prompt
  // footprint stays much smaller than a fully expanded 7-level inline schema.
  // The plugin handler remains the final authority for per-node creation errors.
  const nodesDesc =
    'Array of node specs. Each node: {type, name?, role?, props?, children?}. ' +
    'type: frame | text | rectangle | ellipse | line | vector | instance. ' +
    'role (optional but recommended for higher quality): screen | header | hero | nav | content | list | row | stats | card | form | field | input | button | footer | actions | social_row | system_bar. ' +
    'When role is present, the inference engine trusts it over name-based guessing. ' +
    'children: recursive same shape, up to 7 levels. ' +
    'Props by type — ' +
    'frame: width, height, x, y, fill, cornerRadius, autoLayout, layoutDirection, itemSpacing, padding, paddingLeft, paddingRight, paddingTop, paddingBottom, primaryAxisAlignItems, counterAxisAlignItems, minWidth, minHeight, layoutAlign (STRETCH/INHERIT), layoutGrow (0 or 1). ' +
    'text: content, fontSize, fontFamily, fontStyle, fill, layoutAlign, layoutGrow. ' +
    'rectangle: width, height, x, y, fill, cornerRadius, stroke, strokeWeight, layoutAlign, layoutGrow. ' +
    'ellipse: width, height, x, y, fill, stroke, strokeWeight, layoutAlign, layoutGrow. ' +
    'line: length, x, y, rotation, stroke, strokeWeight, layoutAlign, layoutGrow. ' +
    'vector: svg (required), width, height, x, y, resize ([w,h]), layoutAlign, layoutGrow. ' +
    'instance: componentKey (library) OR componentId (local), properties (variant overrides as Record<string,string>), layoutAlign, layoutGrow.';

  server.tool(
    'create_document',
    'Batch-create a tree of nodes in one call. ' +
      'PREFERRED over multiple create_frame/create_text calls — minimizes round-trips and is much faster. ' +
      'Supports 7 levels of nesting (screen → section → card → row → component → element → content) ' +
      'and 7 node types: frame, text, rectangle, ellipse, line, vector, instance. ' +
      'Use vector type with props.svg to inline SVG icons directly in the batch tree. ' +
      'Use instance type with props.componentKey or props.componentId to inline component instances. ' +
      'Use role on semantic frames (screen/header/hero/nav/content/list/row/stats/card/form/button/input/footer/etc.) to reduce heuristic misclassification. ' +
      'Explicit roles now apply the same shared safety defaults used by create_screen, and marginHorizontal/marginLeft/marginRight are converted into transparent inset wrappers automatically. ' +
      'By default, FigCraft runs a scoped post-create lint/fix pass on the newly created root nodes. ' +
      'IMPORTANT: Treat this as the raw tree path. Create ONE screen per call. For complete screens, prefer create_screen; use create_document for smaller inserts, partial subtrees, or when you need low-level control. ' +
      'PREREQUISITE: You MUST call get_mode first to load design tokens. Without it, elements will lack token bindings.',
    {
      parentId: z.string().optional().describe('Parent node ID. Omit to add to current page.'),
      nodes: z.array(NodeSpecInputSchema).describe(nodesDesc),
      autoLint: z.boolean().optional().describe('Run scoped post-create lint/fix on the created root nodes. Defaults to true. Set false only when you need raw creation output.'),
    },
    async ({ parentId, nodes, autoLint }, extra) => {
      return createDocumentLogic(bridge, { parentId, nodes: nodes as Array<Record<string, unknown>>, autoLint }, extra as unknown as import('./logic/write-node-logic.js').CreateDocumentExtra);
    },
  );

  server.tool(
    'create_screen',
    'Create a full screen progressively: first the screen shell, then each section, then a final scoped lint/fix pass. ' +
      'Preferred for complete screens when quality matters more than a single raw tree call. ' +
      'The shell defaults to role=screen and gets platform size presets when width/height are omitted. ' +
      'Section specs also support inset helpers (marginHorizontal, marginLeft, marginRight): create_screen converts them into transparent wrapper frames so filled elements keep real outer margins. ' +
      'This is the default high-level screen workflow used by the generation benchmark and release gate.',
    {
      name: z.string().optional().describe('Screen name (default: "Screen")'),
      parentId: z.string().optional().describe('Parent node ID. Omit to add to current page.'),
      platform: z.enum(['ios', 'android', 'web']).optional().describe('Platform preset for the screen shell'),
      hasSystemBar: z.boolean().optional().describe('Apply full-bleed system bar shell defaults (paddingLeft/Right/Top = 0)'),
      wrapInSection: z.boolean().optional().describe('Create a Figma Section around the finished screen'),
      shell: NodeSpecInputSchema.optional().describe('Root screen node spec. Defaults to a frame with role=screen if omitted.'),
      sections: z.array(NodeSpecInputSchema).optional().describe('Section node specs to append to the screen root one by one. Each section is created and linted progressively. Use marginHorizontal / marginLeft / marginRight on a section or child node when it needs an inset wrapper instead of padding on the filled element itself.'),
      autoLint: z.boolean().optional().describe('Run scoped lint/fix after shell and each section. Defaults to true.'),
      finalLint: z.boolean().optional().describe('Run one final scoped lint/fix pass on the complete screen root. Defaults to true.'),
    },
    async ({ name, parentId, platform, hasSystemBar, wrapInSection, shell, sections, autoLint, finalLint }, extra) => {
      return createScreenLogic(
        bridge,
        {
          name,
          parentId,
          platform,
          hasSystemBar,
          wrapInSection,
          shell: shell as Record<string, unknown> | undefined,
          sections: sections as Array<Record<string, unknown>> | undefined,
          autoLint,
          finalLint,
        },
        extra as unknown as import('./logic/write-node-logic.js').CreateDocumentExtra,
      );
    },
  );

  server.tool(
    'insert_child',
    'Move a node into a parent container, optionally at a specific index.',
    {
      parentId: z.string().describe('Parent node ID (must be a container like Frame)'),
      childId: z.string().describe('Child node ID to insert'),
      index: z.number().optional().describe('Insert position (0-based). Omit to append at end.'),
    },
    async ({ parentId, childId, index }) => {
      const result = await bridge.request('insert_child', { parentId, childId, index });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'save_version_history',
    'Save a named version history snapshot of the current Figma file. ' +
      'Use before making significant changes so you can restore if needed.',
    {
      title: z.string().describe('Snapshot title (e.g. "Before refactor")'),
      description: z.string().optional().describe('Optional description of what was done'),
    },
    async (params) => {
      const result = await bridge.request('save_version_history', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'boolean_operation',
    'Apply a boolean operation to two or more vector/shape nodes. ' +
      'UNION merges shapes, SUBTRACT removes overlap from the first shape, ' +
      'INTERSECT keeps only the overlapping area, EXCLUDE keeps non-overlapping areas. ' +
      'All nodes must share the same parent. Returns the resulting BooleanOperation node.',
    {
      nodeIds: z.array(z.string()).min(2).describe('Node IDs to combine (at least 2, order matters for SUBTRACT)'),
      operation: z.enum(['UNION', 'SUBTRACT', 'INTERSECT', 'EXCLUDE']).describe('Boolean operation type'),
      name: z.string().optional().describe('Name for the resulting node'),
    },
    async (params) => {
      const result = await bridge.request('boolean_operation', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'create_rectangle',
    'Create a rectangle node. Supports fill, corner radius, and stroke.',
    {
      name: z.string().optional().describe('Node name'),
      x: z.number().optional().describe('X position'),
      y: z.number().optional().describe('Y position'),
      width: z.number().optional().describe('Width in px (default: 100)'),
      height: z.number().optional().describe('Height in px (default: 100)'),
      parentId: z.string().optional().describe('Parent node ID'),
      fill: z.string().optional().describe('Fill color as hex'),
      cornerRadius: z.number().optional().describe('Corner radius'),
      stroke: z.string().optional().describe('Stroke color as hex'),
      strokeWeight: z.number().optional().describe('Stroke weight (default: 1)'),
    },
    async (params) => {
      const result = await bridge.request('create_rectangle', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'create_ellipse',
    'Create an ellipse (circle) node. Supports fill and stroke.',
    {
      name: z.string().optional().describe('Node name'),
      x: z.number().optional().describe('X position'),
      y: z.number().optional().describe('Y position'),
      width: z.number().optional().describe('Width in px (default: 100)'),
      height: z.number().optional().describe('Height in px (default: 100, same as width for circle)'),
      parentId: z.string().optional().describe('Parent node ID'),
      fill: z.string().optional().describe('Fill color as hex'),
      stroke: z.string().optional().describe('Stroke color as hex'),
      strokeWeight: z.number().optional().describe('Stroke weight (default: 1)'),
    },
    async (params) => {
      const result = await bridge.request('create_ellipse', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'create_line',
    'Create a line node. Specify length and optional rotation.',
    {
      name: z.string().optional().describe('Node name'),
      x: z.number().optional().describe('X position'),
      y: z.number().optional().describe('Y position'),
      length: z.number().optional().describe('Line length in px (default: 100)'),
      rotation: z.number().optional().describe('Rotation in degrees (0 = horizontal)'),
      parentId: z.string().optional().describe('Parent node ID'),
      stroke: z.string().optional().describe('Stroke color as hex (default: #000000)'),
      strokeWeight: z.number().optional().describe('Stroke weight (default: 1)'),
    },
    async (params) => {
      const result = await bridge.request('create_line', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'create_section',
    'Create a Figma Section node for organizing canvas content. ' +
      'Sections group frames without clipping and can be collapsed in Figma. ' +
      'Optionally move existing nodes inside by providing childIds.',
    {
      name: z.string().optional().describe('Section name (default: "Section")'),
      x: z.number().optional().describe('X position'),
      y: z.number().optional().describe('Y position'),
      childIds: z.array(z.string()).optional().describe('Node IDs to move inside the section'),
    },
    async (params) => {
      const result = await bridge.request('create_section', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
