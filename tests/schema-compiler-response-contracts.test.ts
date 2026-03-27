import { describe, expect, it } from 'vitest';
import {
  GENERATED_TOOL_RESPONSE_EXAMPLES,
  GENERATED_TOOL_RESPONSE_SCHEMAS,
  GENERATED_ENDPOINT_METHOD_RESPONSE_EXAMPLES,
  GENERATED_ENDPOINT_METHOD_RESPONSE_SCHEMAS,
} from '../packages/core-mcp/src/tools/_contracts.js';

const EXPECTED_TOOLS = [
  'ping',
  'get_mode',
  'set_mode',
  'get_design_guidelines',
  'audit_node',
  'join_channel',
  'get_channel',
  'get_current_page',
  'get_document_info',
  'get_selection',
  'list_fonts',
  'lint_fix_all',
  'set_current_page',
  'export_image',
  'save_version_history',
  'set_selection',
  'set_explicit_variable_mode',
  'rename_collection',
  'add_collection_mode',
  'rename_collection_mode',
  'remove_collection_mode',
  'create_variable_alias',
  'list_tokens',
  'sync_tokens',
  'sync_tokens_multi_mode',
  'diff_tokens',
  'reverse_sync_tokens',
  'cache_tokens',
  'list_cached_tokens',
  'delete_cached_tokens',
  'scan_styles',
  'export_tokens',
  'diff_styles',
  'create_component',
  'create_component_set',
  'update_component',
  'delete_component',
  'swap_instance',
  'detach_instance',
  'reset_instance_overrides',
  'get_instance_overrides',
  'set_instance_overrides',
  'add_component_property',
  'update_component_property',
  'delete_component_property',
  'audit_components',
  'list_library_collections',
  'list_library_variables',
  'import_library_variable',
  'list_library_styles',
  'get_library_style_details',
  'sync_library_styles',
  'import_library_style',
  'create_line',
  'create_star',
  'create_polygon',
  'create_section',
  'flatten_node',
  'boolean_operation',
  'get_annotations',
  'set_annotation',
  'set_multiple_annotations',
  'clear_annotations',
  'get_reactions',
  'add_reaction',
  'remove_reaction',
  'set_reactions',
  'connect_screens',
  'analyze_prototype_flow',
  'lint_check',
  'lint_fix',
  'lint_rules',
  'compliance_report',
  'figma_login',
  'figma_logout',
  'figma_auth_status',
  'create_page',
  'rename_page',
  'delete_node',
  'register_library_styles',
  'get_registered_styles',
  'stage_changes',
  'commit_changes',
  'discard_changes',
  'list_staged',
] as const;

const EXPECTED_ENDPOINT_METHODS = [
  ['nodes', 'get'],
  ['nodes', 'list'],
  ['nodes', 'update'],
  ['nodes', 'delete'],
  ['text', 'set_content'],
  ['components', 'list'],
  ['components', 'list_library'],
  ['components', 'get'],
  ['components', 'list_properties'],
  ['variables_ep', 'list'],
  ['variables_ep', 'get'],
  ['variables_ep', 'list_collections'],
  ['variables_ep', 'get_bindings'],
  ['variables_ep', 'set_binding'],
  ['variables_ep', 'create'],
  ['variables_ep', 'update'],
  ['variables_ep', 'delete'],
  ['variables_ep', 'create_collection'],
  ['variables_ep', 'delete_collection'],
  ['variables_ep', 'batch_create'],
  ['variables_ep', 'export'],
  ['styles_ep', 'list'],
  ['styles_ep', 'get'],
  ['styles_ep', 'create_paint'],
  ['styles_ep', 'update_paint'],
  ['styles_ep', 'update_text'],
  ['styles_ep', 'update_effect'],
  ['styles_ep', 'delete'],
  ['styles_ep', 'sync'],
] as const;

describe('generated tool response contracts', () => {
  it('exports response schemas for annotated tools', () => {
    expect(Object.keys(GENERATED_TOOL_RESPONSE_SCHEMAS)).toEqual(
      expect.arrayContaining(EXPECTED_TOOLS),
    );
    expect(Object.keys(GENERATED_TOOL_RESPONSE_SCHEMAS).length).toBeGreaterThanOrEqual(EXPECTED_TOOLS.length);
  });

  it.each(EXPECTED_TOOLS)(
    '%s examples satisfy the generated response schema',
    (toolName) => {
      const schema = GENERATED_TOOL_RESPONSE_SCHEMAS[toolName];
      const examples = GENERATED_TOOL_RESPONSE_EXAMPLES[toolName];

      expect(schema).toBeDefined();
      expect(examples.length).toBeGreaterThan(0);

      for (const example of examples) {
        const parsed = schema.safeParse(example);
        expect(parsed.success, JSON.stringify(parsed, null, 2)).toBe(true);
      }
    },
  );
});

describe('generated endpoint method response contracts', () => {
  it('exports response schemas for annotated endpoint methods', () => {
    for (const [endpointName, methodName] of EXPECTED_ENDPOINT_METHODS) {
      expect(GENERATED_ENDPOINT_METHOD_RESPONSE_SCHEMAS[endpointName]?.[methodName]).toBeDefined();
    }
  });

  it.each(EXPECTED_ENDPOINT_METHODS)(
    'validates %s.%s examples against the generated response schema',
    (endpointName, methodName) => {
      const schema = GENERATED_ENDPOINT_METHOD_RESPONSE_SCHEMAS[endpointName][methodName];
      const examples = GENERATED_ENDPOINT_METHOD_RESPONSE_EXAMPLES[endpointName][methodName];

      expect(examples.length).toBeGreaterThan(0);

      for (const example of examples) {
        const parsed = schema.safeParse(example);
        expect(parsed.success, JSON.stringify(parsed, null, 2)).toBe(true);
      }
    },
  );
});
