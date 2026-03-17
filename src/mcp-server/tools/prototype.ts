/**
 * Prototype flow analysis tools — analyze reactions data to produce
 * structured flow graphs and interaction documentation.
 *
 * Pure MCP-side analysis: calls get_reactions via bridge, then builds
 * a directed graph of screens/nodes and their navigation relationships.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Bridge } from '../bridge.js';

// ─── Types ───

interface Reaction {
  trigger: { type: string; delay?: number; timeout?: number };
  actions?: Array<{
    type: string;
    destinationId?: string | null;
    navigation?: string;
    transition?: { type: string; duration: number; easing?: unknown } | null;
    overlay?: { position?: string } | null;
  }>;
  // Legacy flat shape (single action)
  action?: {
    type: string;
    destinationId?: string | null;
    navigation?: string;
    transition?: { type: string; duration: number; easing?: unknown } | null;
  };
}

interface ReactionNode {
  nodeId: string;
  nodeName: string;
  reactions: Reaction[];
}

interface FlowEdge {
  from: { nodeId: string; nodeName: string };
  to: { nodeId: string; nodeName: string };
  trigger: string;
  action: string;
  transition?: string;
  delay?: number;
}

interface FlowNode {
  nodeId: string;
  nodeName: string;
  inDegree: number;
  outDegree: number;
  role: 'entry' | 'exit' | 'intermediate' | 'isolated';
}

interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
  entryPoints: string[];
  deadEnds: string[];
  loops: string[][];
  stats: {
    totalScreens: number;
    totalInteractions: number;
    triggerBreakdown: Record<string, number>;
    actionBreakdown: Record<string, number>;
  };
}

// ─── Helpers ───

function normalizeActions(reaction: Reaction): Array<{
  type: string;
  destinationId?: string | null;
  navigation?: string;
  transition?: { type: string; duration: number; easing?: unknown } | null;
}> {
  if (reaction.actions && reaction.actions.length > 0) return reaction.actions;
  if (reaction.action) return [reaction.action];
  return [];
}

function buildFlowGraph(
  reactionNodes: ReactionNode[],
  nodeNameMap: Map<string, string>,
): FlowGraph {
  const edges: FlowEdge[] = [];
  const triggerCounts: Record<string, number> = {};
  const actionCounts: Record<string, number> = {};
  const nodeIds = new Set<string>();
  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();

  for (const rn of reactionNodes) {
    nodeIds.add(rn.nodeId);
    for (const reaction of rn.reactions) {
      const trigger = reaction.trigger?.type ?? 'UNKNOWN';
      triggerCounts[trigger] = (triggerCounts[trigger] ?? 0) + 1;

      for (const act of normalizeActions(reaction)) {
        const actionType = act.type ?? 'UNKNOWN';
        actionCounts[actionType] = (actionCounts[actionType] ?? 0) + 1;

        if (act.destinationId) {
          nodeIds.add(act.destinationId);
          const destName = nodeNameMap.get(act.destinationId) ?? act.destinationId;

          edges.push({
            from: { nodeId: rn.nodeId, nodeName: rn.nodeName },
            to: { nodeId: act.destinationId, nodeName: destName },
            trigger,
            action: actionType,
            transition: act.transition
              ? `${act.transition.type} ${act.transition.duration}ms`
              : undefined,
            delay: reaction.trigger?.delay,
          });

          outDegree.set(rn.nodeId, (outDegree.get(rn.nodeId) ?? 0) + 1);
          inDegree.set(act.destinationId, (inDegree.get(act.destinationId) ?? 0) + 1);
        }
      }
    }
  }

  // Build node list with roles
  const nodes: FlowNode[] = [];
  for (const id of nodeIds) {
    const ind = inDegree.get(id) ?? 0;
    const outd = outDegree.get(id) ?? 0;
    let role: FlowNode['role'] = 'intermediate';
    if (ind === 0 && outd > 0) role = 'entry';
    else if (ind > 0 && outd === 0) role = 'exit';
    else if (ind === 0 && outd === 0) role = 'isolated';

    nodes.push({
      nodeId: id,
      nodeName: nodeNameMap.get(id) ?? id,
      inDegree: ind,
      outDegree: outd,
      role,
    });
  }

  // Detect simple loops via DFS
  const loops = detectLoops(edges);

  const entryPoints = nodes.filter((n) => n.role === 'entry').map((n) => n.nodeId);
  const deadEnds = nodes.filter((n) => n.role === 'exit').map((n) => n.nodeId);

  return {
    nodes,
    edges,
    entryPoints,
    deadEnds,
    loops,
    stats: {
      totalScreens: nodes.length,
      totalInteractions: edges.length,
      triggerBreakdown: triggerCounts,
      actionBreakdown: actionCounts,
    },
  };
}

function detectLoops(edges: FlowEdge[]): string[][] {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.from.nodeId)) adj.set(e.from.nodeId, []);
    adj.get(e.from.nodeId)!.push(e.to.nodeId);
  }

  const loops: string[][] = [];
  const visited = new Set<string>();
  const stack = new Set<string>();
  const path: string[] = [];

  function dfs(node: string): void {
    if (loops.length >= 10) return; // cap
    visited.add(node);
    stack.add(node);
    path.push(node);

    for (const next of adj.get(node) ?? []) {
      if (stack.has(next)) {
        const loopStart = path.indexOf(next);
        if (loopStart >= 0) loops.push(path.slice(loopStart).concat(next));
      } else if (!visited.has(next)) {
        dfs(next);
      }
    }

    path.pop();
    stack.delete(node);
  }

  for (const node of adj.keys()) {
    if (!visited.has(node)) dfs(node);
  }

  return loops;
}

function generateMermaid(graph: FlowGraph, nameMap: Map<string, string>): string {
  const lines: string[] = ['graph TD'];
  const safeId = (id: string) => id.replace(/[^a-zA-Z0-9]/g, '_');

  // Node declarations
  for (const node of graph.nodes) {
    const label = nameMap.get(node.nodeId) ?? node.nodeId;
    const escaped = label.replace(/"/g, '#quot;');
    if (node.role === 'entry') {
      lines.push(`  ${safeId(node.nodeId)}(["🟢 ${escaped}"])`);
    } else if (node.role === 'exit') {
      lines.push(`  ${safeId(node.nodeId)}(["🔴 ${escaped}"])`);
    } else {
      lines.push(`  ${safeId(node.nodeId)}["${escaped}"]`);
    }
  }

  // Edges
  for (const edge of graph.edges) {
    const label = edge.trigger === 'ON_CLICK' ? edge.action : `${edge.trigger} → ${edge.action}`;
    lines.push(
      `  ${safeId(edge.from.nodeId)} -->|"${label}"| ${safeId(edge.to.nodeId)}`,
    );
  }

  return lines.join('\n');
}

function generateMarkdownDoc(graph: FlowGraph, nameMap: Map<string, string>): string {
  const lines: string[] = [];
  lines.push('# Prototype Flow Documentation\n');

  // Summary
  lines.push('## Summary\n');
  lines.push(`- Screens: ${graph.stats.totalScreens}`);
  lines.push(`- Interactions: ${graph.stats.totalInteractions}`);
  lines.push(`- Entry points: ${graph.entryPoints.length}`);
  lines.push(`- Dead ends: ${graph.deadEnds.length}`);
  lines.push(`- Loops detected: ${graph.loops.length}\n`);

  // Trigger breakdown
  lines.push('## Trigger Types\n');
  for (const [trigger, count] of Object.entries(graph.stats.triggerBreakdown)) {
    lines.push(`- ${trigger}: ${count}`);
  }
  lines.push('');

  // Flow diagram
  lines.push('## Flow Diagram\n');
  lines.push('```mermaid');
  lines.push(generateMermaid(graph, nameMap));
  lines.push('```\n');

  // Screen details
  lines.push('## Screen Details\n');
  for (const node of graph.nodes) {
    const name = nameMap.get(node.nodeId) ?? node.nodeId;
    const roleEmoji = node.role === 'entry' ? '🟢' : node.role === 'exit' ? '🔴' : '🔵';
    lines.push(`### ${roleEmoji} ${name}\n`);
    lines.push(`- Node ID: \`${node.nodeId}\``);
    lines.push(`- Role: ${node.role}`);
    lines.push(`- Incoming: ${node.inDegree} | Outgoing: ${node.outDegree}`);

    const outEdges = graph.edges.filter((e) => e.from.nodeId === node.nodeId);
    if (outEdges.length > 0) {
      lines.push('- Interactions:');
      for (const e of outEdges) {
        const dest = nameMap.get(e.to.nodeId) ?? e.to.nodeId;
        lines.push(`  - **${e.trigger}** → ${e.action} → *${dest}*${e.transition ? ` (${e.transition})` : ''}`);
      }
    }
    lines.push('');
  }

  // Warnings
  if (graph.deadEnds.length > 0) {
    lines.push('## ⚠️ Dead Ends (no outgoing navigation)\n');
    for (const id of graph.deadEnds) {
      lines.push(`- ${nameMap.get(id) ?? id} (\`${id}\`)`);
    }
    lines.push('');
  }

  if (graph.loops.length > 0) {
    lines.push('## 🔄 Loops\n');
    for (const loop of graph.loops) {
      const names = loop.map((id) => nameMap.get(id) ?? id);
      lines.push(`- ${names.join(' → ')}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ─── Tool Registration ───

export function registerPrototypeTools(server: McpServer, bridge: Bridge): void {
  server.tool(
    'analyze_prototype_flow',
    'Analyze prototype interactions on the current page (or a subtree) and produce a structured flow graph. ' +
      'Returns: directed graph of screens/nodes, entry points, dead ends, loops, trigger/action stats, ' +
      'Mermaid diagram, and Markdown interaction documentation. ' +
      'Use this after get_reactions for higher-level prototype analysis.',
    {
      nodeId: z.string().optional().describe('Root node ID to analyze; omit to scan the entire current page'),
      format: z.enum(['graph', 'mermaid', 'markdown', 'all']).optional()
        .describe('Output format: "graph" (structured JSON), "mermaid" (diagram code), "markdown" (full doc), "all" (default)'),
    },
    async ({ nodeId, format = 'all' }) => {
      // 1. Fetch raw reactions from plugin
      const raw = await bridge.request('get_reactions', { nodeId }) as {
        nodes: ReactionNode[];
        count: number;
      };

      if (raw.count === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              message: 'No prototype interactions found on this page/node.',
              hint: 'Add interactions in Figma\'s Prototype tab first.',
            }, null, 2),
          }],
        };
      }

      // 2. Build name map — resolve destination node names via bridge
      const nameMap = new Map<string, string>();
      const destIds = new Set<string>();

      for (const rn of raw.nodes) {
        nameMap.set(rn.nodeId, rn.nodeName);
        for (const reaction of rn.reactions) {
          for (const act of normalizeActions(reaction)) {
            if (act.destinationId) destIds.add(act.destinationId);
          }
        }
      }

      // Resolve unknown destination names
      for (const id of destIds) {
        if (!nameMap.has(id)) {
          try {
            const info = await bridge.request('get_node_info', { nodeId: id }) as {
              name?: string;
              error?: string;
            };
            nameMap.set(id, info.name ?? id);
          } catch {
            nameMap.set(id, id);
          }
        }
      }

      // 3. Build graph
      const graph = buildFlowGraph(raw.nodes, nameMap);

      // 4. Format output
      const output: Record<string, unknown> = {};

      if (format === 'graph' || format === 'all') {
        output.graph = graph;
      }
      if (format === 'mermaid' || format === 'all') {
        output.mermaid = generateMermaid(graph, nameMap);
      }
      if (format === 'markdown' || format === 'all') {
        output.markdown = generateMarkdownDoc(graph, nameMap);
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
      };
    },
  );
}
