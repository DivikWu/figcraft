/**
 * Variables read handlers — list local variables and collections.
 */

import { registerHandler } from '../registry.js';
import { figmaRgbaToHex } from '../utils/color.js';
import { assertHandler } from '../utils/handler-error.js';
import { findNodeByIdAsync } from '../utils/node-lookup.js';
import { isRgbaLike, isVariableAlias } from '../utils/type-guards.js';

export function registerVariableHandlers(): void {
  registerHandler('list_variables', async (params) => {
    const collectionId = params.collectionId as string | undefined;
    const type = params.type as string | undefined;

    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    const results: unknown[] = [];

    for (const collection of collections) {
      if (collectionId && collection.id !== collectionId) continue;

      for (const varId of collection.variableIds) {
        const variable = await figma.variables.getVariableByIdAsync(varId);
        if (!variable) continue;
        if (type && variable.resolvedType !== type) continue;

        const hasCodeSyntax = variable.codeSyntax && Object.keys(variable.codeSyntax).length > 0;
        results.push({
          id: variable.id,
          name: variable.name,
          resolvedType: variable.resolvedType,
          description: variable.description,
          collectionId: collection.id,
          collectionName: collection.name,
          scopes: variable.scopes,
          ...(hasCodeSyntax ? { codeSyntax: variable.codeSyntax } : {}),
          valuesByMode: simplifyValuesByMode(variable, collection),
        });
      }
    }

    return { count: results.length, variables: results };
  });

  registerHandler('get_variable', async (params) => {
    const variableId = params.variableId as string;
    const variable = await figma.variables.getVariableByIdAsync(variableId);
    assertHandler(variable, `Variable not found: ${variableId}`, 'NOT_FOUND');

    const collection = await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId);

    return {
      id: variable.id,
      name: variable.name,
      resolvedType: variable.resolvedType,
      description: variable.description,
      collectionId: variable.variableCollectionId,
      collectionName: collection?.name,
      scopes: variable.scopes,
      codeSyntax: variable.codeSyntax,
      valuesByMode: collection ? simplifyValuesByMode(variable, collection) : variable.valuesByMode,
    };
  });

  registerHandler('list_collections', async () => {
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    return collections.map((c) => ({
      id: c.id,
      name: c.name,
      modes: c.modes.map((m) => ({ modeId: m.modeId, name: m.name })),
      variableCount: c.variableIds.length,
    }));
  });

  registerHandler('get_node_variables', async (params) => {
    const nodeId = params.nodeId as string;
    const node = await findNodeByIdAsync(nodeId);
    assertHandler(node, `Node not found: ${nodeId}`, 'NOT_FOUND');

    const sceneNode = node as SceneNode;
    if (!('boundVariables' in sceneNode) || !sceneNode.boundVariables) {
      return { nodeId, bindings: {} };
    }

    const bindings: Record<string, unknown[]> = {};

    for (const [field, value] of Object.entries(sceneNode.boundVariables)) {
      const aliases: Array<{ id: string }> = Array.isArray(value)
        ? (value as Array<{ id: string }>)
        : [value as unknown as { id: string }];
      const resolved: unknown[] = [];
      for (const alias of aliases) {
        if (!alias?.id) continue;
        const variable = await figma.variables.getVariableByIdAsync(alias.id);
        resolved.push({
          variableId: alias.id,
          variableName: variable?.name ?? null,
          collectionId: variable?.variableCollectionId ?? null,
        });
      }
      if (resolved.length > 0) {
        bindings[field] = resolved;
      }
    }

    return { nodeId, bindings };
  });
} // registerVariableHandlers

// ─── Helpers ───

function simplifyValuesByMode(variable: Variable, collection: VariableCollection): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const mode of collection.modes) {
    const raw = variable.valuesByMode[mode.modeId];
    result[mode.name] = simplifyValue(raw);
  }
  return result;
}

function simplifyValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;

  // Variable alias
  if (isVariableAlias(value)) {
    return { alias: value.id };
  }

  // RGB/RGBA color
  if (isRgbaLike(value)) {
    return figmaRgbaToHex(value);
  }

  return value;
}
