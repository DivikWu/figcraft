/**
 * Tests for enhanced inference engine — FILL validation, HUG/HUG detection,
 * and parent-context-aware sizing.
 */

import { describe, it, expect } from 'vitest';
import { inferStructure, inferChildSizing } from '../src/plugin/utils/inline-tree.js';

// ─── FILL without auto-layout parent (Fix 2b) ───

describe('inferStructure — FILL without auto-layout parent', () => {
  it('downgrades FILL to HUG when parent has no auto-layout', () => {
    const spec = {
      type: 'frame', name: 'Container',
      props: { width: 400, height: 300 } as Record<string, unknown>,
      children: [
        { type: 'frame', name: 'Child', props: { layoutSizingHorizontal: 'FILL' } as Record<string, unknown> },
      ],
    };
    const r = inferStructure(spec);
    expect(spec.children![0].props!.layoutSizingHorizontal).toBe('HUG');
    expect(r.fixes.some(f => f.includes('FILL→HUG'))).toBe(true);
    // Should be marked as ambiguous
    expect(r.annotatedFixes.some(f => f.confidence === 'ambiguous' && f.message.includes('FILL→HUG'))).toBe(true);
  });

  it('downgrades vertical FILL to HUG when parent has no auto-layout', () => {
    const spec = {
      type: 'frame', name: 'Container',
      props: { width: 400, height: 300 } as Record<string, unknown>,
      children: [
        { type: 'frame', name: 'Child', props: { layoutSizingVertical: 'FILL' } as Record<string, unknown> },
      ],
    };
    const r = inferStructure(spec);
    expect(spec.children![0].props!.layoutSizingVertical).toBe('HUG');
    expect(r.fixes.some(f => f.includes('FILL→HUG'))).toBe(true);
  });

  it('does not downgrade FILL when parent has auto-layout', () => {
    const spec = {
      type: 'frame', name: 'Container',
      props: { autoLayout: true, layoutDirection: 'VERTICAL', width: 400 } as Record<string, unknown>,
      children: [
        { type: 'frame', name: 'Child', props: { layoutSizingHorizontal: 'FILL' } as Record<string, unknown> },
      ],
    };
    inferStructure(spec);
    expect(spec.children![0].props!.layoutSizingHorizontal).toBe('FILL');
  });

  it('handles both axes FILL in non-AL parent', () => {
    const spec = {
      type: 'frame', name: 'Container',
      props: { width: 400, height: 300 } as Record<string, unknown>,
      children: [
        { type: 'frame', name: 'Child', props: {
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'FILL',
        } as Record<string, unknown> },
      ],
    };
    const r = inferStructure(spec);
    expect(spec.children![0].props!.layoutSizingHorizontal).toBe('HUG');
    expect(spec.children![0].props!.layoutSizingVertical).toBe('HUG');
    expect(r.fixes.filter(f => f.includes('FILL→HUG'))).toHaveLength(2);
  });
});

// ─── HUG/HUG detection (Fix 6) ───

