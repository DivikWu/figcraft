/**
 * Shared connection diagnostic messages for ping and get_mode.
 * Returns structured errors with actionable steps for each failure stage.
 */

export type DiagnosticStage = 'evicted' | 'relay_unreachable' | 'plugin_not_connected' | 'plugin_not_responding';

export interface ConnectionDiagnostic {
  connected: false;
  error: string;
  diagnosis: { stage: string; steps: string[] };
}

export function diagnosticError(stage: DiagnosticStage, detail?: string): ConnectionDiagnostic {
  switch (stage) {
    case 'evicted':
      return {
        connected: false,
        error: 'Another MCP instance took over this connection.',
        diagnosis: {
          stage: 'evicted',
          steps: [
            'Check for duplicate FigCraft server entries in your MCP config files (.mcp.json, .vscode/mcp.json, .kiro/settings/mcp.json).',
            'Remove duplicates so only one FigCraft server is configured.',
            'Restart your IDE to reconnect.',
          ],
        },
      };
    case 'relay_unreachable':
      return {
        connected: false,
        error: 'Cannot reach the FigCraft relay server.',
        diagnosis: {
          stage: 'relay_not_running',
          steps: [
            'The relay server is not running or not reachable.',
            'Ensure FigCraft MCP is running in your IDE.',
            'If already running, try restarting the IDE or the Figma plugin.',
          ],
        },
      };
    case 'plugin_not_connected':
      return {
        connected: false,
        error: 'No Figma plugin found on any relay port (3055-3060).',
        diagnosis: {
          stage: 'plugin_not_open',
          steps: [
            'Open your Figma file in the Figma desktop app.',
            'Run the FigCraft plugin (Plugins → FigCraft).',
            'Wait for the plugin UI to show a channel ID, then try again.',
          ],
        },
      };
    case 'plugin_not_responding':
      return {
        connected: false,
        error: `Relay and plugin are connected, but the plugin is not responding.${detail ? ` (${detail})` : ''}`,
        diagnosis: {
          stage: 'plugin_unresponsive',
          steps: [
            'The FigCraft plugin may be stuck or on a different channel.',
            'Try closing and reopening the FigCraft plugin in Figma.',
            'If the issue persists, reload the Figma file (Ctrl/Cmd+Shift+R) and reopen the plugin.',
          ],
        },
      };
  }
}
