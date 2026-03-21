/**
 * Shared test utilities for endpoint tests.
 *
 * Provides buildMinimalParams() to generate minimal valid params for any
 * (endpoint, method) pair, avoiding duplication across test files.
 */

/**
 * Build minimal valid params for a given (endpoint, method) so the handler
 * doesn't throw on destructuring. Used by property-based tests that iterate
 * over all endpoint/method combinations.
 */
export function buildMinimalParams(endpoint: string, method: string): Record<string, unknown> {
  const params: Record<string, unknown> = { method };

  // nodes endpoint
  if (endpoint === 'nodes') {
    if (method === 'get') params.nodeId = '1:1';
    if (method === 'list') params.query = 'test';
    if (method === 'update') params.patches = [];
    if (method === 'delete') params.nodeIds = [];
    if (method === 'clone') params.nodeId = '1:1';
    if (method === 'insert_child') { params.parentId = '1:1'; params.childId = '2:2'; }
  }

  // text endpoint
  if (endpoint === 'text') {
    if (method === 'create') params.content = 'hi';
    if (method === 'set_content') { params.nodeId = '1:1'; params.content = 'hi'; }
  }

  // shapes endpoint
  if (endpoint === 'shapes') {
    if (method === 'create_frame') params.name = 'F';
    if (method === 'create_rectangle') params.name = 'R';
    if (method === 'create_ellipse') params.name = 'E';
    if (method === 'create_vector') params.svg = '<svg></svg>';
  }

  // components endpoint
  if (endpoint === 'components') {
    if (method === 'list_library') params.fileKey = 'fk';
    if (method === 'get') params.nodeId = '1:1';
    if (method === 'create_instance') params.componentKey = 'k';
    if (method === 'list_properties') params.nodeId = '1:1';
  }

  // variables_ep endpoint
  if (endpoint === 'variables_ep') {
    if (method === 'get') params.variableId = 'v1';
    if (method === 'get_bindings') params.nodeId = '1:1';
    if (method === 'set_binding') { params.nodeId = '1:1'; params.field = 'f'; params.variableId = 'v1'; }
    if (method === 'create') { params.name = 'n'; params.collectionId = 'c'; params.resolvedType = 'COLOR'; }
    if (method === 'update') params.variableId = 'v1';
    if (method === 'delete') params.variableId = 'v1';
    if (method === 'create_collection') params.name = 'c';
    if (method === 'delete_collection') params.collectionId = 'c1';
    if (method === 'batch_create') { params.collectionName = 'cn'; params.modeName = 'mn'; params.variables = []; }
    if (method === 'export') params.collectionId = 'c1';
  }

  // styles_ep endpoint
  if (endpoint === 'styles_ep') {
    if (method === 'get') params.styleId = 's1';
    if (method === 'create_paint') { params.name = 'n'; params.color = '#000'; }
    if (method === 'update_paint') params.styleId = 's1';
    if (method === 'update_text') params.styleId = 's1';
    if (method === 'update_effect') params.styleId = 's1';
    if (method === 'delete') params.styleId = 's1';
    if (method === 'sync') params.tokens = {};
  }

  return params;
}
