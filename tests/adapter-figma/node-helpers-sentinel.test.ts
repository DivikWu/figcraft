/**
 * P0-A: Text binding sentinel tests.
 *
 * When a text-role fill binding fails, applyFill must write a hot-magenta
 * sentinel fill + plugin-data tag so the failure is visible in screenshots
 * and machine-detectable by lint/audit tools. Frame/border failures must
 * stay silent to avoid false positives on intentional no-fill surfaces.
 */

import { describe, expect, it } from 'vitest';
import {
  SENTINEL_PLUGIN_KEY,
  SENTINEL_PLUGIN_VALUE,
  SENTINEL_TEXT_FAIL_FILL,
  withSentinel,
  writeSentinelIfText,
} from '../../packages/adapter-figma/src/utils/node-helpers.js';

/** Minimal SceneNode & MinimalFillsMixin mock: fills + plugin data store. */
function createMockNode() {
  const store = new Map<string, string>();
  return {
    type: 'TEXT',
    fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }] as unknown,
    setPluginData(k: string, v: string) {
      store.set(k, v);
    },
    getPluginData(k: string): string {
      return store.get(k) ?? '';
    },
    // Hook for test assertions on the internal store
    _pluginDataStore: store,
  } as unknown as SceneNode & MinimalFillsMixin & { _pluginDataStore: Map<string, string> };
}

describe('writeSentinelIfText', () => {
  it('applies magenta fill + plugin-data tag when role is textColor', () => {
    const node = createMockNode();
    const applied = writeSentinelIfText(node, 'textColor');
    expect(applied).toBe(true);
    expect((node.fills as unknown as SolidPaint[])[0]).toEqual(SENTINEL_TEXT_FAIL_FILL);
    expect((node as unknown as { getPluginData: (k: string) => string }).getPluginData(SENTINEL_PLUGIN_KEY)).toBe(
      SENTINEL_PLUGIN_VALUE,
    );
  });

  it('applies sentinel for headingColor role', () => {
    const node = createMockNode();
    const applied = writeSentinelIfText(node, 'headingColor');
    expect(applied).toBe(true);
    expect((node.fills as unknown as SolidPaint[])[0]).toEqual(SENTINEL_TEXT_FAIL_FILL);
  });

  it('applies sentinel for textSecondary role', () => {
    const node = createMockNode();
    const applied = writeSentinelIfText(node, 'textSecondary');
    expect(applied).toBe(true);
  });

  it('does NOT touch node for background role', () => {
    const node = createMockNode();
    const originalFill = (node.fills as unknown as SolidPaint[])[0];
    const applied = writeSentinelIfText(node, 'background');
    expect(applied).toBe(false);
    expect((node.fills as unknown as SolidPaint[])[0]).toBe(originalFill);
    expect((node as unknown as { getPluginData: (k: string) => string }).getPluginData(SENTINEL_PLUGIN_KEY)).toBe('');
  });

  it('does NOT touch node for border role', () => {
    const node = createMockNode();
    const applied = writeSentinelIfText(node, 'border');
    expect(applied).toBe(false);
    expect((node as unknown as { getPluginData: (k: string) => string }).getPluginData(SENTINEL_PLUGIN_KEY)).toBe('');
  });

  it('does NOT touch node for unknown role', () => {
    const node = createMockNode();
    const applied = writeSentinelIfText(node, 'somethingElse');
    expect(applied).toBe(false);
  });

  it('sentinel color is off-pure magenta (#FF00D4), not pure #FF00FF', () => {
    // Intentional: reduces collision risk with designs that use pure magenta.
    expect(SENTINEL_TEXT_FAIL_FILL.type).toBe('SOLID');
    expect((SENTINEL_TEXT_FAIL_FILL as SolidPaint).color).toEqual({ r: 1, g: 0, b: 0.831 });
  });
});

