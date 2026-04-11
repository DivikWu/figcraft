/**
 * Design System Build handlers — tools for building complete component libraries.
 *
 * P0 tools (flow-critical):
 *   - create_text_style: Create a new text style from params
 *   - create_effect_style: Create a new effect style from params
 *   - set_variable_code_syntax: Set code syntax on a variable (WEB/ANDROID/iOS)
 *   - layout_component_set: Auto-grid-layout variants after combineAsVariants
 *   - bind_component_property: Wire component property to child nodes
 *
 * P1 tools (efficiency):
 *   - batch_set_variable_binding: Bind variables to multiple nodes in one call
 *   - set_variable_values_multi_mode: Set a variable's value across multiple modes
 */

import { registerHandler } from '../registry.js';
import { hexToFigmaRgba } from '../utils/color.js';
import { resolveWeight } from '../utils/font-weight.js';
import { assertHandler, HandlerError } from '../utils/handler-error.js';
import { findNodeByIdAsync } from '../utils/node-lookup.js';
import { isVariableAlias } from '../utils/type-guards.js';
import { resolveFontAsync } from './write-nodes.js';

export function registerDesignSystemBuildHandlers(): void {
  // ═══════════════════════════════════════════════════════════════
  // P0-1: create_text_style
  // ═══════════════════════════════════════════════════════════════

  registerHandler('create_text_style', async (params) => {
    const name = params.name as string;
    const fontFamily = (params.fontFamily as string) ?? 'Inter';
    const fontStyle = params.fontStyle as string | undefined;
    const fontWeight = params.fontWeight as number | string | undefined;
    const fontSize = params.fontSize as number | undefined;
    const lineHeight = params.lineHeight as number | string | undefined;
    const letterSpacing = params.letterSpacing as number | string | undefined;
    const description = params.description as string | undefined;

    assertHandler(name, 'name is required');

    // Check for existing style with same name (idempotent)
    const existing = (await figma.getLocalTextStylesAsync()).find((s) => s.name === name);
    if (existing) {
      return { id: existing.id, name: existing.name, fontSize: existing.fontSize, alreadyExists: true };
    }

    const style = figma.createTextStyle();
    style.name = name;
    if (description) style.description = description;

    try {
      // Resolve font style from fontStyle or fontWeight
      const resolvedStyle = fontStyle ?? resolveWeight(fontWeight);
      const { fontName, fallbackNote } = await resolveFontAsync(fontFamily, resolvedStyle);
      style.fontName = fontName;

      if (fontSize != null) style.fontSize = fontSize;

      if (lineHeight != null) {
        if (typeof lineHeight === 'string' && lineHeight.endsWith('%')) {
          style.lineHeight = { value: parseFloat(lineHeight), unit: 'PERCENT' };
        } else if (typeof lineHeight === 'string' && lineHeight === 'AUTO') {
          style.lineHeight = { unit: 'AUTO' };
        } else {
          style.lineHeight = {
            value: typeof lineHeight === 'number' ? lineHeight : parseFloat(String(lineHeight)),
            unit: 'PIXELS',
          };
        }
      }

      if (letterSpacing != null) {
        if (typeof letterSpacing === 'string' && letterSpacing.endsWith('%')) {
          style.letterSpacing = { value: parseFloat(letterSpacing), unit: 'PERCENT' };
        } else {
          style.letterSpacing = {
            value: typeof letterSpacing === 'number' ? letterSpacing : parseFloat(String(letterSpacing)),
            unit: 'PIXELS',
          };
        }
      }

      return {
        id: style.id,
        name: style.name,
        fontSize: style.fontSize,
        ...(fallbackNote ? { fontFallback: fallbackNote } : {}),
      };
    } catch (err) {
      // Clean up the half-created style to avoid orphans
      try {
        style.remove();
      } catch {
        /* already removed or not removable */
      }
      throw err;
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // P0-2: create_effect_style
  // ═══════════════════════════════════════════════════════════════

  registerHandler('create_effect_style', async (params) => {
    const name = params.name as string;
    const description = params.description as string | undefined;
    const effects = params.effects as Array<{
      type?: string;
      color?: string;
      offsetX?: number;
      offsetY?: number;
      blur?: number;
      spread?: number;
      visible?: boolean;
    }>;

    assertHandler(name, 'name is required');
    assertHandler(Array.isArray(effects) && effects.length > 0, 'effects array is required and must not be empty');

    // Check for existing style with same name (idempotent)
    const existing = (await figma.getLocalEffectStylesAsync()).find((s) => s.name === name);
    if (existing) {
      return { id: existing.id, name: existing.name, alreadyExists: true };
    }

    const figmaEffects: Effect[] = effects.map((e) => {
      const effectType = (e.type ?? 'DROP_SHADOW') as Effect['type'];
      if (effectType === 'DROP_SHADOW' || effectType === 'INNER_SHADOW') {
        return {
          type: effectType,
          visible: e.visible ?? true,
          color: e.color ? hexToFigmaRgba(e.color) : { r: 0, g: 0, b: 0, a: 0.25 },
          offset: { x: e.offsetX ?? 0, y: e.offsetY ?? 0 },
          radius: e.blur ?? 0,
          spread: e.spread ?? 0,
          blendMode: 'NORMAL' as const,
          showShadowBehindNode: false,
        } as DropShadowEffect;
      }
      if (effectType === 'LAYER_BLUR' || effectType === 'BACKGROUND_BLUR') {
        return {
          type: effectType,
          visible: e.visible ?? true,
          radius: e.blur ?? 0,
        } as BlurEffect;
      }
      // Glass effect (beta, Frames only)
      if ((effectType as string) === 'GLASS') {
        return {
          type: 'GLASS' as any,
          visible: e.visible ?? true,
          radius: e.blur ?? 0,
        } as any;
      }
      // Unrecognized type — pass through as-is for forward compatibility
      return {
        type: effectType,
        visible: e.visible ?? true,
        ...(e.color ? { color: hexToFigmaRgba(e.color) } : {}),
        ...(e.offsetX != null || e.offsetY != null ? { offset: { x: e.offsetX ?? 0, y: e.offsetY ?? 0 } } : {}),
        ...(e.blur != null ? { radius: e.blur } : {}),
        ...(e.spread != null ? { spread: e.spread } : {}),
      } as Effect;
    });

    const style = figma.createEffectStyle();
    style.name = name;
    style.effects = figmaEffects;
    if (description) style.description = description;

    return { id: style.id, name: style.name };
  });

  // ═══════════════════════════════════════════════════════════════
  // P0-3: set_variable_code_syntax
  // ═══════════════════════════════════════════════════════════════

  registerHandler('set_variable_code_syntax', async (params) => {
    const variableId = params.variableId as string;
    const syntax = params.syntax as Record<string, string>;

    assertHandler(variableId, 'variableId is required');
    assertHandler(syntax && typeof syntax === 'object', 'syntax is required (e.g. { WEB: "var(--color-primary)" })');

    const variable = await figma.variables.getVariableByIdAsync(variableId);
    assertHandler(variable, `Variable not found: ${variableId}`, 'NOT_FOUND');

    const validPlatforms = ['WEB', 'ANDROID', 'iOS'] as const;
    const applied: string[] = [];

    for (const [platform, value] of Object.entries(syntax)) {
      const p = platform as (typeof validPlatforms)[number];
      assertHandler(
        validPlatforms.includes(p),
        `Invalid platform "${platform}". Must be one of: ${validPlatforms.join(', ')}`,
      );
      if (value) {
        variable.setVariableCodeSyntax(p, value);
        applied.push(p);
      } else {
        // Empty string = remove
        try {
          variable.removeVariableCodeSyntax(p);
        } catch {
          /* ignore if not set */
        }
        applied.push(`${p} (removed)`);
      }
    }

    return { ok: true, variableId: variable.id, variableName: variable.name, applied };
  });

  // ═══════════════════════════════════════════════════════════════
  // P0-4: layout_component_set
  // ═══════════════════════════════════════════════════════════════

  registerHandler('layout_component_set', async (params) => {
    const nodeId = params.nodeId as string;
    const gap = (params.gap as number) ?? 20;
    const padding = (params.padding as number) ?? 40;
    const columnAxis = params.columnAxis as string | undefined;
    const rowAxes = params.rowAxes as string[] | undefined;

    assertHandler(nodeId, 'nodeId is required');

    const node = await findNodeByIdAsync(nodeId);
    assertHandler(node && node.type === 'COMPONENT_SET', `ComponentSet not found: ${nodeId}`, 'NOT_FOUND');
    const cs = node as ComponentSetNode;
    const children = cs.children.filter((c) => c.type === 'COMPONENT') as ComponentNode[];
    assertHandler(children.length > 0, 'ComponentSet has no component children');

    // Parse variant properties from names: "Size=Small, Style=Primary, State=Default"
    type VariantInfo = { node: ComponentNode; props: Record<string, string> };
    const variants: VariantInfo[] = children.map((child) => {
      const props: Record<string, string> = {};
      child.name.split(',').forEach((part) => {
        const [k, v] = part.split('=').map((s) => s.trim());
        if (k && v) props[k] = v;
      });
      return { node: child, props };
    });

    // Discover all axes and their values (preserving order of first appearance)
    const axisValues = new Map<string, string[]>();
    for (const v of variants) {
      for (const [key, val] of Object.entries(v.props)) {
        if (!axisValues.has(key)) axisValues.set(key, []);
        const arr = axisValues.get(key)!;
        if (!arr.includes(val)) arr.push(val);
      }
    }

    // Determine column and row axes
    const allAxes = [...axisValues.keys()];
    const colAxis = columnAxis ?? allAxes[allAxes.length - 1] ?? allAxes[0];
    const rAxes = rowAxes ?? allAxes.filter((a) => a !== colAxis);

    const colValues = axisValues.get(colAxis) ?? [''];
    const numCols = colValues.length;

    // Build row keys: cartesian product of row axes values
    function buildRowKeys(axes: string[]): Array<Record<string, string>> {
      if (axes.length === 0) return [{}];
      const [first, ...rest] = axes;
      const restKeys = buildRowKeys(rest);
      const result: Array<Record<string, string>> = [];
      for (const val of axisValues.get(first) ?? ['']) {
        for (const restKey of restKeys) {
          result.push({ [first]: val, ...restKey });
        }
      }
      return result;
    }
    const rowKeys = buildRowKeys(rAxes);
    const numRows = rowKeys.length;

    // Measure max child dimensions per column and row for adaptive grid
    const colWidths = new Array(numCols).fill(0);
    const rowHeights = new Array(numRows).fill(0);

    for (const v of variants) {
      const colIdx = colValues.indexOf(v.props[colAxis] ?? '');
      const rowIdx = rowKeys.findIndex((rk) => rAxes.every((a) => rk[a] === (v.props[a] ?? '')));
      if (colIdx >= 0) colWidths[colIdx] = Math.max(colWidths[colIdx], v.node.width);
      if (rowIdx >= 0) rowHeights[rowIdx] = Math.max(rowHeights[rowIdx], v.node.height);
    }

    // Position each variant
    let positioned = 0;
    for (const v of variants) {
      const colIdx = colValues.indexOf(v.props[colAxis] ?? '');
      const rowIdx = rowKeys.findIndex((rk) => rAxes.every((a) => rk[a] === (v.props[a] ?? '')));
      if (colIdx < 0 || rowIdx < 0) continue;

      // Calculate x: padding + sum of previous column widths + gaps
      let x = padding;
      for (let c = 0; c < colIdx; c++) x += colWidths[c] + gap;

      // Calculate y: padding + sum of previous row heights + gaps
      let y = padding;
      for (let r = 0; r < rowIdx; r++) y += rowHeights[r] + gap;

      v.node.x = x;
      v.node.y = y;
      positioned++;
    }

    // Resize component set to fit
    let maxX = 0;
    let maxY = 0;
    for (const child of children) {
      maxX = Math.max(maxX, child.x + child.width);
      maxY = Math.max(maxY, child.y + child.height);
    }
    cs.resizeWithoutConstraints(maxX + padding, maxY + padding);

    return {
      ok: true,
      componentSetId: cs.id,
      positioned,
      grid: { columns: numCols, rows: numRows, columnAxis: colAxis, rowAxes: rAxes },
      size: { width: Math.round(maxX + padding), height: Math.round(maxY + padding) },
    };
  });

  // ═══════════════════════════════════════════════════════════════
  // P0-5: bind_component_property
  // ═══════════════════════════════════════════════════════════════

  registerHandler('bind_component_property', async (params) => {
    const nodeId = params.nodeId as string;
    assertHandler(nodeId, 'nodeId is required (Component or ComponentSet)');

    // ── Accept both single binding (legacy) and array of bindings (P0-3) ──
    // The array form is the preferred shape — wiring a typical Button takes
    // 4-6 properties and a single call saves 4-6 round-trips through the model.
    type BindingSpec = {
      propertyName: string;
      targetNodeSelector: string;
      nodeProperty: 'characters' | 'visible' | 'mainComponent';
    };
    const rawBindings = params.bindings as BindingSpec[] | undefined;
    const bindings: BindingSpec[] =
      rawBindings && Array.isArray(rawBindings)
        ? rawBindings
        : [
            {
              propertyName: params.propertyName as string,
              targetNodeSelector: params.targetNodeSelector as string,
              nodeProperty: params.nodeProperty as 'characters' | 'visible' | 'mainComponent',
            },
          ];

    assertHandler(
      bindings.length > 0,
      'bindings array (or single propertyName/targetNodeSelector/nodeProperty) is required',
    );
    const validProps = ['characters', 'visible', 'mainComponent'];
    for (const b of bindings) {
      assertHandler(b.propertyName, 'propertyName is required for each binding');
      assertHandler(b.targetNodeSelector, 'targetNodeSelector is required for each binding (child node name to match)');
      assertHandler(
        b.nodeProperty && validProps.includes(b.nodeProperty),
        `Invalid nodeProperty "${b.nodeProperty}" on binding for "${b.propertyName}". Must be one of: ${validProps.join(', ')}`,
      );
    }

    const node = await findNodeByIdAsync(nodeId);
    assertHandler(
      node && (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET'),
      `Component or ComponentSet not found: ${nodeId}`,
      'NOT_FOUND',
    );
    const comp = node as ComponentNode | ComponentSetNode;
    const defs = comp.componentPropertyDefinitions;
    const availableProps = Object.keys(defs);

    // Pre-resolve each binding's actual property key (with Figma's #id:id suffix).
    const resolved: Array<{ spec: BindingSpec; propKey: string }> = [];
    for (const b of bindings) {
      const propKey = availableProps.find((k) => k === b.propertyName || k.startsWith(`${b.propertyName}#`));
      if (!propKey) {
        throw new HandlerError(
          `Property "${b.propertyName}" not found on component. Available: [${availableProps.join(', ')}]`,
          'PROPERTY_NOT_FOUND',
        );
      }
      resolved.push({ spec: b, propKey });
    }

    // Walk all variant children (for ComponentSet) or the component itself
    const targets: SceneNode[] =
      comp.type === 'COMPONENT_SET' ? (comp.children.filter((c) => c.type === 'COMPONENT') as SceneNode[]) : [comp];

    type BindingResult = { propertyName: string; bound: number; notFound: number };
    const perBinding = new Map<string, BindingResult>();
    for (const { spec } of resolved) {
      perBinding.set(spec.propertyName, { propertyName: spec.propertyName, bound: 0, notFound: 0 });
    }
    const errors: Array<{ variantName: string; propertyName: string; error: string }> = [];

    // ── Self-correcting error context (P0-2) ──
    // When a binding fails because targetNodeSelector matches no node, agents
    // currently re-list nodes via a separate call. Pre-walk every target ONCE
    // and emit a candidate list (name + type + id) so the next call can fix
    // itself. See memory: feedback_self_correcting_errors.
    const allChildNamesByVariant = new Map<string, Array<{ name: string; type: string; id: string }>>();
    for (const target of targets) {
      const candidates: Array<{ name: string; type: string; id: string }> = [];
      const walk = (n: SceneNode) => {
        if (n !== target) candidates.push({ name: n.name, type: n.type, id: n.id });
        if ('children' in n) {
          for (const c of (n as ChildrenMixin).children) walk(c as SceneNode);
        }
      };
      walk(target);
      allChildNamesByVariant.set(target.id, candidates);
    }

    for (const target of targets) {
      for (const { spec, propKey } of resolved) {
        const result = perBinding.get(spec.propertyName)!;
        try {
          const childNode = (target as FrameNode).findOne((n) => n.name === spec.targetNodeSelector);
          if (!childNode) {
            result.notFound++;
            continue;
          }
          if (spec.nodeProperty === 'characters' && childNode.type !== 'TEXT') {
            errors.push({
              variantName: target.name,
              propertyName: spec.propertyName,
              error: `Node "${spec.targetNodeSelector}" is ${childNode.type}, not TEXT`,
            });
            continue;
          }
          if (spec.nodeProperty === 'mainComponent' && childNode.type !== 'INSTANCE') {
            errors.push({
              variantName: target.name,
              propertyName: spec.propertyName,
              error: `Node "${spec.targetNodeSelector}" is ${childNode.type}, not INSTANCE`,
            });
            continue;
          }
          const existing =
            (childNode as unknown as { componentPropertyReferences?: Record<string, string> })
              .componentPropertyReferences ?? {};
          (
            childNode as unknown as { componentPropertyReferences: Record<string, string> }
          ).componentPropertyReferences = {
            ...existing,
            [spec.nodeProperty]: propKey,
          };
          result.bound++;
        } catch (err) {
          errors.push({
            variantName: target.name,
            propertyName: spec.propertyName,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    const results = Array.from(perBinding.values());
    const totalBound = results.reduce((s, r) => s + r.bound, 0);
    const totalNotFound = results.reduce((s, r) => s + r.notFound, 0);

    // Build self-correcting hint when ALL variants couldn't find a selector.
    // Picking the first variant's child list is enough — variants share structure.
    let notFoundHint:
      | undefined
      | {
          missingSelectors: string[];
          availableChildren: Array<{ name: string; type: string }>;
          suggestion: string;
        };
    if (totalNotFound > 0 && targets.length > 0) {
      const missingSelectors = resolved
        .filter(({ spec }) => {
          const r = perBinding.get(spec.propertyName)!;
          return r.notFound > 0 && r.bound === 0;
        })
        .map(({ spec }) => spec.targetNodeSelector);
      if (missingSelectors.length > 0) {
        const firstVariantChildren = allChildNamesByVariant.get(targets[0].id) || [];
        const dedupedChildren = Array.from(
          new Map(firstVariantChildren.map((c) => [`${c.name}::${c.type}`, { name: c.name, type: c.type }])).values(),
        );
        notFoundHint = {
          missingSelectors,
          availableChildren: dedupedChildren,
          suggestion:
            `targetNodeSelector matches a child node by exact name. Pick one from availableChildren above and retry. ` +
            `Example: { propertyName: "Label", targetNodeSelector: "${dedupedChildren.find((c) => c.type === 'TEXT')?.name || 'label'}", nodeProperty: "characters" }`,
        };
      }
    }

    return {
      ok: errors.length === 0 && totalNotFound === 0,
      bindingsProcessed: bindings.length,
      variantsTargeted: targets.length,
      totalBound,
      totalNotFound,
      results,
      errors: errors.length > 0 ? errors : undefined,
      notFoundHint,
    };
  });

  // ═══════════════════════════════════════════════════════════════
  // P1-1: batch_set_variable_binding
  // ═══════════════════════════════════════════════════════════════

  registerHandler('batch_set_variable_binding', async (params) => {
    const bindings = params.bindings as Array<{
      nodeId: string;
      field: string;
      variableId: string;
      paintIndex?: number;
    }>;

    assertHandler(Array.isArray(bindings) && bindings.length > 0, 'bindings array is required and must not be empty');

    let succeeded = 0;
    let failed = 0;
    const errors: Array<{ nodeId: string; field: string; error: string }> = [];

    // Pre-resolve all variables in parallel for efficiency
    const uniqueVarIds = [...new Set(bindings.map((b) => b.variableId))];
    const varMap = new Map<string, Variable>();
    await Promise.all(
      uniqueVarIds.map(async (id) => {
        const v = await figma.variables.getVariableByIdAsync(id);
        if (v) varMap.set(id, v);
      }),
    );

    for (const binding of bindings) {
      try {
        const node = await findNodeByIdAsync(binding.nodeId);
        if (!node) {
          errors.push({ nodeId: binding.nodeId, field: binding.field, error: 'Node not found' });
          failed++;
          continue;
        }

        const variable = varMap.get(binding.variableId);
        if (!variable) {
          errors.push({
            nodeId: binding.nodeId,
            field: binding.field,
            error: `Variable not found: ${binding.variableId}`,
          });
          failed++;
          continue;
        }

        const field = binding.field;
        if ((field === 'fills' || field === 'strokes') && 'fills' in node) {
          const paintIndex = binding.paintIndex ?? 0;
          const paints = [...((node as GeometryMixin)[field] as Paint[])];
          if (paints[paintIndex]) {
            paints[paintIndex] = figma.variables.setBoundVariableForPaint(
              paints[paintIndex] as SolidPaint,
              'color',
              variable,
            );
            (node as GeometryMixin)[field] = paints;
          } else {
            // No existing paint — create a solid paint and bind
            const newPaint = figma.variables.setBoundVariableForPaint(
              { type: 'SOLID', color: { r: 0, g: 0, b: 0 } },
              'color',
              variable,
            );
            (node as GeometryMixin)[field] = [newPaint];
          }
        } else if ('setBoundVariable' in node) {
          (node as SceneNode).setBoundVariable(field as VariableBindableNodeField, variable);
        } else {
          errors.push({ nodeId: binding.nodeId, field, error: 'Node does not support variable binding' });
          failed++;
          continue;
        }

        succeeded++;
      } catch (err) {
        errors.push({
          nodeId: binding.nodeId,
          field: binding.field,
          error: err instanceof Error ? err.message : String(err),
        });
        failed++;
      }
    }

    return { succeeded, failed, total: bindings.length, errors: errors.length > 0 ? errors : undefined };
  });

  // ═══════════════════════════════════════════════════════════════
  // P1-2: set_variable_values_multi_mode
  // ═══════════════════════════════════════════════════════════════

  registerHandler('set_variable_values_multi_mode', async (params) => {
    const variableId = params.variableId as string;
    const valuesByMode = params.valuesByMode as Record<string, unknown>;

    assertHandler(variableId, 'variableId is required');
    assertHandler(
      valuesByMode && typeof valuesByMode === 'object' && Object.keys(valuesByMode).length > 0,
      'valuesByMode is required (e.g. { "Light": "#FFFFFF", "Dark": "#1A1A1A" })',
    );

    const variable = await figma.variables.getVariableByIdAsync(variableId);
    assertHandler(variable, `Variable not found: ${variableId}`, 'NOT_FOUND');

    const collection = await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId);
    assertHandler(collection, 'Variable collection not found', 'NOT_FOUND');

    // Build mode name → modeId map
    const modeMap = new Map<string, string>();
    for (const mode of collection.modes) {
      modeMap.set(mode.name, mode.modeId);
    }

    let set = 0;
    const errors: Array<{ modeName: string; error: string }> = [];

    for (const [modeName, rawValue] of Object.entries(valuesByMode)) {
      try {
        const modeId = modeMap.get(modeName);
        assertHandler(
          modeId,
          `Mode "${modeName}" not found in collection "${collection.name}". Available: ${collection.modes.map((m) => m.name).join(', ')}`,
        );

        let value: VariableValue;

        // Handle alias references: { type: "VARIABLE_ALIAS", id: "..." }
        if (isVariableAlias(rawValue)) {
          value = rawValue as VariableAlias;
        }
        // Handle hex color strings for COLOR variables
        else if (variable.resolvedType === 'COLOR' && typeof rawValue === 'string') {
          value = hexToFigmaRgba(rawValue);
        }
        // Pass through other values
        else {
          value = rawValue as VariableValue;
        }

        variable.setValueForMode(modeId!, value);
        set++;
      } catch (err) {
        errors.push({
          modeName,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return {
      ok: true,
      variableId: variable.id,
      variableName: variable.name,
      set,
      total: Object.keys(valuesByMode).length,
      errors: errors.length > 0 ? errors : undefined,
    };
  });

  // ═══════════════════════════════════════════════════════════════
  // Extended Collections (Enterprise) — multi-brand theming
  // ═══════════════════════════════════════════════════════════════

  registerHandler('extend_collection', async (params) => {
    const collectionId = params.collectionId as string | undefined;
    const collectionKey = params.collectionKey as string | undefined;
    const name = params.name as string;

    assertHandler(name, 'name is required');
    assertHandler(collectionId || collectionKey, 'Either collectionId (local) or collectionKey (library) is required');

    if (collectionKey) {
      // Extend from library or local collection by key
      const extended = await figma.variables.extendLibraryCollectionByKeyAsync(collectionKey, name);
      return {
        id: extended.id,
        name: extended.name,
        isExtension: true,
        rootVariableCollectionId: extended.rootVariableCollectionId,
        modes: extended.modes.map((m: { modeId: string; name: string }) => ({ modeId: m.modeId, name: m.name })),
        variableCount: extended.variableIds.length,
      };
    }

    // Extend from local collection by ID
    const collection = await figma.variables.getVariableCollectionByIdAsync(collectionId!);
    assertHandler(collection, `Collection not found: ${collectionId}`, 'NOT_FOUND');
    assertHandler(!collection.remote, 'Cannot extend a remote collection by ID. Use collectionKey instead.');

    const extended = (collection as any).extend(name);
    return {
      id: extended.id,
      name: extended.name,
      isExtension: true,
      rootVariableCollectionId: extended.rootVariableCollectionId,
      modes: extended.modes.map((m: { modeId: string; name: string }) => ({ modeId: m.modeId, name: m.name })),
      variableCount: extended.variableIds.length,
    };
  });

  registerHandler('get_collection_overrides', async (params) => {
    const collectionId = params.collectionId as string;

    assertHandler(collectionId, 'collectionId is required');

    const collection = await figma.variables.getVariableCollectionByIdAsync(collectionId);
    assertHandler(collection, `Collection not found: ${collectionId}`, 'NOT_FOUND');
    assertHandler((collection as any).isExtension, 'Collection is not an extended collection');

    const extended = collection as any;
    const overrides: Array<{ variableId: string; variableName: string; modeOverrides: Record<string, unknown> }> = [];

    for (const [variableId, modeValues] of Object.entries(
      extended.variableOverrides as Record<string, Record<string, unknown>>,
    )) {
      const variable = await figma.variables.getVariableByIdAsync(variableId);
      overrides.push({
        variableId,
        variableName: variable?.name ?? 'unknown',
        modeOverrides: modeValues,
      });
    }

    return {
      collectionId: extended.id,
      collectionName: extended.name,
      rootVariableCollectionId: extended.rootVariableCollectionId,
      overrideCount: overrides.length,
      overrides,
    };
  });

  registerHandler('remove_collection_override', async (params) => {
    const collectionId = params.collectionId as string;
    const variableId = params.variableId as string;

    assertHandler(collectionId, 'collectionId is required');
    assertHandler(variableId, 'variableId is required');

    const collection = await figma.variables.getVariableCollectionByIdAsync(collectionId);
    assertHandler(collection, `Collection not found: ${collectionId}`, 'NOT_FOUND');
    assertHandler((collection as any).isExtension, 'Collection is not an extended collection');

    const variable = await figma.variables.getVariableByIdAsync(variableId);
    assertHandler(variable, `Variable not found: ${variableId}`, 'NOT_FOUND');

    (collection as any).removeOverridesForVariable(variable);
    return { ok: true };
  });
} // registerDesignSystemBuildHandlers
