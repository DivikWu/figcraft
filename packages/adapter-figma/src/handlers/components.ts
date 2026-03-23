/**
 * Component & Instance handlers — CRUD for components and instances.
 */

import { registerHandler } from '../registry.js';
import { simplifyNode } from '../adapters/node-simplifier.js';
import { findNodeByIdAsync } from '../utils/node-lookup.js';

export function registerComponentHandlers(): void {

registerHandler('list_components', async () => {
  const components: unknown[] = [];

  function walk(node: SceneNode) {
    if (node.type === 'COMPONENT') {
      components.push({
        id: node.id,
        name: node.name,
        description: (node as ComponentNode).description,
        key: (node as ComponentNode).key,
      });
    }
    if ('children' in node) {
      for (const child of (node as ChildrenMixin).children) {
        walk(child);
      }
    }
  }

  for (const child of figma.currentPage.children) {
    walk(child);
  }

  return { count: components.length, components };
});

registerHandler('get_component', async (params) => {
  const nodeId = params.nodeId as string;
  const node = await findNodeByIdAsync(nodeId);
  if (!node || node.type !== 'COMPONENT') {
    return { error: `Component not found: ${nodeId}` };
  }
  const comp = node as ComponentNode;
  return {
    ...simplifyNode(comp),
    description: comp.description,
    key: comp.key,
    componentPropertyDefinitions: comp.componentPropertyDefinitions,
  };
});

registerHandler('create_component', async (params) => {
  const name = (params.name as string) ?? 'Component';
  const width = (params.width as number) ?? 100;
  const height = (params.height as number) ?? 100;

  const component = figma.createComponent();
  component.name = name;
  component.resize(width, height);
  if (params.description) {
    component.description = params.description as string;
  }

  return simplifyNode(component);
});

registerHandler('create_instance', async (params) => {
  const componentId = params.componentId as string;
  const componentKey = params.componentKey as string | undefined;

  let component: ComponentNode | null = null;

  if (componentKey) {
    // Import from library by key
    const imported = await figma.importComponentByKeyAsync(componentKey);
    component = imported;
  } else {
    const node = await findNodeByIdAsync(componentId);
    if (node && node.type === 'COMPONENT') {
      component = node as ComponentNode;
    }
  }

  if (!component) {
    return { error: 'Component not found' };
  }

  const instance = component.createInstance();

  // Set variant properties if provided
  if (params.properties && typeof params.properties === 'object') {
    for (const [key, value] of Object.entries(params.properties as Record<string, string>)) {
      try {
        instance.setProperties({ [key]: value });
      } catch {
        // Property may not exist — skip silently
      }
    }
  }

  if (params.parentId) {
    const parent = await findNodeByIdAsync(params.parentId as string);
    if (parent && 'appendChild' in parent) {
      (parent as FrameNode).appendChild(instance);
    }
  }

  return simplifyNode(instance);
});

registerHandler('swap_instance', async (params) => {
  const instanceId = params.instanceId as string;
  const newComponentKey = params.componentKey as string;

  const node = await findNodeByIdAsync(instanceId);
  if (!node || node.type !== 'INSTANCE') {
    return { error: `Instance not found: ${instanceId}` };
  }

  const newComponent = await figma.importComponentByKeyAsync(newComponentKey);
  (node as InstanceNode).swapComponent(newComponent);

  return simplifyNode(node as InstanceNode);
});

registerHandler('detach_instance', async (params) => {
  const instanceId = params.instanceId as string;
  const node = await findNodeByIdAsync(instanceId);
  if (!node || node.type !== 'INSTANCE') {
    return { error: `Instance not found: ${instanceId}` };
  }
  const frame = (node as InstanceNode).detachInstance();
  return simplifyNode(frame);
});

registerHandler('reset_instance_overrides', async (params) => {
  const instanceId = params.instanceId as string;
  const node = await findNodeByIdAsync(instanceId);
  if (!node || node.type !== 'INSTANCE') {
    return { error: `Instance not found: ${instanceId}` };
  }
  (node as InstanceNode).resetOverrides();
  return { ok: true };
});

registerHandler('update_component', async (params) => {
  const node = await findNodeByIdAsync(params.nodeId as string);
  if (!node || node.type !== 'COMPONENT') throw new Error(`Component not found: ${params.nodeId}`);
  const comp = node as ComponentNode;
  if (params.name != null) comp.name = params.name as string;
  if (params.description != null) comp.description = params.description as string;
  if (params.width != null || params.height != null) {
    comp.resize(
      (params.width as number) ?? comp.width,
      (params.height as number) ?? comp.height,
    );
  }
  return simplifyNode(comp);
});

registerHandler('delete_component', async (params) => {
  const node = await findNodeByIdAsync(params.nodeId as string);
  if (!node || node.type !== 'COMPONENT') throw new Error(`Component not found: ${params.nodeId}`);
  node.remove();
  return { ok: true };
});

registerHandler('list_component_properties', async (params) => {
  const node = await findNodeByIdAsync(params.nodeId as string);
  if (!node || (node.type !== 'COMPONENT' && node.type !== 'COMPONENT_SET'))
    throw new Error(`Component not found: ${params.nodeId}`);
  const comp = node as ComponentNode | ComponentSetNode;
  return {
    properties: Object.entries(comp.componentPropertyDefinitions).map(([key, def]) => ({
      key,
      type: def.type,
      defaultValue: def.defaultValue,
      variantOptions: 'variantOptions' in def ? (def as ComponentPropertyDefinitions[string] & { variantOptions?: string[] }).variantOptions : undefined,
    })),
  };
});

registerHandler('create_component_set', async (params) => {
  const ids = params.componentIds as string[];
  const nodes = await Promise.all(ids.map((id) => findNodeByIdAsync(id)));
  const components = nodes.filter((n): n is ComponentNode => n?.type === 'COMPONENT');
  if (components.length === 0) throw new Error('No valid components found');
  const set = figma.combineAsVariants(components, figma.currentPage);
  if (params.name != null) set.name = params.name as string;
  return simplifyNode(set);
});

registerHandler('get_instance_overrides', async (params) => {
  const node = await findNodeByIdAsync(params.nodeId as string);
  if (!node || node.type !== 'INSTANCE') throw new Error(`Instance not found: ${params.nodeId}`);
  const instance = node as InstanceNode;
  const props = instance.componentProperties;
  return {
    nodeId: instance.id,
    nodeName: instance.name,
    properties: Object.entries(props).map(([key, val]) => ({
      key,
      type: val.type,
      value: val.value,
    })),
  };
});

registerHandler('set_instance_overrides', async (params) => {
  const source = await findNodeByIdAsync(params.sourceId as string);
  if (!source || source.type !== 'INSTANCE') throw new Error(`Source instance not found: ${params.sourceId}`);
  const sourceProps = (source as InstanceNode).componentProperties;
  const propValues = Object.fromEntries(Object.entries(sourceProps).map(([k, v]) => [k, v.value]));

  const targetIds = params.targetIds as string[];
  const results = await Promise.allSettled(
    targetIds.map(async (id) => {
      const target = await findNodeByIdAsync(id);
      if (!target || target.type !== 'INSTANCE') throw new Error(`Instance ${id} not found`);
      (target as InstanceNode).setProperties(propValues as Record<string, string | boolean>);
      return { nodeId: id, ok: true };
    }),
  );
  return {
    succeeded: results.filter((r) => r.status === 'fulfilled').length,
    failed: results.filter((r) => r.status === 'rejected').length,
  };
});

// ─── Component Property Management ───

// ─── Component Audit ───

registerHandler('audit_components', async (params) => {
  const nodeIds = params.nodeIds as string[] | undefined;

  let targets: SceneNode[];
  if (nodeIds && nodeIds.length > 0) {
    const resolved = await Promise.all(nodeIds.map((id) => findNodeByIdAsync(id)));
    targets = resolved.filter((n): n is SceneNode => n !== null && 'type' in n);
  } else {
    targets = [...figma.currentPage.children];
  }

  const components: Array<Record<string, unknown>> = [];
  const issues: Array<{ nodeId: string; name: string; issue: string }> = [];

  function walk(node: SceneNode) {
    if (node.type === 'COMPONENT') {
      const comp = node as ComponentNode;
      const propDefs = comp.componentPropertyDefinitions;
      const propCount = Object.keys(propDefs).length;
      const childCount = countDescendants(comp);
      const textChildren = countTextNodes(comp);
      const textProps = Object.values(propDefs).filter((d) => d.type === 'TEXT').length;
      const boolProps = Object.values(propDefs).filter((d) => d.type === 'BOOLEAN').length;
      const instanceSwapProps = Object.values(propDefs).filter((d) => d.type === 'INSTANCE_SWAP').length;

      const entry: Record<string, unknown> = {
        id: comp.id,
        name: comp.name,
        key: comp.key,
        description: comp.description || null,
        propertyCount: propCount,
        textProperties: textProps,
        booleanProperties: boolProps,
        instanceSwapProperties: instanceSwapProps,
        childCount,
        textChildCount: textChildren,
        hasAutoLayout: 'layoutMode' in comp && comp.layoutMode !== 'NONE',
        width: comp.width,
        height: comp.height,
      };
      components.push(entry);

      // Issue detection
      if (!comp.description) {
        issues.push({ nodeId: comp.id, name: comp.name, issue: 'Missing description' });
      }
      if (textChildren > 0 && textProps === 0) {
        issues.push({ nodeId: comp.id, name: comp.name, issue: `${textChildren} text node(s) but no TEXT properties exposed` });
      }
      if (propCount === 0 && childCount > 1) {
        issues.push({ nodeId: comp.id, name: comp.name, issue: 'No properties defined despite having children' });
      }
      if (childCount === 0) {
        issues.push({ nodeId: comp.id, name: comp.name, issue: 'Empty component (no children)' });
      }
    }
    if (node.type === 'COMPONENT_SET') {
      const set = node as ComponentSetNode;
      const variants = set.children.filter((c) => c.type === 'COMPONENT');
      components.push({
        id: set.id,
        name: set.name,
        isComponentSet: true,
        variantCount: variants.length,
        propertyCount: Object.keys(set.componentPropertyDefinitions).length,
        description: set.description || null,
      });
      if (!set.description) {
        issues.push({ nodeId: set.id, name: set.name, issue: 'Missing description on component set' });
      }
      if (variants.length === 1) {
        issues.push({ nodeId: set.id, name: set.name, issue: 'Component set with only 1 variant' });
      }
      // Walk variants
      for (const v of variants) walk(v);
      return; // don't walk children again
    }
    if ('children' in node) {
      for (const child of (node as ChildrenMixin).children) walk(child);
    }
  }

  for (const t of targets) walk(t);

  return {
    summary: {
      totalComponents: components.length,
      totalIssues: issues.length,
    },
    components,
    issues,
  };
});

// ─── Component Property Management ───

registerHandler('add_component_property', async (params) => {
  const nodeId = params.nodeId as string;
  const propertyName = params.propertyName as string;
  const propertyType = params.type as 'BOOLEAN' | 'TEXT' | 'INSTANCE_SWAP' | 'VARIANT';
  const defaultValue = params.defaultValue as string | boolean;

  const node = await findNodeByIdAsync(nodeId);
  if (!node || (node.type !== 'COMPONENT' && node.type !== 'COMPONENT_SET')) {
    return { error: `Component not found: ${nodeId}` };
  }
  const comp = node as ComponentNode | ComponentSetNode;

  const options: { type: string; defaultValue: string | boolean; preferredValues?: Array<{ type: string; key: string }> } = {
    type: propertyType,
    defaultValue,
  };
  if (params.preferredValues) {
    options.preferredValues = params.preferredValues as Array<{ type: string; key: string }>;
  }

  comp.addComponentProperty(propertyName, options.type as ComponentPropertyType, options.defaultValue);

  return { ok: true, properties: Object.keys(comp.componentPropertyDefinitions) };
});

registerHandler('update_component_property', async (params) => {
  const nodeId = params.nodeId as string;
  const propertyName = params.propertyName as string;

  const node = await findNodeByIdAsync(nodeId);
  if (!node || (node.type !== 'COMPONENT' && node.type !== 'COMPONENT_SET')) {
    return { error: `Component not found: ${nodeId}` };
  }
  const comp = node as ComponentNode | ComponentSetNode;

  if (!(propertyName in comp.componentPropertyDefinitions)) {
    return { error: `Property "${propertyName}" not found on component` };
  }

  if (params.newName != null) {
    comp.editComponentProperty(propertyName, { name: params.newName as string });
  }
  if (params.defaultValue != null) {
    const targetName = (params.newName as string) ?? propertyName;
    comp.editComponentProperty(targetName, { defaultValue: params.defaultValue as string | boolean });
  }

  return { ok: true, properties: Object.keys(comp.componentPropertyDefinitions) };
});

registerHandler('delete_component_property', async (params) => {
  const nodeId = params.nodeId as string;
  const propertyName = params.propertyName as string;

  const node = await findNodeByIdAsync(nodeId);
  if (!node || (node.type !== 'COMPONENT' && node.type !== 'COMPONENT_SET')) {
    return { error: `Component not found: ${nodeId}` };
  }
  const comp = node as ComponentNode | ComponentSetNode;

  if (!(propertyName in comp.componentPropertyDefinitions)) {
    return { error: `Property "${propertyName}" not found on component` };
  }

  comp.deleteComponentProperty(propertyName);
  return { ok: true, properties: Object.keys(comp.componentPropertyDefinitions) };
});

} // registerComponentHandlers

// ─── Helpers ───

function countDescendants(node: SceneNode): number {
  let count = 0;
  if ('children' in node) {
    for (const child of (node as ChildrenMixin).children) {
      count++;
      count += countDescendants(child);
    }
  }
  return count;
}

function countTextNodes(node: SceneNode): number {
  let count = 0;
  if (node.type === 'TEXT') return 1;
  if ('children' in node) {
    for (const child of (node as ChildrenMixin).children) {
      count += countTextNodes(child);
    }
  }
  return count;
}
