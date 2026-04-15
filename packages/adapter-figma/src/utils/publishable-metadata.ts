/**
 * PublishableMixin metadata writer — shared across create_component,
 * create_component_from_node, and update_component.
 *
 * Figma Plugin API's PublishableMixin (verified against @figma/plugin-typings
 * 1.123.0) exposes four writable fields that describe a component or style:
 *   - description              string (plain-text)
 *   - descriptionMarkdown      string (rich-text markdown)
 *   - documentationLinks       ReadonlyArray<{uri: string}>  (capped at 1 entry)
 *   - (name lives on BaseNodeMixin — handled by each caller separately)
 *
 * Centralizing the write logic here matters most for documentationLinks —
 * Figma currently caps runtime length at 1 despite typing it as an array.
 * When that limit is lifted, the guard here is the single place to update.
 */

// Figma Plugin API types (ComponentNode, ComponentSetNode) are declared as
// globals by @figma/plugin-typings — no explicit import needed.

import { HandlerError } from './handler-error.js';

export interface PublishableMetadataParams {
  description?: unknown;
  descriptionMarkdown?: unknown;
  documentationLinks?: unknown;
}

/**
 * Apply plain description, markdown description, and documentation links
 * to a component or component set. Idempotent — any field that is `null` or
 * `undefined` is skipped; pass `documentationLinks: []` to clear all links.
 *
 * @throws HandlerError DOCUMENTATION_LINKS_LIMIT when documentationLinks has
 *   more than 1 entry. The message names this as a Figma platform restriction
 *   (not a figcraft schema restriction) so agents don't loop retry via other
 *   paths like execute_js.
 */
export function applyPublishableMetadata(
  comp: ComponentNode | ComponentSetNode,
  params: PublishableMetadataParams,
): void {
  if (params.description != null) {
    comp.description = params.description as string;
  }
  if (params.descriptionMarkdown != null) {
    comp.descriptionMarkdown = params.descriptionMarkdown as string;
  }
  if (params.documentationLinks != null) {
    const links = params.documentationLinks as string[];
    if (links.length > 1) {
      throw new HandlerError(
        `documentationLinks accepts at most 1 entry (Figma Plugin API current limit), got ${links.length}. ` +
          `Pick the single most important link; the rest belong in the descriptionMarkdown body as inline links. ` +
          `Pass [] to clear. This is a Figma platform restriction, not a figcraft schema restriction.`,
        'DOCUMENTATION_LINKS_LIMIT',
      );
    }
    comp.documentationLinks = links.map((uri) => ({ uri }));
  }
}

/**
 * Strip PublishableMixin metadata fields from a params object (useful when
 * passing through to create_frame, which doesn't know about these fields).
 * Mutates the passed object in place and returns it.
 */
export function stripPublishableMetadata<T extends PublishableMetadataParams>(params: T): T {
  delete params.description;
  delete params.descriptionMarkdown;
  delete params.documentationLinks;
  return params;
}
