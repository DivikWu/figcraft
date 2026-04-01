/**
 * MCP Resources — expose lint rule knowledge to AI on demand.
 *
 * AI can query design rules by tag (e.g. "button", "screen") or phase
 * (e.g. "layout", "structure") instead of getting all rules in every prompt.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getAvailableRules, DESIGN_CONSTANTS } from '@figcraft/quality-engine';

/** Format rules as concise Markdown for AI consumption. */
function formatRulesMarkdown(
  filter?: { tags?: string[]; phases?: string[] },
): string {
  const rules = getAvailableRules().filter((r) => {
    if (!r.ai) return false;
    if (filter?.tags?.length && r.ai.tags) {
      if (!r.ai.tags.some((t) => filter.tags!.includes(t))) return false;
    }
    if (filter?.phases?.length && r.ai.phase) {
      if (!r.ai.phase.some((p) => filter.phases!.includes(p))) return false;
    }
    return true;
  });

  if (rules.length === 0) return 'No matching design rules found.';

  const lines = rules.map((r) => {
    const fix = r.autoFixable ? ' (auto-fixable)' : '';
    return `- **${r.name}** [${r.severity}]${fix}: ${r.ai!.preventionHint}`;
  });

  return `# Design Rules\n\n${lines.join('\n')}`;
}

function textResource(uri: string, text: string) {
  return { contents: [{ uri, text }] };
}

export function registerDesignRulesResources(server: McpServer): void {
  // Full reference: all rules with AI metadata
  server.resource(
    'design-rules-all',
    'design-rules://all',
    { description: 'All design rules with prevention hints', mimeType: 'text/markdown' },
    (uri) => textResource(uri.href, formatRulesMarkdown()),
  );

  // By phase
  for (const phase of ['layout', 'structure', 'content', 'styling', 'accessibility'] as const) {
    server.resource(
      `design-rules-phase-${phase}`,
      `design-rules://phase/${phase}`,
      { description: `Design rules for ${phase} phase`, mimeType: 'text/markdown' },
      (uri) => textResource(uri.href, formatRulesMarkdown({ phases: [phase] })),
    );
  }

  // By element tag
  for (const tag of ['button', 'input', 'screen', 'text'] as const) {
    server.resource(
      `design-rules-tag-${tag}`,
      `design-rules://tag/${tag}`,
      { description: `Design rules for ${tag} elements`, mimeType: 'text/markdown' },
      (uri) => textResource(uri.href, formatRulesMarkdown({ tags: [tag] })),
    );
  }

  // Design constants reference
  server.resource(
    'design-rules-constants',
    'design-rules://constants',
    { description: 'Design system constants (thresholds, dimensions)', mimeType: 'application/json' },
    (uri) => textResource(uri.href, JSON.stringify(DESIGN_CONSTANTS, null, 2)),
  );
}
