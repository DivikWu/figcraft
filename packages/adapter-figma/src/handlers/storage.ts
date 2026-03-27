/**
 * ClientStorage handlers — cache token specs locally in the Figma file.
 */

import { registerHandler } from '../registry.js';
import { assertHandler } from '../utils/handler-error.js';

const STORAGE_PREFIX = 'figcraft:tokens:';

export function registerStorageHandlers(): void {

registerHandler('save_spec_tokens', async (params) => {
  const name = params.name as string;
  const tokens = params.tokens;
  await figma.clientStorage.setAsync(STORAGE_PREFIX + name, tokens);
  return { ok: true, name };
});

registerHandler('load_spec_tokens', async (params) => {
  const name = params.name as string;
  const tokens = await figma.clientStorage.getAsync(STORAGE_PREFIX + name);
  assertHandler(tokens, `No cached tokens found: ${name}`, 'NOT_FOUND');
  return { name, tokens };
});

registerHandler('list_spec_tokens', async () => {
  const keys = await figma.clientStorage.keysAsync();
  const tokenKeys = keys.filter((k) => k.startsWith(STORAGE_PREFIX));
  return {
    entries: tokenKeys.map((k) => k.slice(STORAGE_PREFIX.length)),
  };
});

registerHandler('delete_spec_tokens', async (params) => {
  const name = params.name as string;
  await figma.clientStorage.deleteAsync(STORAGE_PREFIX + name);
  return { ok: true };
});

} // registerStorageHandlers
