/**
 * Custom create_frame handler — resolves icon children before forwarding to Plugin.
 *
 * When children contain {type: "icon"} nodes, this handler:
 * 1. Fetches SVGs from Iconify API (MCP Server has network access)
 * 2. Replaces icon nodes with svg nodes + _iconMeta for color binding
 * 3. Forwards the resolved params to the Plugin via bridge
 *
 * For params without icon children, this is a transparent pass-through.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Bridge } from '../bridge.js';
import { jsonResponse } from './response-helpers.js';

export function registerCreateFrame(server: McpServer, bridge: Bridge): void {
  server.tool(
    'create_frame',
    'Create a frame node with optional auto-layout, fills, stroke, corner radius, and parent. Supports token auto-binding (fillVariableName, strokeVariableName), smart defaults, and inline children for building entire node trees in one call.\nOpinion Engine (automatic inferences — no manual handling needed): 1. layoutMode → auto-inferred as VERTICAL when padding/spacing/alignment/children present 2. layoutSizingHorizontal/Vertical → cross-axis FILL, primary-axis HUG inside auto-layout parent 3. FILL ordering → internally sets FILL AFTER appendChild (avoids Figma API error) 4. Parent promotion → when children declare FILL/HUG but parent has no layoutMode, auto-promotes to VERTICAL 5. Cross-level FILL→HUG downgrade → when parent HUGs on cross-axis, child FILL is downgraded to HUG (prevents 0-collapse) 6. FILL+width conflict detection → rejects contradictory params (e.g. FILL + explicit width) 7. Token auto-binding → fillVariableName/strokeVariableName matched to library variables/styles 8. Font preloading → all text fonts collected and loaded in parallel before creation 9. Per-child error cleanup → failed child creation auto-removes orphan nodes 10. Auto-focus → viewport scrolls to created node; use export_image for visual verification\nUse dryRun:true to preview all inferences BEFORE creating nodes.',
    {
      name: z.string().optional().describe('Frame name (default: "Frame")'),
      role: z
        .string()
        .optional()
        .describe(
          "Semantic role (e.g. 'screen', 'button', 'input'). Stored as plugin data for deterministic lint identification.",
        ),
      x: z.number().optional().describe('X position'),
      y: z.number().optional().describe('Y position'),
      width: z.number().optional().describe('Width in px (omit to shrink-to-content via HUG when auto-layout)'),
      height: z.number().optional().describe('Height in px (omit to shrink-to-content via HUG when auto-layout)'),
      fill: z
        .string()
        .optional()
        .describe("Fill color as hex (e.g. '#FFFFFF') or variable/style name — auto-binds to matching token"),
      fillVariableName: z.string().optional().describe("Bind fill to a color variable by name (e.g. 'bg/primary')"),
      fillStyleName: z.string().optional().describe("Apply paint style by name (e.g. 'Surface/Primary')"),
      gradient: z
        .record(z.unknown())
        .optional()
        .describe(
          "Gradient fill. {type:'LINEAR'|'RADIAL', stops:[{color:'#hex', position:0-1}, ...], angle?: degrees (LINEAR only, default 180=top-to-bottom)}.",
        ),
      strokeColor: z.string().optional().describe('Stroke color hex — auto-binds to matching variable/style'),
      strokeVariableName: z.string().optional().describe('Bind stroke to a color variable by name'),
      strokeWeight: z.number().optional().describe('Stroke thickness (default: 1 when stroke specified)'),
      strokeAlign: z.enum(['INSIDE', 'OUTSIDE', 'CENTER']).optional().describe('Stroke position (default: INSIDE)'),
      strokeDashes: z
        .array(z.unknown())
        .optional()
        .describe('Dash pattern array [dash, gap] (e.g. [10, 5] for dashed, [2, 2] for dotted)'),
      strokeCap: z
        .enum(['NONE', 'ROUND', 'SQUARE', 'ARROW_LINES', 'ARROW_EQUILATERAL'])
        .optional()
        .describe('Stroke end cap style'),
      strokeJoin: z.enum(['MITER', 'BEVEL', 'ROUND']).optional().describe('Stroke corner join style'),
      layoutMode: z
        .enum(['HORIZONTAL', 'VERTICAL'])
        .optional()
        .describe(
          'Auto-layout direction. Smart default: auto-inferred as VERTICAL when padding/spacing/alignment params are present.',
        ),
      itemSpacing: z.number().optional().describe('Spacing between children'),
      padding: z.number().optional().describe('Shorthand — sets all 4 padding edges'),
      paddingLeft: z.number().optional().describe('Left padding'),
      paddingRight: z.number().optional().describe('Right padding'),
      paddingTop: z.number().optional().describe('Top padding'),
      paddingBottom: z.number().optional().describe('Bottom padding'),
      cornerRadius: z
        .number()
        .optional()
        .describe('Corner radius (number or variable name string) — sets all 4 corners uniformly'),
      topLeftRadius: z.number().optional().describe('Top-left corner radius (overrides cornerRadius for this corner)'),
      topRightRadius: z
        .number()
        .optional()
        .describe('Top-right corner radius (overrides cornerRadius for this corner)'),
      bottomRightRadius: z
        .number()
        .optional()
        .describe('Bottom-right corner radius (overrides cornerRadius for this corner)'),
      bottomLeftRadius: z
        .number()
        .optional()
        .describe('Bottom-left corner radius (overrides cornerRadius for this corner)'),
      parentId: z.string().optional().describe('Parent node ID to append into'),
      layoutSizingHorizontal: z
        .enum(['FIXED', 'HUG', 'FILL'])
        .optional()
        .describe(
          'Horizontal sizing. Smart default: FILL on cross-axis, HUG on primary-axis when inside auto-layout parent.',
        ),
      layoutSizingVertical: z
        .enum(['FIXED', 'HUG', 'FILL'])
        .optional()
        .describe(
          'Vertical sizing. Smart default: FILL on cross-axis, HUG on primary-axis when inside auto-layout parent.',
        ),
      primaryAxisAlignItems: z
        .enum(['MIN', 'CENTER', 'MAX', 'SPACE_BETWEEN'])
        .optional()
        .describe('Primary axis alignment'),
      counterAxisAlignItems: z.enum(['MIN', 'CENTER', 'MAX']).optional().describe('Counter axis alignment'),
      layoutWrap: z.enum(['NO_WRAP', 'WRAP']).optional().describe('Wrap children to new rows (HORIZONTAL layout only)'),
      counterAxisSpacing: z.number().optional().describe('Gap between wrapped rows (requires layoutWrap: WRAP)'),
      opacity: z.number().optional().describe('Opacity 0-1'),
      visible: z.boolean().optional().describe('Show/hide (default: true)'),
      rotation: z.number().optional().describe('Rotation in degrees'),
      blendMode: z
        .enum(['PASS_THROUGH', 'NORMAL', 'DARKEN', 'MULTIPLY', 'SCREEN', 'OVERLAY', 'SOFT_LIGHT', 'HARD_LIGHT'])
        .optional()
        .describe('Layer blend mode'),
      effectStyleName: z.string().optional().describe('Effect style name for shadows/blurs'),
      shadow: z
        .record(z.unknown())
        .optional()
        .describe(
          "Drop shadow shorthand. {color?: hex (default '#00000040'), x?: offsetX (default 0), y?: offsetY (default 4), blur?: radius (default 12), spread?: (default 0)}. Ignored when effectStyleName is set.",
        ),
      innerShadow: z
        .record(z.unknown())
        .optional()
        .describe(
          "Inner shadow shorthand. {color?: hex (default '#0000001A'), x?: offsetX (default 0), y?: offsetY (default 2), blur?: radius (default 4), spread?: (default 0)}. Ignored when effectStyleName is set. Can coexist with shadow and blur.",
        ),
      blur: z
        .number()
        .optional()
        .describe(
          'Background blur radius for glassmorphism/frosted-glass effects. Ignored when effectStyleName is set. Can coexist with shadow and innerShadow.',
        ),
      clipsContent: z.boolean().optional().describe('Clip children to frame bounds (default: true)'),
      minWidth: z.number().optional().describe('Min width for responsive auto-layout'),
      maxWidth: z.number().optional().describe('Max width for responsive auto-layout'),
      minHeight: z.number().optional().describe('Min height for responsive auto-layout'),
      maxHeight: z.number().optional().describe('Max height for responsive auto-layout'),
      layoutPositioning: z
        .enum(['AUTO', 'ABSOLUTE'])
        .optional()
        .describe('ABSOLUTE = floating inside auto-layout parent'),
      imageUrl: z
        .string()
        .optional()
        .describe('Image URL — public URL for image fill. Use image_search to find Pexels photos.'),
      imageScaleMode: z
        .enum(['FILL', 'FIT', 'CROP', 'TILE'])
        .optional()
        .describe('How the image is scaled within the frame (default: FILL)'),
      children: z
        .array(
          z
            .object({
              type: z
                .enum(['frame', 'text', 'rectangle', 'ellipse', 'star', 'polygon', 'instance', 'svg', 'icon'])
                .optional()
                .describe('Child node type'),
            })
            .passthrough(),
        )
        .optional()
        .describe(
          "Inline child nodes to create recursively. Each item: {type:'frame'|'text'|'rectangle'|'ellipse'|'instance'|'svg'|'star'|'polygon'|'icon', ...params, children?}. " +
            'Frame children accept all create_frame params. Text children accept all create_text params (incl. textCase, textDecoration). ' +
            'Rectangle/ellipse children accept: name, width, height, fill, fillVariableName, fillStyleName, strokeColor, strokeVariableName, strokeWeight, cornerRadius (rect only), opacity, rotation. ' +
            'Instance children accept: componentId (local node ID), componentKey (library component key), or componentSetKey (library component set key) — at least one required. Also: name, width, height, variantProperties, properties, layoutSizingHorizontal/Vertical. For library components, prefer componentKey or componentSetKey. ' +
            'SVG children accept: svg (required), name, width, height. ' +
            'Icon children accept: icon (required, "prefix:name" e.g. "lucide:home"), size (default: 24), fill (hex color), colorVariableName, name. ' +
            'Star children accept: name, width, height, fill, pointCount, innerRadius, opacity, rotation. ' +
            'Polygon children accept: name, width, height, fill, pointCount, opacity, rotation. ' +
            'Smart defaults apply: cross-axis FILL, primary-axis HUG inside auto-layout parents. Max depth: 10 levels.',
        ),
      dryRun: z
        .boolean()
        .optional()
        .describe(
          'When true, validates params and previews inferences WITHOUT creating any nodes. Returns {dryRun:true, valid, inferences?, ambiguous?, diff?, correctedPayload?}.',
        ),
      noPreview: z
        .boolean()
        .optional()
        .describe(
          'Skip _previewHint in response (default: false). When false, response includes a hint to call export_image for visual verification.',
        ),
      items: z
        .array(z.unknown())
        .optional()
        .describe(
          'Batch mode: array of create_frame param objects. When provided, creates multiple frames in one call. ' +
            'Each item accepts the same params as create_frame (name, width, height, layoutMode, children, etc.). ' +
            'Pre-creation validation runs per item — conflicting items return error without blocking others. ' +
            'Max 20 frames per batch. Returns {created, total, items: [{id, name, ok, error?}]}.',
        ),
    },
    async (params) => {
      // Icon resolution + content warnings + design decisions are handled by
      // the Harness Pipeline (pre-transform + post-enrich rules).
      const result = await bridge.request('create_frame', params, 60000, 'create_frame', true);
      return jsonResponse(result);
    },
  );
}