describe('withSentinel', () => {
  it('returns successful result unchanged (no sentinel on success)', () => {
    const node = createMockNode();
    const before = (node.fills as unknown as SolidPaint[])[0];
    const result = withSentinel({ autoBound: 'var:text/primary' }, node, 'textColor');
    expect(result.autoBound).toBe('var:text/primary');
    expect((node.fills as unknown as SolidPaint[])[0]).toBe(before); // untouched
  });

  it('returns failure without bindingFailure unchanged (non-token errors stay silent)', () => {
    const node = createMockNode();
    const before = (node.fills as unknown as SolidPaint[])[0];
    const result = withSentinel({ autoBound: null, colorHint: 'some input shape error' }, node, 'textColor');
    expect(result.colorHint).toBe('some input shape error');
    expect((node.fills as unknown as SolidPaint[])[0]).toBe(before); // untouched
  });

  it('applies sentinel + prepends hint prefix on text-role binding failure', () => {
    const node = createMockNode();
    const result = withSentinel(
      {
        autoBound: null,
        colorHint: '⛔ Variable name "text/missing" not found in library "DS".',
        bindingFailure: { requested: 'text/missing', type: 'variable', action: 'skipped' },
      },
      node,
      'textColor',
    );
    expect((node.fills as unknown as SolidPaint[])[0]).toEqual(SENTINEL_TEXT_FAIL_FILL);
    expect((node as unknown as { getPluginData: (k: string) => string }).getPluginData(SENTINEL_PLUGIN_KEY)).toBe(
      SENTINEL_PLUGIN_VALUE,
    );
    expect(result.colorHint).toContain('Sentinel magenta applied');
    expect(result.colorHint).toContain('token binding failed');
    expect(result.colorHint).toContain('Variable name "text/missing" not found');
    expect(result.bindingFailure).toBeDefined();
    expect(result.autoBound).toBeNull();
  });

  it('does NOT apply sentinel on background-role binding failure', () => {
    const node = createMockNode();
    const before = (node.fills as unknown as SolidPaint[])[0];
    const result = withSentinel(
      {
        autoBound: null,
        colorHint: 'Variable "bg/missing" not found.',
        bindingFailure: { requested: 'bg/missing', type: 'variable', action: 'skipped' },
      },
      node,
      'background',
    );
    expect((node.fills as unknown as SolidPaint[])[0]).toBe(before);
    expect(result.colorHint).toBe('Variable "bg/missing" not found.'); // no prefix
    expect((node as unknown as { getPluginData: (k: string) => string }).getPluginData(SENTINEL_PLUGIN_KEY)).toBe('');
    expect(result.bindingFailure).toBeDefined(); // still emitted for harness rule
  });

  it('does NOT apply sentinel on border-role binding failure', () => {
    const node = createMockNode();
    const result = withSentinel(
      {
        autoBound: null,
        colorHint: 'border variable not found',
        bindingFailure: { requested: 'border/missing', type: 'variable', action: 'skipped' },
      },
      node,
      'border',
    );
    expect(result.colorHint).toBe('border variable not found');
    expect((node as unknown as { getPluginData: (k: string) => string }).getPluginData(SENTINEL_PLUGIN_KEY)).toBe('');
  });

  it('generates default hint when colorHint is missing on text-role failure', () => {
    const node = createMockNode();
    const result = withSentinel(
      {
        autoBound: null,
        bindingFailure: { requested: 'text/primary', type: 'variable', action: 'skipped' },
      },
      node,
      'textColor',
    );
    expect(result.colorHint).toContain('Sentinel magenta applied');
    expect(result.colorHint).toContain('Binding failed for "text/primary"');
  });

  it('preserves bindingFailure action through the wrapper (scope-mismatch)', () => {
    const node = createMockNode();
    const result = withSentinel(
      {
        autoBound: null,
        colorHint: 'scope mismatch detail',
        bindingFailure: { requested: 'text/primary', type: 'variable', action: 'scope-mismatch' },
      },
      node,
      'textColor',
    );
    expect(result.bindingFailure?.action).toBe('scope-mismatch');
    expect(result.colorHint).toContain('Sentinel magenta applied');
  });

  it('preserves bindingFailure action through the wrapper (ambiguous)', () => {
    const node = createMockNode();
    const result = withSentinel(
      {
        autoBound: null,
        colorHint: 'ambiguous detail',
        bindingFailure: { requested: 'primary', type: 'variable', action: 'ambiguous' },
      },
      node,
      'headingColor',
    );
    expect(result.bindingFailure?.action).toBe('ambiguous');
    expect((node.fills as unknown as SolidPaint[])[0]).toEqual(SENTINEL_TEXT_FAIL_FILL);
  });
});
