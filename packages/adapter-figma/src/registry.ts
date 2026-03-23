/** Shared command handler registry — imported by code.ts and all handler files. */

export type CommandHandler = (params: Record<string, unknown>) => Promise<unknown>;
export const handlers = new Map<string, CommandHandler>();

/** Register a command handler. */
export function registerHandler(method: string, handler: CommandHandler): void {
  handlers.set(method, handler);
}