describe('inferStructure — HUG/HUG detection', () => {
  it('warns about HUG cross-axis with STRETCH children', () => {
    const spec = {
      type: 'frame', name: 'Card',
      props: { autoLayout: true, layoutDirection: 'VERTICAL' } as Record<string, unknown>,
      // No width → HUG on horizontal (cross-axis for VERTICAL)
      children: [
        { type: 'frame', name: 'Input', props: { layoutAlign: 'STRETCH' } },
      ],
    };
    const r = inferStructure(spec);
    expect(r.ambiguous.some(a => a.includes('HUG') && a.includes('STRETCH'))).toBe(true);
    expect(r.annotatedFixes.some(f => f.confidence === 'ambiguous' && f.message.includes('HUG'))).toBe(true);
  });

  it('no warning when cross-axis has explicit width', () => {
    const spec = {
      type: 'frame', name: 'Card',
      props: { autoLayout: true, layoutDirection: 'VERTICAL', width: 350 } as Record<string, unknown>,
      children: [
        { type: 'frame', name: 'Input', props: { layoutAlign: 'STRETCH' } },
      ],
    };
    const r = inferStructure(spec);
    expect(r.ambiguous.filter(a => a.includes('HUG') && a.includes('STRETCH'))).toHaveLength(0);
  });

  it('no warning when no children use STRETCH', () => {
    const spec = {
      type: 'frame', name: 'Card',
      props: { autoLayout: true, layoutDirection: 'VERTICAL' } as Record<string, unknown>,
      children: [
        { type: 'text', name: 'Label', props: { content: 'Hello' } },
      ],
    };
    const r = inferStructure(spec);
    expect(r.ambiguous.filter(a => a.includes('HUG') && a.includes('STRETCH'))).toHaveLength(0);
  });

  it('detects HUG + FILL sizing on cross-axis', () => {
    const spec = {
      type: 'frame', name: 'Card',
      props: { autoLayout: true, layoutDirection: 'VERTICAL' } as Record<string, unknown>,
      children: [
        { type: 'frame', name: 'Child', props: { layoutSizingHorizontal: 'FILL' } as Record<string, unknown> },
      ],
    };
    const r = inferStructure(spec);
    expect(r.ambiguous.some(a => a.includes('HUG'))).toBe(true);
  });

  it('works for HORIZONTAL layout (cross-axis is vertical)', () => {
    const spec = {
      type: 'frame', name: 'Row',
      props: { autoLayout: true, layoutDirection: 'HORIZONTAL' } as Record<string, unknown>,
      // No height → HUG on vertical (cross-axis for HORIZONTAL)
      children: [
        { type: 'frame', name: 'Item', props: { layoutAlign: 'STRETCH' } },
      ],
    };
    const r = inferStructure(spec);
    expect(r.ambiguous.some(a => a.includes('HUG') && a.includes('vertical'))).toBe(true);
  });
});

// ─── Enhanced inferChildSizing ───

describe('inferChildSizing — FILL without auto-layout parent', () => {
  it('downgrades horizontal FILL to HUG when parent has no auto-layout', () => {
    const props: Record<string, unknown> = { layoutSizingHorizontal: 'FILL' };
    const w = inferChildSizing('frame', props, false, 'Child');
    expect(props.layoutSizingHorizontal).toBe('HUG');
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('FILL→HUG');
  });

  it('downgrades vertical FILL to HUG when parent has no auto-layout', () => {
    const props: Record<string, unknown> = { layoutSizingVertical: 'FILL' };
    const w = inferChildSizing('frame', props, false, 'Child');
    expect(props.layoutSizingVertical).toBe('HUG');
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('FILL→HUG');
  });

  it('does not downgrade FILL when parent has auto-layout', () => {
    const props: Record<string, unknown> = { layoutSizingHorizontal: 'FILL' };
    const w = inferChildSizing('frame', props, true, 'Child');
    // FILL is valid in auto-layout parent — should not be downgraded
    // But layoutAlign should be set to STRETCH
    expect(props.layoutSizingHorizontal).toBe('FILL');
  });

  it('handles both axes FILL in non-AL parent', () => {
    const props: Record<string, unknown> = {
      layoutSizingHorizontal: 'FILL',
      layoutSizingVertical: 'FILL',
    };
    const w = inferChildSizing('frame', props, false, 'Child');
    expect(props.layoutSizingHorizontal).toBe('HUG');
    expect(props.layoutSizingVertical).toBe('HUG');
    expect(w).toHaveLength(2);
  });

  it('does not affect non-FILL sizing in non-AL parent', () => {
    const props: Record<string, unknown> = { layoutSizingHorizontal: 'HUG' };
    const w = inferChildSizing('frame', props, false, 'Child');
    expect(props.layoutSizingHorizontal).toBe('HUG');
    expect(w).toHaveLength(0);
  });
});


// ─── Deep axis-aware sizing with parentContext ───

