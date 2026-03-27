/**
 * Page management handlers — switch, create, rename pages.
 */

import { registerHandler } from '../registry.js';
import { assertHandler } from '../utils/handler-error.js';

export function registerPageHandlers(): void {

registerHandler('set_current_page', async (params) => {
  const nameOrId = params.nameOrId as string;
  const page = figma.root.children.find(
    (p) => p.id === nameOrId || p.name === nameOrId,
  );
  assertHandler(page, `Page not found: ${nameOrId}`, 'NOT_FOUND');
  await figma.setCurrentPageAsync(page);
  return { ok: true, pageId: page.id, pageName: page.name };
});

registerHandler('create_page', async (params) => {
  const name = params.name as string;
  const page = figma.createPage();
  page.name = name;
  return { id: page.id, name: page.name };
});

registerHandler('rename_page', async (params) => {
  const pageId = params.pageId as string;
  const name = params.name as string;
  const page = figma.root.children.find((p) => p.id === pageId);
  assertHandler(page, `Page not found: ${pageId}`, 'NOT_FOUND');
  page.name = name;
  return { ok: true, id: page.id, name: page.name };
});

} // registerPageHandlers
