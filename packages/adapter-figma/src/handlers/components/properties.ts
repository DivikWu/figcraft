/**
 * Component property handlers — list / add / update / delete component properties.
 *
 * These are the standalone property handlers. Inline property creation inside
 * create_component lives in crud.ts (via createSingleComponent), which mirrors
 * the same validation shape so both paths surface identical error messages.
 */

import { registerHandler } from '../../registry.js';
import { assertHandler, HandlerError } from '../../utils/handler-error.js';
import { findNodeByIdAsync } from '../../utils/node-lookup.js';

export function registerComponentPropertyHandlers(): void {
  registerHandler('list_component_properties', async (params) => {
    const node = await findNodeByIdAsync(params.nodeId as string);
    assertHandler(
      node && (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET'),
      `Component not found: ${params.nodeId}`,
      'NOT_FOUND',
    );
    const comp = node as ComponentNode | ComponentSetNode;
    return {
      properties: Object.entries(comp.componentPropertyDefinitions).map(([key, def]) => ({
        key,
        type: def.type,
        defaultValue: def.defaultValue,
        variantOptions:
          'variantOptions' in def
            ? (def as ComponentPropertyDefinitions[string] & { variantOptions?: string[] }).variantOptions
            : undefined,
      })),
    };
  });

  registerHandler('add_component_property', async (params) => {
    const nodeId = params.nodeId as string;
    const propertyName = params.propertyName as string;
    const propertyType = params.type as 'BOOLEAN' | 'TEXT' | 'INSTANCE_SWAP' | 'VARIANT' | 'SLOT';
    const defaultValue = params.defaultValue as string | boolean | VariableAlias;

    const validTypes = ['BOOLEAN', 'TEXT', 'INSTANCE_SWAP', 'VARIANT', 'SLOT'];
    if (!propertyType || !validTypes.includes(propertyType)) {
      throw new HandlerError(
        `Invalid property type "${propertyType}". Must be one of: [${validTypes.join(', ')}]. ` +
          `Note: VARIANT is auto-managed by combineAsVariants — pass BOOLEAN/TEXT/INSTANCE_SWAP/SLOT instead.`,
        'INVALID_PROPERTY_TYPE',
      );
    }

    const node = await findNodeByIdAsync(nodeId);
    assertHandler(
      node && (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET'),
      `Component not found: ${nodeId}`,
      'NOT_FOUND',
    );
    const comp = node as ComponentNode | ComponentSetNode;

    // INSTANCE_SWAP requires preferredValues to be useful (otherwise the picker is empty)
    if (propertyType === 'INSTANCE_SWAP' && !params.preferredValues) {
      throw new HandlerError(
        `INSTANCE_SWAP property "${propertyName}" requires preferredValues. ` +
          `Pass an array like: preferredValues:[{type:"COMPONENT",key:"<componentKey>"}]. ` +
          `Use search_design_system to find component keys for icons or other swap targets.`,
        'MISSING_PREFERRED_VALUES',
      );
    }

    const options: ComponentPropertyOptions = {};
    if (params.preferredValues) {
      options.preferredValues = params.preferredValues as InstanceSwapPreferredValue[];
    }
    // Reject `description` on any property type — consistent with update_component_property.
    // Figma Plugin API (typings 1.123.0) ComponentPropertyOptions = { preferredValues? }
    // with no description field. The previous SLOT-only cast relied on undocumented
    // runtime behavior that was never verified via read-back test. SLOT descriptions
    // visible in library components are set via Figma UI by library authors, not via
    // this API. If future typings expose description, re-add with a runtime verify step.
    if (params.description != null) {
      throw new HandlerError(
        `Component property descriptions are NOT settable via the Figma Plugin API. ` +
          `addComponentProperty options type is { preferredValues? } — no description field, ` +
          `for any property type including SLOT. ` +
          `Workaround: ask the user to set the description manually in Figma's UI ` +
          `(right-click the property → Edit). Do NOT retry via execute_js — it uses the same API.`,
        'UNSUPPORTED_BY_FIGMA_API',
      );
    }

    try {
      const key = comp.addComponentProperty(
        propertyName,
        propertyType as ComponentPropertyType,
        defaultValue,
        Object.keys(options).length > 0 ? options : undefined,
      );
      return { ok: true, key, properties: Object.keys(comp.componentPropertyDefinitions) };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Surface Figma's plugin-API errors with our suggestion attached
      throw new HandlerError(
        `addComponentProperty failed for "${propertyName}" (${propertyType}): ${msg}. ` +
          `Common causes: defaultValue type mismatch (BOOLEAN needs true/false, TEXT needs string), ` +
          `or property name conflict with existing: [${Object.keys(comp.componentPropertyDefinitions).join(', ')}].`,
        'ADD_PROPERTY_FAILED',
      );
    }
  });

  registerHandler('update_component_property', async (params) => {
    const nodeId = params.nodeId as string;
    const propertyName = params.propertyName as string;

    const node = await findNodeByIdAsync(nodeId);
    assertHandler(
      node && (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET'),
      `Component not found: ${nodeId}`,
      'NOT_FOUND',
    );
    const comp = node as ComponentNode | ComponentSetNode;

    if (!(propertyName in comp.componentPropertyDefinitions)) {
      const available = Object.keys(comp.componentPropertyDefinitions);
      // Strip Figma's #id:id suffix when suggesting (since users typically write
      // the bare name and bind_component_property already accepts that form).
      const bareNames = available.map((k) => {
        const hash = k.indexOf('#');
        return hash >= 0 ? k.slice(0, hash) : k;
      });
      throw new HandlerError(
        `Property "${propertyName}" not found on component "${comp.name}". ` +
          `Available properties: [${bareNames.join(', ')}]. ` +
          `Tip: pass the bare name without the "#id" suffix.`,
        'PROPERTY_NOT_FOUND',
      );
    }

    // ── Figma Plugin API capability guards (typings 1.123.0) ──
    // editComponentProperty's newValue signature is strictly { name?, defaultValue?,
    // preferredValues? } — passing `description` was a ghost write that returned
    // ok:true but changed nothing. Throw loudly instead of looping the agent.
    if (params.description != null) {
      throw new HandlerError(
        `Component property descriptions are NOT settable via the Figma Plugin API. ` +
          `editComponentProperty accepts only { name, defaultValue, preferredValues } — ` +
          `there is no description field on any property type. ` +
          `Workaround: ask the user to edit the property description manually in Figma's UI ` +
          `(right-click the property → Edit). Do NOT retry via execute_js — it uses the same API.`,
        'UNSUPPORTED_BY_FIGMA_API',
      );
    }
    // VARIANT defaults are derived from the top-left variant's spatial position,
    // not from editComponentProperty. Silently accepting defaultValue here was a
    // second phantom write — surface it with actionable guidance.
    if (params.defaultValue != null) {
      const propDef = comp.componentPropertyDefinitions[propertyName];
      if (propDef?.type === 'VARIANT') {
        throw new HandlerError(
          `defaultValue is not supported for VARIANT properties. ` +
            `VARIANT defaults are determined by the top-left variant's spatial position in the component set — ` +
            `reorder variants via nodes(method:"update") or layout_component_set to change which variant is the default. ` +
            `Property "${propertyName}" is a VARIANT.`,
          'UNSUPPORTED_FOR_VARIANT',
        );
      }
    }

    // Build a single edit payload — Figma's editComponentProperty accepts partial fields
    const edits: Record<string, unknown> = {};
    if (params.newName != null) edits.name = params.newName as string;
    if (params.defaultValue != null) edits.defaultValue = params.defaultValue as string | boolean;
    if (params.preferredValues != null) edits.preferredValues = params.preferredValues as InstanceSwapPreferredValue[];

    // Apply name first (changes the key), then remaining fields on the new key
    let currentName = propertyName;
    if (edits.name) {
      currentName = comp.editComponentProperty(propertyName, { name: edits.name as string });
      delete edits.name;
    }
    if (Object.keys(edits).length > 0) {
      comp.editComponentProperty(
        currentName,
        edits as {
          defaultValue?: string | boolean;
          preferredValues?: InstanceSwapPreferredValue[];
        },
      );
    }

    return { ok: true, properties: Object.keys(comp.componentPropertyDefinitions) };
  });

  registerHandler('delete_component_property', async (params) => {
    const nodeId = params.nodeId as string;
    const propertyName = params.propertyName as string;

    const node = await findNodeByIdAsync(nodeId);
    assertHandler(
      node && (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET'),
      `Component not found: ${nodeId}`,
      'NOT_FOUND',
    );
    const comp = node as ComponentNode | ComponentSetNode;

    if (!(propertyName in comp.componentPropertyDefinitions)) {
      const available = Object.keys(comp.componentPropertyDefinitions);
      const bareNames = available.map((k) => {
        const hash = k.indexOf('#');
        return hash >= 0 ? k.slice(0, hash) : k;
      });
      throw new HandlerError(
        `Property "${propertyName}" not found on component "${comp.name}". ` + `Available: [${bareNames.join(', ')}].`,
        'PROPERTY_NOT_FOUND',
      );
    }

    comp.deleteComponentProperty(propertyName);
    return { ok: true, properties: Object.keys(comp.componentPropertyDefinitions) };
  });
}
