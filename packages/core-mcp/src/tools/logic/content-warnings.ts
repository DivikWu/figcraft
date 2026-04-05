/**
 * Content warnings — inspects create_frame params for placeholder text
 * and injects warnings into the Plugin response.
 *
 * Called by bridge after successful create_frame responses.
 * Follows the same recursive pattern as design-decisions.ts.
 */

const PLACEHOLDER_PATTERNS = [/lorem\s+ipsum/i, /dolor\s+sit\s+amet/i, /consectetur\s+adipiscing/i];

/** Exact-match placeholder labels (case-insensitive). */
const PLACEHOLDER_LABELS = new Set([
  'button',
  'title',
  'subtitle',
  'heading',
  'subheading',
  'label',
  'text',
  'description',
  'placeholder',
  'text goes here',
  'click here',
  'learn more',
  'read more',
  'submit',
  'enter text',
  'type here',
  'your text here',
  'sample text',
]);

interface ContentWarning {
  type: 'placeholder-text';
  path: string;
  content: string;
  message: string;
}

/** Inspect create_frame params for placeholder content. Returns warnings to inject. */
export function detectContentWarnings(params: Record<string, unknown>): ContentWarning[] {
  const warnings: ContentWarning[] = [];
  collectWarnings(params, '', warnings);
  return warnings;
}

function collectWarnings(node: Record<string, unknown>, path: string, out: ContentWarning[]): void {
  const name = typeof node.name === 'string' ? node.name : undefined;
  const nodePath = path ? `${path} > ${name ?? '?'}` : (name ?? 'root');

  // Check text content (for text-type children or content param)
  const content =
    (typeof node.content === 'string' ? node.content : undefined) ??
    (typeof node.text === 'string' ? node.text : undefined);

  if (content) {
    const trimmed = content.trim();

    // Check lorem ipsum patterns
    for (const pattern of PLACEHOLDER_PATTERNS) {
      if (pattern.test(trimmed)) {
        out.push({
          type: 'placeholder-text',
          path: nodePath,
          content: trimmed.length > 40 ? trimmed.slice(0, 40) + '…' : trimmed,
          message: `"${nodePath}" contains Lorem ipsum placeholder — use realistic, contextually appropriate text`,
        });
        break;
      }
    }

    // Check generic placeholder labels
    if (PLACEHOLDER_LABELS.has(trimmed.toLowerCase())) {
      out.push({
        type: 'placeholder-text',
        path: nodePath,
        content: trimmed,
        message: `"${nodePath}" uses generic label "${trimmed}" — replace with real content`,
      });
    }
  }

  // Recurse into children
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      if (child && typeof child === 'object') {
        collectWarnings(child as Record<string, unknown>, nodePath, out);
      }
    }
  }

  // Recurse into batch items
  if (Array.isArray(node.items)) {
    for (const item of node.items) {
      if (item && typeof item === 'object') {
        collectWarnings(item as Record<string, unknown>, '', out);
      }
    }
  }
}
