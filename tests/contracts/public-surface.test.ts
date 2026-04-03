import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  GENERATED_ENDPOINT_METHOD_RESPONSE_EXAMPLES,
  GENERATED_TOOL_RESPONSE_EXAMPLES,
} from '../../packages/core-mcp/src/tools/_contracts.js';

const rootPkg = JSON.parse(readFileSync('package.json', 'utf-8')) as {
  private?: boolean;
  bin?: Record<string, string>;
  scripts?: Record<string, string>;
};
const publishedPkg = JSON.parse(readFileSync('packages/figcraft-design/package.json', 'utf-8')) as {
  name?: string;
  bin?: Record<string, string>;
};
const manifestSource = JSON.parse(readFileSync('packages/adapter-figma/manifest.base.json', 'utf-8')) as {
  name?: string;
  id?: string;
};
const manifest = JSON.parse(readFileSync('manifest.json', 'utf-8')) as {
  name?: string;
  id?: string;
  main?: string;
  ui?: string;
};
const toolResponseCount = Object.keys(GENERATED_TOOL_RESPONSE_EXAMPLES).length;
const endpointMethodCount = Object.values(GENERATED_ENDPOINT_METHOD_RESPONSE_EXAMPLES).reduce(
  (total, methods) => total + Object.keys(methods).length,
  0,
);

