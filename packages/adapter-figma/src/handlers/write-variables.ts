/**
 * Variables write handlers — create, update, delete variables and collections.
 */

import type { DesignToken } from '@figcraft/shared';
import { syncTokenToVariable } from '../adapters/variable-mapper.js';
import { registerHandler } from '../registry.js';
import { processBatch } from '../utils/batch.js';
import { hexToFigmaRgba } from '../utils/color.js';
import { assertHandler, HandlerError } from '../utils/handler-error.js';
import { findNodeByIdAsync } from '../utils/node-lookup.js';
import { isRgbaLike, isVariableAlias } from '../utils/type-guards.js';

export function registerWriteVariableHandlers(): void {
  registerHandler('sync_tokens', async (params) => {
    const tokens = params.tokens as DesignToken[];
    const collectionName = (params.collectionName as string) ?? 'Design Tokens';
    const modeName = (params.modeName as string) ?? 'Default';

    // Find or create collection
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    let collection = collections.find((c) => c.name === collectionName);

    if (!collection) {
      collection = figma.variables.createVariableCollection(collectionName);
      // Rename default mode
      collection.renameMode(collection.modes[0].modeId, modeName);
    }

    const modeId = collection.modes.find((m) => m.name === modeName)?.modeId ?? collection.modes[0].modeId;

    // Build existing variable map
    const existingVariables = new Map<string, Variable>();
    for (const varId of collection.variableIds) {
      const v = await figma.variables.getVariableByIdAsync(varId);
      if (v) existingVariables.set(v.name, v);
    }

    // Filter out composite types (handled separately)
    const atomicTokens = tokens.filter((t) => t.type !== 'typography' && t.type !== 'shadow');

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const failures: Array<{ path: string; error: string }> = [];

    const batchResult = await processBatch(atomicTokens, async (token) => {
      const result = await syncTokenToVariable(token, collection!, modeId, existingVariables);
      switch (result.action) {
        case 'created':
          created++;
          existingVariables.set(result.variable.name, result.variable);
          break;
        case 'updated':
          updated++;
          break;
        case 'skipped':
          skipped++;
          break;
      }
    });

    for (const r of batchResult.results) {
      if (!r.ok) {
        failures.push({ path: (r.item as DesignToken).path, error: r.error ?? 'Unknown error' });
      }
    }

    return { created, updated, skipped, failed: batchResult.failed, failures };
  });

  registerHandler('create_variable', async (params) => {
    const name = params.name as string;
    const collectionId = params.collectionId as string;
    const resolvedType = params.resolvedType as 'COLOR' | 'FLOAT' | 'STRING' | 'BOOLEAN';
    const value = params.value;
    const modeId = params.modeId as string | undefined;
    const description = params.description as string | undefined;
    const scopes = params.scopes as VariableScope[] | undefined;

    const collection = await figma.variables.getVariableCollectionByIdAsync(collectionId);
    assertHandler(collection, `Collection not found: ${collectionId}`, 'NOT_FOUND');

    const variable = figma.variables.createVariable(name, collection, resolvedType);
    if (description) variable.description = description;
    if (scopes) variable.scopes = scopes;

    const targetModeId = modeId ?? collection.modes[0].modeId;
    if (value !== undefined) {
      variable.setValueForMode(targetModeId, value as VariableValue);
    }

    return {
      id: variable.id,
      name: variable.name,
      resolvedType: variable.resolvedType,
    };
  });

  registerHandler('update_variable', async (params) => {
    const variableId = params.variableId as string;
    const variable = await figma.variables.getVariableByIdAsync(variableId);
    assertHandler(variable, `Variable not found: ${variableId}`, 'NOT_FOUND');

    if (params.name !== undefined) variable.name = params.name as string;
    if (params.description !== undefined) variable.description = params.description as string;
    if (params.scopes !== undefined) variable.scopes = params.scopes as VariableScope[];

    if (params.value !== undefined && params.modeId) {
      variable.setValueForMode(params.modeId as string, params.value as VariableValue);
    }

    return { ok: true, id: variable.id };
  });

  registerHandler('delete_variable', async (params) => {
    const variableId = params.variableId as string;
    const variable = await figma.variables.getVariableByIdAsync(variableId);
    assertHandler(variable, `Variable not found: ${variableId}`, 'NOT_FOUND');
    variable.remove();
    return { ok: true };
  });

  registerHandler('create_collection', async (params) => {
    const name = params.name as string;
    const collection = figma.variables.createVariableCollection(name);
    return {
      id: collection.id,
      name: collection.name,
      modes: collection.modes.map((m) => ({ modeId: m.modeId, name: m.name })),
    };
  });

  registerHandler('delete_collection', async (params) => {
    const collectionId = params.collectionId as string;
    const collection = await figma.variables.getVariableCollectionByIdAsync(collectionId);
    assertHandler(collection, `Collection not found: ${collectionId}`, 'NOT_FOUND');
    collection.remove();
    return { ok: true };
  });

  registerHandler('rename_collection', async (params) => {
    const collectionId = params.collectionId as string;
    const name = params.name as string;
    const collection = await figma.variables.getVariableCollectionByIdAsync(collectionId);
    assertHandler(collection, `Collection not found: ${collectionId}`, 'NOT_FOUND');
    collection.name = name;
    return { ok: true, id: collection.id, name: collection.name };
  });

  registerHandler('add_collection_mode', async (params) => {
    const collectionId = params.collectionId as string;
    const name = params.name as string;
    const collection = await figma.variables.getVariableCollectionByIdAsync(collectionId);
    assertHandler(collection, `Collection not found: ${collectionId}`, 'NOT_FOUND');
    const modeId = collection.addMode(name);
    return { ok: true, modeId, name };
  });

  registerHandler('rename_collection_mode', async (params) => {
    const collectionId = params.collectionId as string;
    const modeId = params.modeId as string;
    const name = params.name as string;
    const collection = await figma.variables.getVariableCollectionByIdAsync(collectionId);
    assertHandler(collection, `Collection not found: ${collectionId}`, 'NOT_FOUND');
    collection.renameMode(modeId, name);
    return { ok: true };
  });

  registerHandler('remove_collection_mode', async (params) => {
    const collectionId = params.collectionId as string;
    const modeId = params.modeId as string;
    const collection = await figma.variables.getVariableCollectionByIdAsync(collectionId);
    assertHandler(collection, `Collection not found: ${collectionId}`, 'NOT_FOUND');
    assertHandler(collection.modes.length > 1, 'Cannot remove the last mode');
    collection.removeMode(modeId);
    return { ok: true };
  });

  registerHandler('set_variable_binding', async (params) => {
    const nodeId = params.nodeId as string;
    const field = params.field as string;
    const variableId = params.variableId as string;

    const node = await findNodeByIdAsync(nodeId);
    assertHandler(
      node && 'setBoundVariable' in node,
      `Node not found or does not support variable binding: ${nodeId}`,
      'NOT_FOUND',
    );

    const variable = await figma.variables.getVariableByIdAsync(variableId);
    assertHandler(variable, `Variable not found: ${variableId}`, 'NOT_FOUND');

    try {
      if ((field === 'fills' || field === 'strokes') && 'fills' in node) {
        const paintIndex = (params.paintIndex as number) ?? 0;
        const paints = [...((node as GeometryMixin)[field] as Paint[])];
        if (paints[paintIndex]) {
          paints[paintIndex] = figma.variables.setBoundVariableForPaint(
            paints[paintIndex] as SolidPaint,
            'color',
            variable,
          );
          (node as GeometryMixin)[field] = paints;
        }
      } else {
        (node as SceneNode).setBoundVariable(field as VariableBindableNodeField, variable);
      }
    } catch (err) {
      throw new HandlerError(`Cannot bind field "${field}": ${err instanceof Error ? err.message : String(err)}`);
    }

    return { ok: true };
  });

  registerHandler('set_explicit_variable_mode', async (params) => {
    const nodeId = params.nodeId as string;
    const collectionId = params.collectionId as string;
    const modeId = params.modeId as string;

    const node = await findNodeByIdAsync(nodeId);
    assertHandler(
      node && 'setExplicitVariableModeForCollection' in node,
      `Node not found or does not support variable modes: ${nodeId}`,
      'NOT_FOUND',
    );

    try {
      (node as SceneNode).setExplicitVariableModeForCollection(collectionId, modeId);
    } catch (err) {
      throw new HandlerError(`Cannot set mode: ${err instanceof Error ? err.message : String(err)}`);
    }

    return { ok: true };
  });

  // ─── Variable Alias ───

  // ─── Batch Create Variables ───

  registerHandler('ensure_collection_modes', async (params) => {
    const collectionName = params.collectionName as string;
    const modeNames = params.modeNames as string[];

    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    let collection = collections.find((c) => c.name === collectionName);

    if (!collection) {
      collection = figma.variables.createVariableCollection(collectionName);
      // Rename default mode to first requested mode
      collection.renameMode(collection.modes[0].modeId, modeNames[0]);
    }

    // Ensure all modes exist
    for (const modeName of modeNames) {
      const existing = collection.modes.find((m) => m.name === modeName);
      if (!existing) {
        collection.addMode(modeName);
      }
    }

    return {
      collectionId: collection.id,
      modes: collection.modes.map((m) => ({ modeId: m.modeId, name: m.name })),
    };
  });

  registerHandler('batch_create_variables', async (params) => {
    const collectionName = params.collectionName as string;
    const modeName = (params.modeName as string) ?? 'Default';
    const variables = params.variables as Array<{
      name: string;
      type: 'COLOR' | 'FLOAT' | 'STRING' | 'BOOLEAN';
      value: unknown;
      description?: string;
      scopes?: string[];
    }>;

    // Find or create collection
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    let collection = collections.find((c) => c.name === collectionName);
    if (!collection) {
      collection = figma.variables.createVariableCollection(collectionName);
      collection.renameMode(collection.modes[0].modeId, modeName);
    }

    const modeId = collection.modes.find((m) => m.name === modeName)?.modeId ?? collection.modes[0].modeId;

    // Build existing variable map to skip duplicates
    const existing = new Map<string, Variable>();
    for (const varId of collection.variableIds) {
      const v = await figma.variables.getVariableByIdAsync(varId);
      if (v) existing.set(v.name, v);
    }

    let created = 0;
    let skipped = 0;
    let failed = 0;
    const errors: Array<{ name: string; error: string }> = [];

    for (const spec of variables) {
      try {
        if (existing.has(spec.name)) {
          skipped++;
          continue;
        }
        const variable = figma.variables.createVariable(spec.name, collection!, spec.type);
        if (spec.value !== undefined) {
          let val = spec.value;
          // Convert hex color strings to Figma RGBA
          if (spec.type === 'COLOR' && typeof val === 'string') {
            val = hexToFigmaRgba(val);
          }
          variable.setValueForMode(modeId, val as VariableValue);
        }
        if (spec.description) variable.description = spec.description;
        if (spec.scopes) variable.scopes = spec.scopes as VariableScope[];
        existing.set(spec.name, variable);
        created++;
      } catch (err) {
        failed++;
        errors.push({ name: spec.name, error: err instanceof Error ? err.message : String(err) });
      }
    }

    return { created, skipped, failed, errors, collectionId: collection!.id };
  });

  // ─── Variable Alias ───

  registerHandler('create_variable_alias', async (params) => {
    const variableId = params.variableId as string;
    const targetVariableId = params.targetVariableId as string;
    const modeId = params.modeId as string | undefined;

    const variable = await figma.variables.getVariableByIdAsync(variableId);
    assertHandler(variable, `Variable not found: ${variableId}`, 'NOT_FOUND');

    const target = await figma.variables.getVariableByIdAsync(targetVariableId);
    assertHandler(target, `Target variable not found: ${targetVariableId}`, 'NOT_FOUND');

    // Type compatibility check
    assertHandler(
      variable.resolvedType === target.resolvedType,
      `Type mismatch: ${variable.resolvedType} cannot alias ${target.resolvedType}`,
    );

    const collection = await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId);
    assertHandler(collection, 'Variable collection not found', 'NOT_FOUND');

    const targetModeId = modeId ?? collection.modes[0].modeId;
    const alias: VariableAlias = {
      type: 'VARIABLE_ALIAS',
      id: targetVariableId,
    };
    variable.setValueForMode(targetModeId, alias);

    return { ok: true, variableId: variable.id, aliasTo: target.name };
  });

  registerHandler('export_variables', async (params) => {
    const collectionId = params.collectionId as string | undefined;

    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    const targetCollections = collectionId ? collections.filter((c) => c.id === collectionId) : collections;

    const result: Array<{
      path: string;
      type: string;
      valuesByMode: Record<string, unknown>;
      description?: string;
      scopes?: string[];
      aliasOf?: Record<string, string>;
    }> = [];

    for (const collection of targetCollections) {
      for (const varId of collection.variableIds) {
        const variable = await figma.variables.getVariableByIdAsync(varId);
        if (!variable) continue;

        const valuesByMode: Record<string, unknown> = {};
        const aliasOf: Record<string, string> = {};

        for (const mode of collection.modes) {
          const raw = variable.valuesByMode[mode.modeId];
          if (isVariableAlias(raw)) {
            const ref = await figma.variables.getVariableByIdAsync(raw.id);
            aliasOf[mode.name] = ref ? ref.name.replace(/\//g, '.') : raw.id;
            valuesByMode[mode.name] = `{${ref ? ref.name.replace(/\//g, '.') : raw.id}}`;
            continue;
          }
          // Color → hex
          if (isRgbaLike(raw)) {
            const r = Math.round(raw.r * 255);
            const g = Math.round(raw.g * 255);
            const b = Math.round(raw.b * 255);
            valuesByMode[mode.name] =
              `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
          } else {
            valuesByMode[mode.name] = raw;
          }
        }

        const entry: (typeof result)[0] = {
          path: variable.name.replace(/\//g, '.'),
          type: figmaTypeToDtcg(variable.resolvedType),
          valuesByMode,
        };
        if (variable.description) entry.description = variable.description;
        if (variable.scopes.length > 0) entry.scopes = variable.scopes;
        if (Object.keys(aliasOf).length > 0) entry.aliasOf = aliasOf;

        result.push(entry);
      }
    }

    return { count: result.length, variables: result };
  });
} // registerWriteVariableHandlers

// ─── Helpers ───

function figmaTypeToDtcg(resolvedType: string): string {
  switch (resolvedType) {
    case 'COLOR':
      return 'color';
    case 'FLOAT':
      return 'number';
    case 'STRING':
      return 'string';
    case 'BOOLEAN':
      return 'boolean';
    default:
      return 'string';
  }
}
