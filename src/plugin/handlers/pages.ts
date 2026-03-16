/**
 * Page management handlers — switch, create, rename pages.
 */

import { registerHandler } from '../registry.js';

export function registerPageHandlers(): void {

registerHandler('set_current_page', async (params) => {
  const nameOrId = params.nameOrId as string;
  const page = figma.root.children.find(
    (p) => p.id === nameOrId || p.name === nameOrId,
  );
  if (!page) return { error: `Page not found: ${nameOrId}` };
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
  if (!page) return { error: `Page not found: ${pageId}` };
  page.name = name;
  return { ok: true, id: page.id, name: page.name };
});

} // registerPageHandlers
