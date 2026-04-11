/**
 * Code Connect metadata extraction (P1-5).
 *
 * Returns structured metadata about a Figma component for Code Connect
 * workflows — but DOES NOT generate template files.
 *
 * Why metadata-only (design rationale):
 *   - Figma's official `figma connect create` CLI already generates boilerplate
 *     from Figma metadata and hits the REST API directly (no Desktop required).
 *     It supports React, React Native, HTML, Web Components, SwiftUI, and Compose,
 *     and is the de-facto standard for Code Connect file generation.
 *   - Per plan §11 fallback conditions 2 ("ecosystem de-facto standard") and 4
 *     ("maintenance cost > 10× self-built value"), figcraft does NOT reimplement
 *     template generation.
 *
 * What figcraft adds on top of the official CLI:
 *   1. **In-session data source** — after an agent modifies a component via
 *      figcraft tools (add_component_property, bind_component_property, etc.),
 *      this handler returns the up-to-date metadata in the same MCP session,
 *      without shelling out to `figma connect create` and losing context.
 *   2. **LLM-friendly JSON shape** — properties are pre-resolved with bare
 *      names (stripped of Figma's `#id:id` suffix) and variant option lists,
 *      ready for an LLM to read project source files (Button.tsx / button.swift)
 *      and align the Figma property names to the project's actual API.
 *   3. **Structural authoring advantage** — figcraft holds the full property
 *      definition the moment the component is built, including INSTANCE_SWAP
 *      preferredValues and SLOT descriptions.
 *
 * For the actual template file, users run `figma connect create "<url>"` OR
 * feed this metadata to an LLM that reads their project code for alignment.
 */

import { registerHandler } from '../registry.js';
import { assertNodeType } from '../utils/handler-error.js';
import { findNodeByIdAsync } from '../utils/node-lookup.js';

interface PropertyMetadata {
  /** Bare property name, with Figma's `#id:id` suffix stripped. Use this in Code Connect files. */
  bareName: string;
  /** Full Figma property key (with suffix) — needed when calling figma API directly. */
  figmaKey: string;
  type: 'BOOLEAN' | 'TEXT' | 'INSTANCE_SWAP' | 'VARIANT' | 'SLOT' | string;
  defaultValue: unknown;
  /** For VARIANT properties: the list of possible variant option strings. */
  variantOptions?: string[];
  /** For INSTANCE_SWAP properties: configured preferred swap targets. */
  preferredValues?: unknown;
}

function extractProperties(comp: ComponentNode | ComponentSetNode): PropertyMetadata[] {
  const defs = comp.componentPropertyDefinitions;
  const out: PropertyMetadata[] = [];
  for (const [figmaKey, def] of Object.entries(defs)) {
    const hashIdx = figmaKey.indexOf('#');
    const bareName = hashIdx >= 0 ? figmaKey.slice(0, hashIdx) : figmaKey;
    const withOptions = def as ComponentPropertyDefinitions[string] & {
      variantOptions?: string[];
      preferredValues?: unknown;
    };
    out.push({
      bareName,
      figmaKey,
      type: def.type,
      defaultValue: def.defaultValue,
      variantOptions: withOptions.variantOptions ? [...withOptions.variantOptions] : undefined,
      preferredValues: withOptions.preferredValues,
    });
  }
  return out;
}

/**
 * Collect top-level text/instance child slot info so downstream LLM templates
 * can wire `figma.children()` or content slots accurately.
 */
function collectSlots(comp: ComponentNode): {
  textSlots: Array<{ name: string; characters: string }>;
  instanceSlots: Array<{ name: string; mainComponentName?: string }>;
} {
  const textSlots: Array<{ name: string; characters: string }> = [];
  const instanceSlots: Array<{ name: string; mainComponentName?: string }> = [];
  const walk = (n: SceneNode) => {
    if (n.type === 'TEXT') {
      textSlots.push({ name: n.name, characters: (n as TextNode).characters });
    } else if (n.type === 'INSTANCE') {
      const inst = n as InstanceNode;
      const main = inst.mainComponent;
      instanceSlots.push({ name: n.name, mainComponentName: main?.name });
    }
    if ('children' in n) {
      for (const c of (n as ChildrenMixin).children) walk(c as SceneNode);
    }
  };
  walk(comp);
  return { textSlots, instanceSlots };
}

