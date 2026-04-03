/**
 * Instance, component, and miscellaneous creation handlers.
 *
 * Extracted from write-nodes.ts for maintainability.
 */

import { simplifyNode } from '../adapters/node-simplifier.js';
import { registerHandler } from '../registry.js';
import { applySizingOverrides, resolveComponent, setLayoutSizing } from '../utils/figma-compat.js';
import { assertHandler } from '../utils/handler-error.js';
import { applyStroke, setComponentProperties } from '../utils/node-helpers.js';
import { findNodeByIdAsync } from '../utils/node-lookup.js';
import { getCachedModeLibrary } from './write-nodes.js';

export function registerInstanceHandlers(): void {
  // ─── Create instance ───
  registerHandler('create_instance', async (params) => {
    const componentId = params.componentId as string;
    const node = await findNodeByIdAsync(componentId);
    assertHandler(node, `Component not found: ${componentId}`, 'NOT_FOUND');

    const component = resolveComponent(node, params.variantProperties as Record<string, string> | undefined);

    const instance = component.createInstance();
    if (params.name) instance.name = params.name as string;
    if (params.x != null) instance.x = params.x as number;
    if (params.y != null) instance.y = params.y as number;
    if (params.width != null || params.height != null) {
      instance.resize((params.width as number) ?? instance.width, (params.height as number) ?? instance.height);
    }

    // Set component properties
    if (params.properties) {
      setComponentProperties(instance, params.properties as Record<string, string | boolean>);
    }

    // Parent append
    if (params.parentId) {
      const parent = await findNodeByIdAsync(params.parentId as string);
      if (parent && 'appendChild' in parent) {
        (parent as FrameNode).appendChild(instance);
      }
    }

    // Sizing AFTER appendChild — explicit overrides only (no smart defaults for instances,
    // they inherit sizing from the component definition)
    applySizingOverrides(instance, params);

    return simplifyNode(instance);
  });

  // ─── Create component from existing node ───
  registerHandler('create_component_from_node', async (params) => {
    const nodeId = params.nodeId as string;
    const node = await findNodeByIdAsync(nodeId);
    assertHandler(node, `Node not found: ${nodeId}`, 'NOT_FOUND');
    assertHandler(
      node.type === 'FRAME' || node.type === 'GROUP' || node.type === 'RECTANGLE',
      `Node must be a frame, group, or rectangle (got ${node.type})`,
    );

    const component = figma.createComponentFromNode(node as SceneNode);
    if (params.name) component.name = params.name as string;

    // exposeText: auto-discover text children and create TEXT properties
    const exposeText = params.exposeText !== false; // default true
    if (exposeText) {
      const textNodes: TextNode[] = [];
      function findTexts(n: BaseNode): void {
        if (n.type === 'TEXT') textNodes.push(n as TextNode);
        if ('children' in n) {
          for (const child of (n as FrameNode).children) findTexts(child);
        }
      }
      findTexts(component);

      for (const t of textNodes) {
        const propName = t.name || 'Text';
        try {
          component.addComponentProperty(propName, 'TEXT', t.characters);
          const defs = component.componentPropertyDefinitions;
          const key = Object.keys(defs).find((k) => k.startsWith(`${propName}#`));
          if (key) {
            t.componentPropertyReferences = { characters: key };
          }
        } catch {
          /* skip duplicate names */
        }
      }
    }

    return simplifyNode(component);
  });

  // ─── Batch create instances ───
  registerHandler('create_instances', async (params) => {
    const items = params.items as Array<Record<string, unknown>>;
    assertHandler(Array.isArray(items) && items.length > 0, 'items array is required');

    const results: Array<{ id: string; ok: boolean; error?: string }> = [];
    for (const item of items) {
      try {
        const componentId = item.componentId as string;
        const cNode = await findNodeByIdAsync(componentId);
        assertHandler(cNode, `Component not found: ${componentId}`, 'NOT_FOUND');

        let component: ComponentNode;
        try {
          component = resolveComponent(cNode, item.variantProperties as Record<string, string> | undefined);
        } catch {
          results.push({ id: componentId, ok: false, error: `Not a component (type: ${cNode.type})` });
          continue;
        }

        const instance = component.createInstance();
        if (item.name) instance.name = item.name as string;
        if (item.x != null) instance.x = item.x as number;
        if (item.y != null) instance.y = item.y as number;
        if (item.width != null || item.height != null) {
          instance.resize((item.width as number) ?? instance.width, (item.height as number) ?? instance.height);
        }
        if (item.properties) {
          setComponentProperties(instance, item.properties as Record<string, string | boolean>);
        }
        if (item.parentId) {
          const parent = await findNodeByIdAsync(item.parentId as string);
          if (parent && 'appendChild' in parent) (parent as FrameNode).appendChild(instance);
        }
        // Contextual sizing
        if (item.sizing === 'contextual' && instance.parent && 'layoutMode' in instance.parent) {
          const dir = (instance.parent as FrameNode).layoutMode;
          if (dir === 'VERTICAL') setLayoutSizing(instance, 'horizontal', 'FILL');
          else if (dir === 'HORIZONTAL') setLayoutSizing(instance, 'vertical', 'FILL');
        }
        applySizingOverrides(instance, item);

        results.push({ id: instance.id, ok: true });
      } catch (err) {
        results.push({
          id: String(item.componentId ?? '?'),
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return { results };
  });

  registerHandler('save_version_history', async (params) => {
    const title = (params.title as string) ?? 'FigCraft checkpoint';
    const description = (params.description as string) ?? '';
    await figma.saveVersionHistoryAsync(title, description);
    return { ok: true, title, description };
  });

  registerHandler('create_line', async (params) => {
    const line = figma.createLine();
    line.name = (params.name as string) ?? 'Line';
    const length = (params.length as number) ?? 100;
    line.resize(length, 0);
    if (params.x != null) line.x = params.x as number;
    if (params.y != null) line.y = params.y as number;
    if (params.rotation != null) line.rotation = params.rotation as number;

    const [lineMode, lineLibrary] = await getCachedModeLibrary();
    const useLib = lineMode === 'library' && !!lineLibrary;
    const strokeInput = params.stroke ?? '#000000';
    await applyStroke(line, strokeInput as any, (params.strokeWeight as number) ?? 1, useLib, lineLibrary);

    if (params.parentId) {
      const parent = await findNodeByIdAsync(params.parentId as string);
      if (parent && 'appendChild' in parent) {
        (parent as FrameNode).appendChild(line);
      }
    }

    return simplifyNode(line);
  });

  registerHandler('create_section', async (params) => {
    const section = figma.createSection();
    section.name = (params.name as string) ?? 'Section';

    if (params.x != null) section.x = params.x as number;
    if (params.y != null) section.y = params.y as number;

    if (params.childIds) {
      const ids = params.childIds as string[];
      for (const id of ids) {
        const child = await findNodeByIdAsync(id);
        if (child && 'parent' in child) {
          section.appendChild(child as SceneNode);
        }
      }
    }

    return { id: section.id, name: section.name, x: section.x, y: section.y };
  });

  registerHandler('boolean_operation', async (params) => {
    const nodeIds = params.nodeIds as string[];
    const operation = params.operation as 'UNION' | 'SUBTRACT' | 'INTERSECT' | 'EXCLUDE';

    const resolved = await Promise.all(nodeIds.map((id) => findNodeByIdAsync(id)));
    const nodes = resolved.filter(
      (n): n is SceneNode => n !== null && 'type' in n && n.type !== 'PAGE' && n.type !== 'DOCUMENT',
    );

    assertHandler(nodes.length >= 2, 'boolean_operation requires at least 2 valid nodes');

    const parent = nodes[0].parent as (BaseNode & ChildrenMixin) | null;
    assertHandler(parent, 'Nodes have no parent');

    let result: BooleanOperationNode;
    switch (operation) {
      case 'UNION':
        result = figma.union(nodes, parent);
        break;
      case 'SUBTRACT':
        result = figma.subtract(nodes, parent);
        break;
      case 'INTERSECT':
        result = figma.intersect(nodes, parent);
        break;
      case 'EXCLUDE':
        result = figma.exclude(nodes, parent);
        break;
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }

    if (params.name) result.name = params.name as string;

    return simplifyNode(result);
  });

  // ─── Create SVG node from markup ───
  registerHandler('create_svg', async (params) => {
    const svg = params.svg as string;
    assertHandler(svg, 'svg parameter is required');
    const node = figma.createNodeFromSvg(svg);
    node.name = (params.name as string) ?? 'SVG';
    if (params.x != null) node.x = params.x as number;
    if (params.y != null) node.y = params.y as number;
    if (params.parentId) {
      const parent = await findNodeByIdAsync(params.parentId as string);
      if (parent && 'appendChild' in parent) {
        (parent as FrameNode).appendChild(node);
      }
    }
    return simplifyNode(node);
  });

  // ─── Text scan: find all text nodes in a subtree ───
  registerHandler('text_scan', async (params) => {
    const nodeId = params.nodeId as string;
    const limit = (params.limit as number) ?? 100;
    const includePath = (params.includePath as boolean) ?? false;
    const root = await findNodeByIdAsync(nodeId);
    assertHandler(root, `Node not found: ${nodeId}`, 'NOT_FOUND');

    const textNodes: Array<{
      id: string;
      name: string;
      characters: string;
      fontSize: number | typeof figma.mixed;
      fontFamily: string;
      path?: string;
    }> = [];

    function walk(node: BaseNode, path: string): void {
      if (textNodes.length >= limit) return;
      if (node.type === 'TEXT') {
        const t = node as TextNode;
        const entry: (typeof textNodes)[0] = {
          id: t.id,
          name: t.name,
          characters: t.characters,
          fontSize: t.fontSize,
          fontFamily: t.fontName !== figma.mixed ? t.fontName.family : 'mixed',
        };
        if (includePath) entry.path = path;
        textNodes.push(entry);
      }
      if ('children' in node) {
        for (const child of (node as FrameNode).children) {
          walk(child, path ? `${path} > ${child.name}` : child.name);
        }
      }
    }

    walk(root, '');
    return { nodeId, count: textNodes.length, textNodes };
  });
} // registerInstanceHandlers
