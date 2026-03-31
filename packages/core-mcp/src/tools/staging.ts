/**
 * Staging tools — stage/commit/discard workflow for preview-before-finalize.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Bridge } from '../bridge.js';
import { jsonResponse } from './response-helpers.js';

export function registerStagingTools(server: McpServer, bridge: Bridge): void {
  server.tool(
    'stage_changes',
    'Mark nodes as staged (preview). Staged nodes are shown at reduced opacity with an annotation. ' +
      'Use commit_changes to finalize or discard_changes to remove them.',
    {
      nodeIds: z.array(z.string()).describe('Node IDs to stage'),
    },
    async ({ nodeIds }) => {
      const result = await bridge.request('stage_changes', { nodeIds });
      return jsonResponse(result);
    },
  );

  server.tool(
    'commit_changes',
    'Finalize staged nodes — restores original opacity and removes staging annotations. ' +
      'If no nodeIds provided, commits all currently staged nodes.',
    {
      nodeIds: z.array(z.string()).optional().describe('Node IDs to commit (default: all staged)'),
    },
    async ({ nodeIds }) => {
      const result = await bridge.request('commit_changes', { nodeIds });
      return jsonResponse(result);
    },
  );

  server.tool(
    'discard_changes',
    'Remove staged nodes from the canvas entirely. ' +
      'If no nodeIds provided, discards all currently staged nodes.',
    {
      nodeIds: z.array(z.string()).optional().describe('Node IDs to discard (default: all staged)'),
    },
    async ({ nodeIds }) => {
      const result = await bridge.request('discard_changes', { nodeIds });
      return jsonResponse(result);
    },
  );

  server.tool(
    'list_staged',
    'List all currently staged nodes.',
    {},
    async () => {
      const result = await bridge.request('list_staged', {});
      return jsonResponse(result);
    },
  );
}
