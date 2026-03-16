/**
 * Library read handlers — enumerate team library variables and collections.
 *
 * Uses figma.teamLibrary API (requires "teamlibrary" permission in manifest).
 * Note: Library Styles cannot be enumerated via Plugin API (REST API needed).
 */

import { registerHandler } from '../registry.js';

export function registerLibraryHandlers(): void {

registerHandler('list_library_collections', async () => {
  const collections =
    await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
  return collections.map((c) => ({
    key: c.key,
    name: c.name,
    libraryName: c.libraryName,
  }));
});

registerHandler('list_library_variables', async (params) => {
  const collectionKey = params.collectionKey as string;

  const variables =
    await figma.teamLibrary.getVariablesInLibraryCollectionAsync(collectionKey);

  return {
    count: variables.length,
    variables: variables.map((v) => ({
      key: v.key,
      name: v.name,
      resolvedType: v.resolvedType,
    })),
  };
});

registerHandler('import_library_variable', async (params) => {
  const variableKey = params.variableKey as string;

  const imported =
    await figma.variables.importVariableByKeyAsync(variableKey);

  return {
    id: imported.id,
    name: imported.name,
    resolvedType: imported.resolvedType,
    description: imported.description,
    key: imported.key,
  };
});

registerHandler('import_library_style', async (params) => {
  const styleKey = params.styleKey as string;
  const imported = await figma.importStyleByKeyAsync(styleKey);
  return {
    id: imported.id,
    name: imported.name,
    type: imported.type,
    key: imported.key,
    description: imported.description,
  };
});

} // registerLibraryHandlers
