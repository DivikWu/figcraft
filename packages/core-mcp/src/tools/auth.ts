/**
 * Auth tools — OAuth 2.0 login / logout for Figma REST API.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { clearCredentials, getAuthStatus, startOAuthFlow } from '../auth.js';

export function registerAuthTools(server: McpServer): void {
  server.tool(
    'figma_login',
    'Start Figma OAuth 2.0 login. Returns an authorization URL for the user to open in their browser. ' +
      'After the user authorizes, credentials are saved automatically. ' +
      'Use figma_auth_status to check if authorization completed. ' +
      'Requires FIGMA_CLIENT_ID env var.',
    {},
    async () => {
      try {
        const { url, completion } = startOAuthFlow();

        // Log completion in background (don't block the tool response)
        completion
          .then(() => console.error('[figcraft auth] OAuth flow completed successfully.'))
          .catch((err) => console.error('[figcraft auth] OAuth flow failed:', err.message));

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  ok: true,
                  url,
                  message:
                    'Please open this URL in your browser to authorize figcraft with Figma. ' +
                    'After authorizing, use figma_auth_status to verify.',
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: err instanceof Error ? err.message : String(err) }],
        };
      }
    },
  );

  server.tool('figma_logout', 'Clear stored Figma OAuth credentials.', {}, async () => {
    clearCredentials();
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, message: 'Figma credentials cleared.' }) }],
    };
  });

  server.tool(
    'figma_auth_status',
    'Check current Figma authentication status (pat, oauth, or none). ' +
      'NOTE: Auth status is NOT required before most operations — the plugin handles auth. ' +
      'Only check this if a tool explicitly reports an auth error.',
    {},
    async () => {
      const status = getAuthStatus();
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(status, null, 2) }],
      };
    },
  );
}