describe('public contract baseline', () => {
  it('keeps the workspace root private and publishes figcraft-design from its dedicated package', () => {
    expect(rootPkg.private).toBe(true);
    expect(rootPkg.bin?.['figcraft-design']).toBeUndefined();
    expect(publishedPkg.name).toBe('figcraft-design');
    expect(publishedPkg.bin?.['figcraft-design']).toBe('./dist/index.js');
  });

  it('keeps the root manifest import targets stable as a generated compatibility artifact', () => {
    expect(manifestSource.name).toBe('FigCraft');
    expect(manifestSource.id).toBe('figcraft-plugin');
    expect(manifest.name).toBe(manifestSource.name);
    expect(manifest.id).toBe(manifestSource.id);
    expect(manifest.main).toBe('dist/plugin/code.js');
    expect(manifest.ui).toBe('dist/plugin/ui.html');
  });

  it('keeps schema/tools.yaml as the current single source of truth', () => {
    expect(existsSync('schema/tools.yaml')).toBe(true);
  });

  it('keeps the local MCP development entrypoint routed through the published package shell', () => {
    expect(rootPkg.scripts?.['dev:mcp']).toBe('tsx packages/figcraft-design/src/index.ts');
    expect(rootPkg.scripts?.['dev:relay']).toBe('tsx packages/relay/src/index.ts');
  });

  it('documents the current compatibility contract', () => {
    const doc = readFileSync('docs/public-contract.md', 'utf-8');
    expect(doc).toContain('figcraft-design');
    expect(doc).toContain('manifest.json');
    expect(doc).toContain('schema/tools.yaml');
    expect(doc).toContain('packages/figcraft-design/package.json');
    expect(doc).toContain('packages/adapter-figma/manifest.base.json');
    expect(doc).toContain('packages/core-mcp/src/tools/_contracts.ts');
    expect(doc).toContain('docs/generated/api-contracts.md');
    expect(doc).toContain('GENERATED_ENDPOINT_REPLACES');
  });

  it('keeps the generated API contract doc present and populated', () => {
    const generatedDoc = readFileSync('docs/generated/api-contracts.md', 'utf-8');
    expect(generatedDoc).toContain('FigCraft API Contracts');
    expect(generatedDoc).toContain('Tool Response Coverage');
    expect(generatedDoc).toContain('Endpoint Response Coverage');
    expect(generatedDoc).toContain('Flat To Endpoint Migration Map');
    expect(generatedDoc).toContain(`Covered flat/custom tools: ${toolResponseCount}`);
    expect(generatedDoc).toContain(`Covered endpoint methods: ${endpointMethodCount}`);
    expect(generatedDoc).toContain('export_image');
    expect(generatedDoc).toContain('get_current_page');
    expect(generatedDoc).toContain('get_document_info');
    expect(generatedDoc).toContain('get_selection');
    expect(generatedDoc).toContain('get_mode');
    expect(generatedDoc).toContain('join_channel');
    expect(generatedDoc).toContain('get_channel');
    expect(generatedDoc).toContain('list_fonts');
    expect(generatedDoc).toContain('patch_nodes');
    expect(generatedDoc).toContain('delete_nodes');
    expect(generatedDoc).toContain('set_text_content');
    expect(generatedDoc).toContain('save_version_history');
    expect(generatedDoc).toContain('set_current_page');
    expect(generatedDoc).toContain('set_selection');
    expect(generatedDoc).toContain('list_variables');
    expect(generatedDoc).toContain('get_variable');
    expect(generatedDoc).toContain('list_collections');
    expect(generatedDoc).toContain('get_node_variables');
    expect(generatedDoc).toContain('set_variable_binding');
    expect(generatedDoc).toContain('set_explicit_variable_mode');
    expect(generatedDoc).toContain('create_variable');
    expect(generatedDoc).toContain('update_variable');
    expect(generatedDoc).toContain('delete_variable');
    expect(generatedDoc).toContain('create_collection');
    expect(generatedDoc).toContain('delete_collection');
    expect(generatedDoc).toContain('rename_collection');
    expect(generatedDoc).toContain('add_collection_mode');
    expect(generatedDoc).toContain('rename_collection_mode');
    expect(generatedDoc).toContain('remove_collection_mode');
    expect(generatedDoc).toContain('create_variable_alias');
    expect(generatedDoc).toContain('export_variables');
    expect(generatedDoc).toContain('batch_create_variables');
    expect(generatedDoc).toContain('list_tokens');
    expect(generatedDoc).toContain('sync_tokens');
    expect(generatedDoc).toContain('sync_tokens_multi_mode');
    expect(generatedDoc).toContain('diff_tokens');
    expect(generatedDoc).toContain('reverse_sync_tokens');
    expect(generatedDoc).toContain('cache_tokens');
    expect(generatedDoc).toContain('list_cached_tokens');
    expect(generatedDoc).toContain('delete_cached_tokens');
    expect(generatedDoc).toContain('scan_styles');
    expect(generatedDoc).toContain('export_tokens');
    expect(generatedDoc).toContain('diff_styles');
    expect(generatedDoc).toContain('create_component');
    expect(generatedDoc).toContain('create_component_set');
    expect(generatedDoc).toContain('update_component');
    expect(generatedDoc).toContain('delete_component');
    expect(generatedDoc).toContain('swap_instance');
    expect(generatedDoc).toContain('detach_instance');
    expect(generatedDoc).toContain('reset_instance_overrides');
    expect(generatedDoc).toContain('get_instance_overrides');
    expect(generatedDoc).toContain('set_instance_overrides');
    expect(generatedDoc).toContain('add_component_property');
    expect(generatedDoc).toContain('update_component_property');
    expect(generatedDoc).toContain('delete_component_property');
    expect(generatedDoc).toContain('audit_components');
    expect(generatedDoc).toContain('list_library_collections');
    expect(generatedDoc).toContain('list_library_variables');
    expect(generatedDoc).toContain('import_library_variable');
    expect(generatedDoc).toContain('list_library_styles');
    expect(generatedDoc).toContain('get_library_style_details');
    expect(generatedDoc).toContain('sync_library_styles');
    expect(generatedDoc).toContain('import_library_style');
    expect(generatedDoc).toContain('create_line');
    expect(generatedDoc).toContain('create_star');
    expect(generatedDoc).toContain('create_polygon');
    expect(generatedDoc).toContain('create_section');
    expect(generatedDoc).toContain('flatten_node');
    expect(generatedDoc).toContain('boolean_operation');
    expect(generatedDoc).toContain('get_annotations');
    expect(generatedDoc).toContain('set_annotation');
    expect(generatedDoc).toContain('set_multiple_annotations');
    expect(generatedDoc).toContain('clear_annotations');
    expect(generatedDoc).toContain('get_reactions');
    expect(generatedDoc).toContain('analyze_prototype_flow');
    expect(generatedDoc).toContain('lint_check');
    expect(generatedDoc).toContain('lint_fix');
    expect(generatedDoc).toContain('lint_rules');
    expect(generatedDoc).toContain('compliance_report');
    expect(generatedDoc).toContain('figma_login');
    expect(generatedDoc).toContain('figma_logout');
    expect(generatedDoc).toContain('figma_auth_status');
    expect(generatedDoc).toContain('create_page');
    expect(generatedDoc).toContain('rename_page');
    expect(generatedDoc).toContain('delete_node');
    expect(generatedDoc).toContain('list_styles');
    expect(generatedDoc).toContain('get_style');
    expect(generatedDoc).toContain('sync_styles');
    expect(generatedDoc).toContain('create_paint_style');
    expect(generatedDoc).toContain('delete_style');
    expect(generatedDoc).toContain('update_paint_style');
    expect(generatedDoc).toContain('update_text_style');
    expect(generatedDoc).toContain('update_effect_style');
    expect(generatedDoc).toContain('register_library_styles');
    expect(generatedDoc).toContain('get_registered_styles');
    expect(generatedDoc).toContain('nodes.get');
    expect(generatedDoc).toContain('nodes.list');
    expect(generatedDoc).toContain('nodes.update');
    expect(generatedDoc).toContain('nodes.delete');
    expect(generatedDoc).toContain('text.set_content');
    expect(generatedDoc).toContain('components.list');
    expect(generatedDoc).toContain('components.list_library');
    expect(generatedDoc).toContain('components.get');
    expect(generatedDoc).toContain('components.list_properties');
    expect(generatedDoc).toContain('variables_ep.list');
    expect(generatedDoc).toContain('variables_ep.get');
    expect(generatedDoc).toContain('variables_ep.list_collections');
    expect(generatedDoc).toContain('variables_ep.get_bindings');
    expect(generatedDoc).toContain('variables_ep.set_binding');
    expect(generatedDoc).toContain('variables_ep.create');
    expect(generatedDoc).toContain('variables_ep.update');
    expect(generatedDoc).toContain('variables_ep.delete');
    expect(generatedDoc).toContain('variables_ep.create_collection');
    expect(generatedDoc).toContain('variables_ep.delete_collection');
    expect(generatedDoc).toContain('variables_ep.batch_create');
    expect(generatedDoc).toContain('variables_ep.export');
    expect(generatedDoc).toContain('styles_ep.list');
    expect(generatedDoc).toContain('styles_ep.get');
    expect(generatedDoc).toContain('styles_ep.create_paint');
    expect(generatedDoc).toContain('styles_ep.update_paint');
    expect(generatedDoc).toContain('styles_ep.update_text');
    expect(generatedDoc).toContain('styles_ep.update_effect');
    expect(generatedDoc).toContain('styles_ep.delete');
    expect(generatedDoc).toContain('styles_ep.sync');
    expect(generatedDoc).toContain('get_node_info');
    expect(generatedDoc).toContain('search_nodes');
    expect(generatedDoc).toContain('list_library_components');
  });
});
