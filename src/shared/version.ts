/**
 * Single source of truth for the FigCraft version string.
 *
 * All modules (MCP Server, Plugin, Relay) must import from here
 * instead of hardcoding their own version literals.
 *
 * Auto-synced from package.json by the schema compiler (npm run schema).
 * Enforced by tests/version.test.ts.
 */
export const VERSION = '0.1.0';