export function registerCodeConnectHandlers(): void {
  registerHandler('get_code_connect_metadata', async (params) => {
    const nodeId = params.nodeId as string;
    const fileKey = params.fileKey as string | undefined;

    const node = await findNodeByIdAsync(nodeId);
    assertNodeType(
      node,
      ['COMPONENT', 'COMPONENT_SET'],
      `nodeId="${nodeId}"`,
      'Code Connect metadata is only meaningful for COMPONENT or COMPONENT_SET nodes. Use list_local_components to find the right id.',
    );
    const comp = node as ComponentNode | ComponentSetNode;

    const properties = extractProperties(comp);

    // For COMPONENT_SET, walk the default variant for slot collection.
    // For standalone COMPONENT, walk it directly.
    const slotSource: ComponentNode =
      comp.type === 'COMPONENT_SET'
        ? ((comp.defaultVariant ?? (comp.children[0] as ComponentNode)) as ComponentNode)
        : comp;
    const { textSlots, instanceSlots } = collectSlots(slotSource);

    // Emit the Figma URL. If the caller didn't pass a fileKey, use a placeholder
    // so the consumer knows to substitute it from their CI env or figma.config.json.
    const safeFile = fileKey ?? '<FILE_KEY>';
    const safeNode = comp.id.replace(':', '-');
    const safeName = comp.name.replace(/[^a-zA-Z0-9-]+/g, '-');
    const figmaUrl = `https://figma.com/design/${safeFile}/${safeName}?node-id=${safeNode}`;

    return {
      componentName: comp.name,
      nodeId: comp.id,
      isComponentSet: comp.type === 'COMPONENT_SET',
      remote:
        'remote' in comp ? Boolean((comp as (ComponentNode | ComponentSetNode) & { remote?: boolean }).remote) : false,
      description: comp.description || undefined,
      figmaUrl,
      properties,
      slots: {
        textSlots,
        instanceSlots,
      },
      summary: {
        propertyCount: properties.length,
        textProperties: properties.filter((p) => p.type === 'TEXT').length,
        booleanProperties: properties.filter((p) => p.type === 'BOOLEAN').length,
        instanceSwapProperties: properties.filter((p) => p.type === 'INSTANCE_SWAP').length,
        variantProperties: properties.filter((p) => p.type === 'VARIANT').length,
        slotProperties: properties.filter((p) => p.type === 'SLOT').length,
        textSlotCount: textSlots.length,
        instanceSlotCount: instanceSlots.length,
      },
      _workflow: {
        official:
          'For template file generation, run: `npx figma connect create "<figmaUrl>" --token <FIGMA_TOKEN>`. ' +
          'This is the de-facto standard (supports React/React Native/HTML/Web Components/SwiftUI/Compose) and ' +
          'writes the .figma.{tsx,ts,swift,kt} file directly into your repo.',
        llmAligned:
          'For higher-quality templates that match your project code style, feed this metadata to an LLM and ' +
          'have it read your project source (e.g. Glob for Button.tsx, Read it, then align the Figma property ' +
          'names to your actual component API: prop names, variant enum values, import paths, JSX structure).',
        agentUseCase:
          'Call this tool whenever an agent has just modified the component via figcraft tools and needs the ' +
          'up-to-date metadata without switching to a shell. The returned JSON is ready for immediate consumption.',
      },
      _note:
        'figcraft does NOT generate template files — `figma connect create` already does that and is the ' +
        'ecosystem standard. This handler returns ONLY the structured metadata.',
    };
  });
}
