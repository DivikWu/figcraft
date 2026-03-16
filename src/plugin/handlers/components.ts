/**
 * Component & Instance handlers — CRUD for components and instances.
 */

import { registerHandler } from '../registry.js';
import { simplifyNode } from '../adapters/node-simplifier.js';

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
  const node = await figma.getNodeByIdAsync(nodeId);
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
    const node = await figma.getNodeByIdAsync(componentId);
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
    const parent = await figma.getNodeByIdAsync(params.parentId as string);
    if (parent && 'appendChild' in parent) {
      (parent as FrameNode).appendChild(instance);
    }
  }

  return simplifyNode(instance);
});

registerHandler('swap_instance', async (params) => {
  const instanceId = params.instanceId as string;
  const newComponentKey = params.componentKey as string;

  const node = await figma.getNodeByIdAsync(instanceId);
  if (!node || node.type !== 'INSTANCE') {
    return { error: `Instance not found: ${instanceId}` };
  }

  const newComponent = await figma.importComponentByKeyAsync(newComponentKey);
  (node as InstanceNode).swapComponent(newComponent);

  return simplifyNode(node as InstanceNode);
});

registerHandler('detach_instance', async (params) => {
  const instanceId = params.instanceId as string;
  const node = await figma.getNodeByIdAsync(instanceId);
  if (!node || node.type !== 'INSTANCE') {
    return { error: `Instance not found: ${instanceId}` };
  }
  const frame = (node as InstanceNode).detachInstance();
  return simplifyNode(frame);
});

registerHandler('reset_instance_overrides', async (params) => {
  const instanceId = params.instanceId as string;
  const node = await figma.getNodeByIdAsync(instanceId);
  if (!node || node.type !== 'INSTANCE') {
    return { error: `Instance not found: ${instanceId}` };
  }
  (node as InstanceNode).resetOverrides();
  return { ok: true };
});

} // registerComponentHandlers