describe('inferChildSizing — deep axis-aware sizing with parentContext', () => {
  it('auto-sets cross-axis FILL when parent has constrained width (VERTICAL)', () => {
    const props: Record<string, unknown> = {};
    const w = inferChildSizing('frame', props, true, 'Card', {
      layoutDirection: 'VERTICAL',
      parentName: 'Screen',
      parentWidth: 402,
      parentHeight: 874,
    });
    expect(props.layoutAlign).toBe('STRETCH');
    expect(props.layoutSizingHorizontal).toBe('FILL');
    expect(w.some(m => m.includes('FILL') && m.includes('constrained'))).toBe(true);
  });

  it('auto-sets primary-axis HUG when no explicit height (VERTICAL)', () => {
    const props: Record<string, unknown> = {};
    const w = inferChildSizing('frame', props, true, 'Card', {
      layoutDirection: 'VERTICAL',
      parentName: 'Screen',
      parentWidth: 402,
      parentHeight: 874,
    });
    expect(props.layoutSizingVertical).toBe('HUG');
    expect(w.some(m => m.includes('HUG') && m.includes('primary'))).toBe(true);
  });

  it('auto-sets cross-axis FILL when parent has constrained height (HORIZONTAL)', () => {
    const props: Record<string, unknown> = {};
    const w = inferChildSizing('frame', props, true, 'Item', {
      layoutDirection: 'HORIZONTAL',
      parentName: 'Row',
      parentWidth: 300,
      parentHeight: 60,
    });
    expect(props.layoutSizingVertical).toBe('FILL');
    expect(w.some(m => m.includes('FILL'))).toBe(true);
  });

  it('auto-sets primary-axis HUG for HORIZONTAL layout', () => {
    const props: Record<string, unknown> = {};
    const w = inferChildSizing('frame', props, true, 'Item', {
      layoutDirection: 'HORIZONTAL',
      parentName: 'Row',
      parentWidth: 300,
      parentHeight: 60,
    });
    expect(props.layoutSizingHorizontal).toBe('HUG');
    expect(w.some(m => m.includes('HUG') && m.includes('primary'))).toBe(true);
  });

  it('does not override explicit cross-axis sizing', () => {
    const props: Record<string, unknown> = { layoutSizingHorizontal: 'FIXED', width: 200 };
    inferChildSizing('frame', props, true, 'Card', {
      layoutDirection: 'VERTICAL',
      parentName: 'Screen',
      parentWidth: 402,
    });
    // Explicit sizing should not be overridden
    expect(props.layoutSizingHorizontal).toBe('FIXED');
  });

  it('does not override explicit primary-axis sizing', () => {
    const props: Record<string, unknown> = { layoutSizingVertical: 'FILL' };
    inferChildSizing('frame', props, true, 'Card', {
      layoutDirection: 'VERTICAL',
      parentName: 'Screen',
      parentWidth: 402,
    });
    expect(props.layoutSizingVertical).toBe('FILL');
  });

  it('does not set cross-axis FILL when parent has no constrained dimension', () => {
    const props: Record<string, unknown> = {};
    const w = inferChildSizing('frame', props, true, 'Card', {
      layoutDirection: 'VERTICAL',
      parentName: 'Screen',
      // No parentWidth → parent is HUG on cross-axis
    });
    expect(props.layoutSizingHorizontal).toBeUndefined();
    // Should still get STRETCH from the base logic
    expect(props.layoutAlign).toBe('STRETCH');
  });

  it('warns about FIXED/FIXED inside auto-layout', () => {
    const props: Record<string, unknown> = { width: 200, height: 100, layoutAlign: 'INHERIT' };
    const w = inferChildSizing('frame', props, true, 'Card', {
      layoutDirection: 'VERTICAL',
      parentName: 'Screen',
      parentWidth: 402,
    });
    expect(w.some(m => m.includes('FIXED/FIXED'))).toBe(true);
  });

  it('no FIXED/FIXED warning when layoutAlign is STRETCH', () => {
    const props: Record<string, unknown> = { width: 200, height: 100, layoutAlign: 'STRETCH' };
    const w = inferChildSizing('frame', props, true, 'Card', {
      layoutDirection: 'VERTICAL',
      parentName: 'Screen',
      parentWidth: 402,
    });
    expect(w.some(m => m.includes('FIXED/FIXED'))).toBe(false);
  });

  it('does not apply deep sizing for non-frame types', () => {
    const props: Record<string, unknown> = {};
    inferChildSizing('rectangle', props, true, 'Divider', {
      layoutDirection: 'VERTICAL',
      parentName: 'Screen',
      parentWidth: 402,
    });
    // rectangle should get STRETCH but not deep sizing
    expect(props.layoutAlign).toBe('STRETCH');
    expect(props.layoutSizingHorizontal).toBeUndefined();
    expect(props.layoutSizingVertical).toBeUndefined();
  });

  it('works without parentContext (backward compatible)', () => {
    const props: Record<string, unknown> = {};
    const w = inferChildSizing('frame', props, true, 'Card');
    expect(props.layoutAlign).toBe('STRETCH');
    // No deep sizing without parentContext
    expect(props.layoutSizingHorizontal).toBeUndefined();
  });
});

