/**
 * Smoke test for the components.ts → components/{crud,instances,properties,
 * component-set,audit}.ts split (2026-04).
 *
 * Purpose: prevent regression where someone adds a new component handler
 * without wiring it into the barrel, OR deletes a sub-register call and
 * silently drops a whole group of handlers.
 *
 * This file asserts the registration surface, NOT the runtime behavior of
 * each handler — behavior is covered by the handler-specific tests.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerComponentAuditHandlers } from '../../packages/adapter-figma/src/handlers/components/audit.js';
import { registerComponentSetHandlers } from '../../packages/adapter-figma/src/handlers/components/component-set.js';
import { registerComponentCrudHandlers } from '../../packages/adapter-figma/src/handlers/components/crud.js';
import { registerComponentInstanceHandlers } from '../../packages/adapter-figma/src/handlers/components/instances.js';
import { registerComponentPropertyHandlers } from '../../packages/adapter-figma/src/handlers/components/properties.js';
import { collectVisibleRefs, registerComponentHandlers } from '../../packages/adapter-figma/src/handlers/components.js';
import { handlers } from '../../packages/adapter-figma/src/registry.js';

// Canonical handler list — owned by this test, kept in lockstep with the
// split. If a new handler lands in components/, add it here and to its
// sub-file's `expect` block below.
const CRUD_HANDLERS = [
  'list_components',
  'get_component',
  'create_component',
  'update_component',
  'delete_component',
  'list_local_components',
] as const;

const INSTANCE_HANDLERS = [
  'swap_instance',
  'detach_instance',
  'reset_instance_overrides',
  'get_instance_overrides',
  'set_instance_overrides',
] as const;

const PROPERTY_HANDLERS = [
  'list_component_properties',
  'add_component_property',
  'update_component_property',
  'delete_component_property',
] as const;

const COMPONENT_SET_HANDLERS = ['create_component_set'] as const;

const AUDIT_HANDLERS = ['audit_components', 'preflight_library_publish'] as const;

const ALL_COMPONENT_HANDLERS = [
  ...CRUD_HANDLERS,
  ...INSTANCE_HANDLERS,
  ...PROPERTY_HANDLERS,
  ...COMPONENT_SET_HANDLERS,
  ...AUDIT_HANDLERS,
];

describe('components handler split', () => {
  beforeEach(() => {
    handlers.clear();
    // Stub figma so registration-time code doesn't crash even if a handler
    // body touches the global on module load (none currently do, but the
    // stub is cheap insurance against future drift).
    vi.stubGlobal('figma', {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    handlers.clear();
  });

  it('registerComponentHandlers() registers all 18 component handlers', () => {
    registerComponentHandlers();
    for (const name of ALL_COMPONENT_HANDLERS) {
      expect(handlers.has(name), `expected handler "${name}" to be registered`).toBe(true);
    }
    // Exactly 18, no more no less — catches accidental duplicate registration
    // and unrelated handlers leaking into the barrel.
    const componentScopedRegistered = [...handlers.keys()].filter((k) =>
      (ALL_COMPONENT_HANDLERS as readonly string[]).includes(k),
    );
    expect(componentScopedRegistered.sort()).toEqual([...ALL_COMPONENT_HANDLERS].sort());
  });

  it('registerComponentCrudHandlers() only registers CRUD-scope handlers', () => {
    registerComponentCrudHandlers();
    for (const name of CRUD_HANDLERS) {
      expect(handlers.has(name)).toBe(true);
    }
    for (const name of [...INSTANCE_HANDLERS, ...PROPERTY_HANDLERS, ...COMPONENT_SET_HANDLERS, ...AUDIT_HANDLERS]) {
      expect(handlers.has(name), `"${name}" should NOT be in crud scope`).toBe(false);
    }
  });

  it('registerComponentInstanceHandlers() only registers instance-scope handlers', () => {
    registerComponentInstanceHandlers();
    for (const name of INSTANCE_HANDLERS) {
      expect(handlers.has(name)).toBe(true);
    }
    for (const name of [...CRUD_HANDLERS, ...PROPERTY_HANDLERS, ...COMPONENT_SET_HANDLERS, ...AUDIT_HANDLERS]) {
      expect(handlers.has(name), `"${name}" should NOT be in instances scope`).toBe(false);
    }
  });

  it('registerComponentPropertyHandlers() only registers property-scope handlers', () => {
    registerComponentPropertyHandlers();
    for (const name of PROPERTY_HANDLERS) {
      expect(handlers.has(name)).toBe(true);
    }
    for (const name of [...CRUD_HANDLERS, ...INSTANCE_HANDLERS, ...COMPONENT_SET_HANDLERS, ...AUDIT_HANDLERS]) {
      expect(handlers.has(name), `"${name}" should NOT be in properties scope`).toBe(false);
    }
  });

  it('registerComponentSetHandlers() only registers create_component_set', () => {
    registerComponentSetHandlers();
    for (const name of COMPONENT_SET_HANDLERS) {
      expect(handlers.has(name)).toBe(true);
    }
    for (const name of [...CRUD_HANDLERS, ...INSTANCE_HANDLERS, ...PROPERTY_HANDLERS, ...AUDIT_HANDLERS]) {
      expect(handlers.has(name), `"${name}" should NOT be in component-set scope`).toBe(false);
    }
  });

  it('registerComponentAuditHandlers() only registers audit/preflight handlers', () => {
    registerComponentAuditHandlers();
    for (const name of AUDIT_HANDLERS) {
      expect(handlers.has(name)).toBe(true);
    }
    for (const name of [...CRUD_HANDLERS, ...INSTANCE_HANDLERS, ...PROPERTY_HANDLERS, ...COMPONENT_SET_HANDLERS]) {
      expect(handlers.has(name), `"${name}" should NOT be in audit scope`).toBe(false);
    }
  });

  it('barrel re-exports collectVisibleRefs for legacy consumers', () => {
    // The test suite already imports collectVisibleRefs from this path
    // (see components-visible-refs.test.ts). This assertion just pins
    // the public-surface invariant so a future cleanup can't silently
    // remove the re-export.
    expect(typeof collectVisibleRefs).toBe('function');
    expect(collectVisibleRefs(undefined)).toEqual({ refs: [], warnings: [] });
  });
});
