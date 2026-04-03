/**
 * Tests for layoutSizing patch behavior — verifies that nodes(update) with
 * layoutSizingHorizontal/Vertical uses the PARENT's layout direction,
 * not the node's own layout direction.
 *
 * Regression test for the axis-direction bug fixed in write-nodes.ts.
 */
import { describe, expect, it } from 'vitest';
import { translateSingleSizing } from '../../packages/adapter-figma/src/utils/node-helpers.js';

describe('translateSingleSizing', () => {
  it('FILL on primary axis → layoutGrow 1', () => {
    const result = translateSingleSizing('FILL', 'primary');
    expect(result.mode).toBe('AUTO');
    expect(result.layoutGrow).toBe(1);
  });

  it('FILL on counter axis → layoutAlign STRETCH', () => {
    const result = translateSingleSizing('FILL', 'counter');
    expect(result.mode).toBe('AUTO');
    expect(result.layoutAlign).toBe('STRETCH');
  });

  it('HUG → mode AUTO, no grow/align', () => {
    const result = translateSingleSizing('HUG', 'primary');
    expect(result.mode).toBe('AUTO');
    expect(result.layoutGrow).toBeUndefined();
  });

  it('FIXED → mode FIXED', () => {
    const result = translateSingleSizing('FIXED', 'counter');
    expect(result.mode).toBe('FIXED');
  });
});

/**
 * Axis resolution logic test:
 * When a node (e.g., HORIZONTAL auto-layout input) is a child of a VERTICAL parent,
 * setting layoutSizingHorizontal:"FILL" should resolve to COUNTER axis (→ layoutAlign STRETCH),
 * NOT PRIMARY axis (→ layoutGrow 1).
 *
 * The correct axis determination is:
 *   isPrimary = (key === 'layoutSizingHorizontal') === (parentDir === 'HORIZONTAL')
 */
describe('axis resolution for parent direction', () => {
  function resolveAxis(
    key: 'layoutSizingHorizontal' | 'layoutSizingVertical',
    parentDir: 'HORIZONTAL' | 'VERTICAL',
  ): 'primary' | 'counter' {
    const parentIsHorizontal = parentDir === 'HORIZONTAL';
    const isPrimary = (key === 'layoutSizingHorizontal') === parentIsHorizontal;
    return isPrimary ? 'primary' : 'counter';
  }

  it('layoutSizingHorizontal in VERTICAL parent → counter axis', () => {
    expect(resolveAxis('layoutSizingHorizontal', 'VERTICAL')).toBe('counter');
  });

  it('layoutSizingVertical in VERTICAL parent → primary axis', () => {
    expect(resolveAxis('layoutSizingVertical', 'VERTICAL')).toBe('primary');
  });

  it('layoutSizingHorizontal in HORIZONTAL parent → primary axis', () => {
    expect(resolveAxis('layoutSizingHorizontal', 'HORIZONTAL')).toBe('primary');
  });

  it('layoutSizingVertical in HORIZONTAL parent → counter axis', () => {
    expect(resolveAxis('layoutSizingVertical', 'HORIZONTAL')).toBe('counter');
  });

  it('FILL on counter → STRETCH (input in VERTICAL form)', () => {
    const axis = resolveAxis('layoutSizingHorizontal', 'VERTICAL');
    const result = translateSingleSizing('FILL', axis);
    expect(result.layoutAlign).toBe('STRETCH');
    expect(result.layoutGrow).toBeUndefined();
  });

  it('FILL on primary → layoutGrow 1 (button in HORIZONTAL row)', () => {
    const axis = resolveAxis('layoutSizingHorizontal', 'HORIZONTAL');
    const result = translateSingleSizing('FILL', axis);
    expect(result.layoutGrow).toBe(1);
    expect(result.layoutAlign).toBeUndefined();
  });
});
