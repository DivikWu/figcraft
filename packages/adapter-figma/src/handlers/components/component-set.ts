/**
 * create_component_set handler — combines existing components into a variant set.
 *
 * Includes the variant matrix guardrail (P0-4, runtime enforcement of the 30-variant
 * cap — overridable via `variantLimit` param), section-parent auto-placement, and
 * automatic layout invocation after combineAsVariants.
 */

import { simplifyNode } from '../../adapters/node-simplifier.js';
import { PAGE_GAP, SECTION_GAP, SECTION_PADDING } from '../../constants.js';
import { handlers, registerHandler } from '../../registry.js';
import { assertHandler, HandlerError } from '../../utils/handler-error.js';
import { findNodeByIdAsync } from '../../utils/node-lookup.js';

export function registerComponentSetHandlers(): void {
  registerHandler('create_component_set', async (params) => {
    const ids = params.componentIds as string[];
    const nodes = await Promise.all(ids.map((id) => findNodeByIdAsync(id)));
    const components = nodes.filter((n): n is ComponentNode => n?.type === 'COMPONENT');
    assertHandler(components.length > 0, 'No valid components found');

    // ── Variant matrix guardrail (P0-4) ──
    // Enforce a soft variant cap from figcraft-generate-library SKILL at the code level.
    // SKILL rules as warnings are weaker than runtime enforcement — see memory
    // feedback_ai_guidance_layers (Layer 1 > Layer 5). Default is 30, but real
    // production libraries sometimes legitimately exceed this (e.g. 4 size × 3
    // style × 4 state = 48 for a core button), so the limit is overridable via
    // `variantLimit` param. Pass 0 to disable entirely.
    const VARIANT_LIMIT = typeof params.variantLimit === 'number' ? (params.variantLimit as number) : 30;
    if (VARIANT_LIMIT > 0 && components.length > VARIANT_LIMIT) {
      // Parse variant names like "Size=Small, Style=Primary, State=Default"
      // to show which axes are blowing up the matrix.
      const axisValues = new Map<string, Set<string>>();
      for (const c of components) {
        for (const pair of c.name.split(',')) {
          const eq = pair.indexOf('=');
          if (eq < 0) continue;
          const key = pair.slice(0, eq).trim();
          const val = pair.slice(eq + 1).trim();
          if (!key || !val) continue;
          if (!axisValues.has(key)) axisValues.set(key, new Set());
          axisValues.get(key)!.add(val);
        }
      }
      const axes = Array.from(axisValues.entries())
        .map(([name, values]) => ({ name, count: values.size }))
        .sort((a, b) => b.count - a.count);
      const axesSummary =
        axes.length > 0 ? axes.map((a) => `${a.name}(${a.count})`).join(' × ') : 'unparseable variant names';
      const biggestAxis = axes[0]?.name;

      throw new HandlerError(
        `Variant matrix too large: ${components.length} variants exceeds cap of ${VARIANT_LIMIT}. ` +
          `Axes: ${axesSummary}. ` +
          `Fix: extract a high-cardinality axis into a component property instead of a variant. ` +
          (biggestAxis
            ? `Suggestion — the "${biggestAxis}" axis has the most values; if it's an icon or nested content, ` +
              `replace it with add_component_property(type:"INSTANCE_SWAP") or type:"SLOT" and remove those variants.`
            : 'Consider splitting into multiple component sets or using INSTANCE_SWAP for icon variants.'),
        'VARIANT_MATRIX_TOO_LARGE',
      );
    }

    // Detect if components share a common SECTION parent — preserve it as the ComponentSet parent
    const sectionParent =
      components[0]?.parent?.type === 'SECTION' ? (components[0].parent as FrameNode | SectionNode) : null;
    const targetParent = sectionParent ?? figma.currentPage;
    const set = figma.combineAsVariants(components, targetParent);
    if (params.name != null) set.name = params.name as string;

    // ── Auto-layout variants in grid (Layer 1: code enforcement) ──
    const layoutHandler = handlers.get('layout_component_set');
    let layoutApplied = false;
    if (layoutHandler) {
      try {
        await layoutHandler({ nodeId: set.id });
        layoutApplied = true;
      } catch {
        /* layout failure should not block creation */
      }
    }

    // ── Auto-position within parent ──
    if (sectionParent) {
      // combineAsVariants may set absolute page coordinates instead of section-relative.
      // Reset to section origin with shared SECTION_PADDING, then stack below existing
      // siblings with SECTION_GAP. Start maxBottom at SECTION_PADDING so an empty
      // section places the set at (SECTION_PADDING, SECTION_PADDING).
      let maxBottom = SECTION_PADDING;
      for (const child of sectionParent.children) {
        if (child.id === set.id) continue;
        if (!child.visible) continue;
        maxBottom = Math.max(maxBottom, child.y + child.height + SECTION_GAP);
      }
      set.x = SECTION_PADDING;
      set.y = maxBottom;
    } else {
      // Page-level: avoid overlapping existing content
      const siblings = figma.currentPage.children;
      if (siblings.length > 1) {
        let maxBottom = 0;
        for (const child of siblings) {
          if (child.id === set.id) continue;
          if (!child.visible) continue;
          maxBottom = Math.max(maxBottom, child.y + child.height);
        }
        if (maxBottom > 0 && set.y < maxBottom) {
          set.y = maxBottom + PAGE_GAP;
        }
      }
    }

    // ── Auto-resize section to fit content ──
    if (sectionParent) {
      // SECTION_PADDING here is the section's inner margin on the right/bottom
      // edges — semantically "padding", not "gap between siblings".
      let maxRight = 0;
      let maxBottom = 0;
      for (const child of sectionParent.children) {
        maxRight = Math.max(maxRight, child.x + child.width);
        maxBottom = Math.max(maxBottom, child.y + child.height);
      }
      sectionParent.resizeWithoutConstraints(
        Math.max(sectionParent.width, maxRight + SECTION_PADDING),
        Math.max(sectionParent.height, maxBottom + SECTION_PADDING),
      );
    }

    return {
      ...simplifyNode(set),
      _layoutApplied: layoutApplied,
    };
  });
}
