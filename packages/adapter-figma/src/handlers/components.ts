/**
 * Component & instance handler barrel.
 *
 * The handlers live in `components/` split by concern:
 *   - crud.ts          — list/get/create/update/delete + list_local + createSingleComponent
 *   - instances.ts     — swap/detach/reset/get_overrides/set_overrides
 *   - properties.ts    — list/add/update/delete component property
 *   - component-set.ts — create_component_set (variant matrix + section auto-placement)
 *   - audit.ts         — audit_components + preflight_library_publish
 *
 * This file intentionally stays as the import target for `code.ts` and for
 * tests that consume `collectVisibleRefs` — re-exported below so the public
 * surface is unchanged after the split.
 */

import { registerComponentAuditHandlers } from './components/audit.js';
import { registerComponentSetHandlers } from './components/component-set.js';
import { registerComponentCrudHandlers } from './components/crud.js';
import { registerComponentInstanceHandlers } from './components/instances.js';
import { registerComponentPropertyHandlers } from './components/properties.js';

export type { VisibleRefCollectorResult } from './components/crud.js';
// Re-export for tests (tests/adapter-figma/components-visible-refs.test.ts)
export { collectVisibleRefs } from './components/crud.js';

export function registerComponentHandlers(): void {
  registerComponentCrudHandlers();
  registerComponentInstanceHandlers();
  registerComponentPropertyHandlers();
  registerComponentSetHandlers();
  registerComponentAuditHandlers();
}