// ─── correctedNodes staging mechanism ───

describe('inferStructure — correctedNodes', () => {
  it('captures child correctedNode when FIXED→FILL is applied', () => {
    const spec = {
      type: 'frame', name: 'Screen',
      props: { autoLayout: true, layoutDirection: 'VERTICAL' as const },
      children: [
        { type: 'frame', name: 'Header', props: { layoutSizingHorizontal: 'FIXED' } as Record<string, unknown> },
      ],
    };
    const r = inferStructure(spec);
    expect(r.correctedNodes.length).toBeGreaterThan(0);
    const headerNode = r.correctedNodes.find(cn => cn.nodeName === 'Header');
    expect(headerNode).toBeDefined();
    expect(headerNode!.original.layoutSizingHorizontal).toBe('FIXED');
    expect(headerNode!.corrected.layoutSizingHorizontal).toBe('FILL');
    expect(headerNode!.ambiguousFixes.length).toBeGreaterThan(0);
  });

  it('captures child correctedNode when FIXED→HUG is applied on primary axis', () => {
    const spec = {
      type: 'frame', name: 'Screen',
      props: { autoLayout: true, layoutDirection: 'VERTICAL' as const },
      children: [
        { type: 'frame', name: 'Content', props: { layoutSizingVertical: 'FIXED' } as Record<string, unknown> },
      ],
    };
    const r = inferStructure(spec);
    const contentNode = r.correctedNodes.find(cn => cn.nodeName === 'Content');
    expect(contentNode).toBeDefined();
    expect(contentNode!.original.layoutSizingVertical).toBe('FIXED');
    expect(contentNode!.corrected.layoutSizingVertical).toBe('HUG');
  });

  it('captures child correctedNode for FILL→HUG in non-AL parent', () => {
    const spec = {
      type: 'frame', name: 'Container',
      props: { width: 400, height: 300 } as Record<string, unknown>,
      children: [
        { type: 'frame', name: 'Child', props: { layoutSizingHorizontal: 'FILL' } as Record<string, unknown> },
      ],
    };
    const r = inferStructure(spec);
    const childNode = r.correctedNodes.find(cn => cn.nodeName === 'Child');
    expect(childNode).toBeDefined();
    expect(childNode!.original.layoutSizingHorizontal).toBe('FILL');
    expect(childNode!.corrected.layoutSizingHorizontal).toBe('HUG');
  });

  it('no correctedNodes when no ambiguous fixes', () => {
    const spec = {
      type: 'frame', name: 'Screen',
      props: { autoLayout: true, layoutDirection: 'VERTICAL' as const, width: 400 },
      children: [
        { type: 'text', name: 'Label', props: { content: 'Hello' } },
      ],
    };
    const r = inferStructure(spec);
    expect(r.correctedNodes).toHaveLength(0);
  });

  it('propagates correctedNodes from nested recursive inference', () => {
    const spec = {
      type: 'frame', name: 'Screen',
      props: { autoLayout: true, layoutDirection: 'VERTICAL' as const },
      children: [
        {
          type: 'frame', name: 'Section',
          props: { autoLayout: true, layoutDirection: 'HORIZONTAL' as const },
          children: [
            { type: 'frame', name: 'DeepChild', props: { layoutSizingVertical: 'FIXED' } as Record<string, unknown> },
          ],
        },
      ],
    };
    const r = inferStructure(spec);
    const deepChild = r.correctedNodes.find(cn => cn.nodeName === 'DeepChild');
    expect(deepChild).toBeDefined();
    expect(deepChild!.original.layoutSizingVertical).toBe('FIXED');
    // In HORIZONTAL parent, vertical is cross-axis → FIXED→FILL
    expect(deepChild!.corrected.layoutSizingVertical).toBe('FILL');
  });
});
