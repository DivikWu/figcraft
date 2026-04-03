/**
 * execute_js MCP tool — runs arbitrary JavaScript in the Figma Plugin sandbox.
 *
 * This is the FigCraft equivalent of Figma MCP's `use_figma` tool.
 * The code is sent to the plugin via the bridge, executed in the sandbox,
 * and the return value is sent back.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Bridge } from '../bridge.js';

export function registerExecuteJsTools(server: McpServer, bridge: Bridge): void {
  server.tool(
    'execute_js',
    'Execute arbitrary JavaScript in the Figma Plugin sandbox. ' +
      'Code runs in an async context with top-level await. ' +
      'Use `return` to send data back (JSON-serialized). ' +
      'The `figma` global (Plugin API) is available. ' +
      'Do NOT call figma.closePlugin() or wrap in async IIFE. ' +
      'Colors are 0–1 range. Fills/strokes are read-only arrays. ' +
      'Load fonts before text ops: await figma.loadFontAsync({family, style}). ' +
      'Failed scripts are NOT atomic — partial nodes may remain after errors. Inspect and clean up.',
    {
      code: z
        .string()
        .describe(
          'JavaScript code to execute in the Figma Plugin sandbox. ' +
            'Use top-level await freely. Use `return` to send data back. ' +
            'The `figma` global (Plugin API) is available.',
        ),
      timeoutMs: z.number().optional().describe('Execution timeout in milliseconds (default: 30000, max: 120000).'),
    },
    async ({ code, timeoutMs }) => {
      // The handler-side timeout (inside the plugin) defaults to 30s, max 120s.
      // The bridge timeout must be higher so the handler's structured error
      // fires before the bridge/queue timeout kills the request.
      // Add 10s buffer over the handler timeout.
      const handlerTimeout = Math.min(Math.max(Number(timeoutMs) || 30_000, 1_000), 120_000);
      const bridgeTimeout = handlerTimeout + 10_000;

      try {
        const result = await bridge.request('execute_js', { code, timeoutMs }, bridgeTimeout);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                ok: false,
                error: err instanceof Error ? err.message : String(err),
              }),
            },
          ],
        };
      }
    },
  );
}
