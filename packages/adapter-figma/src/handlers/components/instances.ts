/**
 * Instance handlers — swap, detach, reset overrides, get/set overrides.
 *
 * Note: `create_instance` lives in `write-nodes-instance.ts` (shared
 * importAndResolveComponent + _actualVariant feedback); it is intentionally
 * NOT registered here.
 */

import { simplifyNode } from '../../adapters/node-simplifier.js';
import { registerHandler } from '../../registry.js';
import { assertNodeType, HandlerError } from '../../utils/handler-error.js';
import { findNodeByIdAsync } from '../../utils/node-lookup.js';

export function registerComponentInstanceHandlers(): void {
  registerHandler('swap_instance', async (params) => {
    const instanceId = params.instanceId as string;
    const newComponentKey = params.componentKey as string;

    const node = await findNodeByIdAsync(instanceId);
    assertNodeType(
      node,
      'INSTANCE',
      `instanceId="${instanceId}"`,
      'Only INSTANCE nodes can be swapped. To create one, use create_instance with a componentId or componentKey.',
    );

    const newComponent = await figma.importComponentByKeyAsync(newComponentKey);
    (node as InstanceNode).swapComponent(newComponent);

    return simplifyNode(node as InstanceNode);
  });

  registerHandler('detach_instance', async (params) => {
    const instanceId = params.instanceId as string;
    const node = await findNodeByIdAsync(instanceId);
    assertNodeType(
      node,
      'INSTANCE',
      `instanceId="${instanceId}"`,
      'Only INSTANCE nodes can be detached. A FRAME or COMPONENT is already standalone — no detach needed.',
    );
    const frame = (node as InstanceNode).detachInstance();
    return simplifyNode(frame);
  });

  registerHandler('reset_instance_overrides', async (params) => {
    const instanceId = params.instanceId as string;
    const node = await findNodeByIdAsync(instanceId);
    assertNodeType(node, 'INSTANCE', `instanceId="${instanceId}"`, 'Only INSTANCE nodes have overrides to reset.');
    // Plugin API ≥ v120 renamed resetOverrides → removeOverrides. Current typings
    // only expose the new name. The older name is kept as a runtime fallback
    // (via untyped lookup) for hosts that still ship the legacy API.
    const instance = node as InstanceNode;
    const withOverrideMethods = instance as unknown as {
      removeOverrides?: () => void;
      resetOverrides?: () => void;
    };
    if (typeof withOverrideMethods.removeOverrides === 'function') {
      withOverrideMethods.removeOverrides();
    } else if (typeof withOverrideMethods.resetOverrides === 'function') {
      withOverrideMethods.resetOverrides();
    } else {
      throw new HandlerError(
        'Instance override reset is unavailable: neither removeOverrides nor resetOverrides exists on this instance. ' +
          'Upgrade Figma to a Plugin API version ≥ 120.',
        'API_UNAVAILABLE',
      );
    }
    return { ok: true };
  });

  registerHandler('get_instance_overrides', async (params) => {
    const node = await findNodeByIdAsync(params.nodeId as string);
    assertNodeType(
      node,
      'INSTANCE',
      `nodeId="${params.nodeId}"`,
      'Only INSTANCE nodes have overrides. For a COMPONENT, use components(method:"get") + list_component_properties.',
    );
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
    assertNodeType(
      source,
      'INSTANCE',
      `sourceId="${params.sourceId}"`,
      'set_instance_overrides copies properties from a source INSTANCE to other instances. The source must be an INSTANCE node.',
    );
    const sourceProps = (source as InstanceNode).componentProperties;
    const propValues = Object.fromEntries(Object.entries(sourceProps).map(([k, v]) => [k, v.value]));

    const targetIds = params.targetIds as string[];
    const results = await Promise.allSettled(
      targetIds.map(async (id) => {
        const target = await findNodeByIdAsync(id);
        assertNodeType(
          target,
          'INSTANCE',
          `targetIds entry "${id}"`,
          'Each target must be an INSTANCE node — overrides cannot be applied to FRAMEs or COMPONENTs.',
        );
        (target as InstanceNode).setProperties(propValues as Record<string, string | boolean>);
        return { nodeId: id, ok: true };
      }),
    );
    return {
      succeeded: results.filter((r) => r.status === 'fulfilled').length,
      failed: results.filter((r) => r.status === 'rejected').length,
    };
  });
}
