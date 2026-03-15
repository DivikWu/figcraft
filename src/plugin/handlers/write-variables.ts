/**
 * Variables write handlers — create, update, delete variables and collections.
 */

import { registerHandler } from '../code.js';
import type { DesignToken } from '../../shared/types.js';
import {
  syncTokenToVariable,
  tokenPathToVariableName,
} from '../adapters/variable-mapper.js';
import { processBatch } from '../utils/batch.js';

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

  const modeId = collection.modes.find((m) => m.name === modeName)?.modeId
    ?? collection.modes[0].modeId;

  // Build existing variable map
  const existingVariables = new Map<string, Variable>();
  for (const varId of collection.variableIds) {
    const v = await figma.variables.getVariableByIdAsync(varId);
    if (v) existingVariables.set(v.name, v);
  }

  // Filter out composite types (handled separately)
  const atomicTokens = tokens.filter(
    (t) => t.type !== 'typography' && t.type !== 'shadow',
  );

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
  if (!collection) return { error: `Collection not found: ${collectionId}` };

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
  if (!variable) return { error: `Variable not found: ${variableId}` };

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
  if (!variable) return { error: `Variable not found: ${variableId}` };
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
  if (!collection) return { error: `Collection not found: ${collectionId}` };
  collection.remove();
  return { ok: true };
});
