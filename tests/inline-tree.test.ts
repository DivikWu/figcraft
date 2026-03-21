/**
 * Tests for inline-tree structure inference engine.
 */
import { describe, it, expect } from 'vitest';
import {
  detectWrongShapeParams,
  rejectUnknownParams,
  inferStructure,
  inferChildSizing,
  normalizeAliases,
  summarizeHints,
  formatInferenceDiff,
  checkOverlappingSiblings,
  checkOverlappingSiblingsPostCreation,
  buildCorrectedPayload,
  type Hint,
} from '../src/plugin/utils/inline-tree.js';

describe('detectWrongShapeParams', () => {
  it('detects CSS gap to itemSpacing', () => {
    const w = detectWrongShapeParams({ gap: 16, width: 100 }, 'Card');
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('gap');
    expect(w[0]).toContain('itemSpacing');
  });

  it('detects multiple CSS params', () => {
    const w = detectWrongShapeParams(
      { gap: 8, borderRadius: 12, alignItems: 'center' }, 'Box',
    );
    expect(w).toHaveLength(3);
  });

  it('ignores known Figma props', () => {
    const w = detectWrongShapeParams(
      { width: 100, height: 50, fill: '#FF0000', autoLayout: true, itemSpacing: 8 },
      'Frame',
    );
    expect(w).toHaveLength(0);
  });

  it('detects backgroundColor to fill', () => {
    const w = detectWrongShapeParams({ backgroundColor: '#FFF' }, 'Bg');
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('fill');
  });
});

describe('inferStructure', () => {
  it('returns empty for non-frame types', () => {
    const r = inferStructure({ type: 'text', props: { content: 'hi' } });
    expect(r.fixes).toHaveLength(0);
    expect(r.ambiguous).toHaveLength(0);
  });

  it('auto-promotes to VERTICAL when children use STRETCH', () => {
    const spec = {
      type: 'frame', name: 'Card',
      props: { width: 300, height: 200 } as Record<string, unknown>,
      children: [
        { type: 'rectangle', props: { layoutAlign: 'STRETCH', height: 2 } },
      ],
    };
    const r = inferStructure(spec);
    expect(r.fixes).toHaveLength(1);
    expect(r.fixes[0]).toContain('auto-promoted');
    expect(spec.props.autoLayout).toBe(true);
    expect(spec.props.layoutDirection).toBe('VERTICAL');
  });

  it('auto-promotes when children use layoutGrow', () => {
    const spec = {
      type: 'frame', name: 'Row',
      props: { width: 400 } as Record<string, unknown>,
      children: [{ type: 'frame', props: { layoutGrow: 1 } }],
    };
    const r = inferStructure(spec);
    expect(r.fixes).toHaveLength(1);
    expect(spec.props.autoLayout).toBe(true);
  });

  it('does not promote when children have no FILL sizing', () => {
    const spec = {
      type: 'frame', name: 'Static',
      props: { width: 200 } as Record<string, unknown>,
      children: [{ type: 'text', props: { content: 'hello' } }],
    };
    const r = inferStructure(spec);
    expect(r.fixes).toHaveLength(0);
    expect(spec.props.autoLayout).toBeUndefined();
  });

  it('preserves existing layoutDirection when promoting', () => {
    const spec = {
      type: 'frame', name: 'Row',
      props: { width: 400, layoutDirection: 'HORIZONTAL' } as Record<string, unknown>,
      children: [{ type: 'frame', props: { layoutAlign: 'STRETCH' } }],
    };
    inferStructure(spec);
    expect(spec.props.layoutDirection).toBe('HORIZONTAL');
  });

  it('resolves STRETCH + explicit cross-axis dimension conflict by removing dimension', () => {
    const spec = {
      type: 'frame', name: 'Container',
      props: { autoLayout: true, layoutDirection: 'VERTICAL' },
      children: [
        { type: 'rectangle', name: 'Divider', props: { layoutAlign: 'STRETCH', width: 300 } },
      ],
    };
    const r = inferStructure(spec);
    // Conflict is now resolved deterministically: dimension removed, reported as fix
    expect(r.fixes).toHaveLength(1);
    expect(r.fixes[0]).toContain('STRETCH');
    expect(r.fixes[0]).toContain('width');
    // The conflicting width should be removed from props
    expect(spec.children![0].props!.width).toBeUndefined();
  });

  it('no conflict warning for STRETCH + primary-axis dimension', () => {
    const spec = {
      type: 'frame', name: 'Container',
      props: { autoLayout: true, layoutDirection: 'VERTICAL', width: 300 },
      children: [
        { type: 'rectangle', name: 'Box', props: { layoutAlign: 'STRETCH', height: 50 } },
      ],
    };
    const r = inferStructure(spec);
    expect(r.ambiguous).toHaveLength(0);
  });
});

describe('inferChildSizing', () => {
  it('auto-sets STRETCH for frame children in auto-layout', () => {
    const props: Record<string, unknown> = { width: 100, height: 50 };
    const w = inferChildSizing('frame', props, true, 'Card');
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('STRETCH');
    expect(props.layoutAlign).toBe('STRETCH');
  });

  it('auto-sets STRETCH for rectangle children', () => {
    const props: Record<string, unknown> = { height: 2, fill: '#E0E0E0' };
    const w = inferChildSizing('rectangle', props, true, 'Divider');
    expect(props.layoutAlign).toBe('STRETCH');
    expect(w).toHaveLength(1);
  });

  it('does not auto-set STRETCH for text children', () => {
    const props: Record<string, unknown> = { content: 'Hello' };
    const w = inferChildSizing('text', props, true, 'Label');
    expect(w).toHaveLength(0);
    expect(props.layoutAlign).toBeUndefined();
  });

  it('does not auto-set STRETCH for vector children', () => {
    const props: Record<string, unknown> = { svg: '<svg></svg>' };
    const w = inferChildSizing('vector', props, true, 'Icon');
    expect(w).toHaveLength(0);
    expect(props.layoutAlign).toBeUndefined();
  });

  it('respects explicit layoutAlign', () => {
    const props: Record<string, unknown> = { layoutAlign: 'INHERIT' };
    const w = inferChildSizing('frame', props, true, 'Box');
    expect(w).toHaveLength(0);
    expect(props.layoutAlign).toBe('INHERIT');
  });

  it('no-op when parent has no auto-layout', () => {
    const props: Record<string, unknown> = {};
    const w = inferChildSizing('frame', props, false, 'Box');
    expect(w).toHaveLength(0);
    expect(props.layoutAlign).toBeUndefined();
  });
});

// ─── Button inference enhancements ───

describe('inferStructure — button enhancements', () => {
  it('auto-adds height to button without explicit height', () => {
    const spec = {
      type: 'frame', name: 'Submit Button',
      props: { fill: '#007AFF' } as Record<string, unknown>,
      children: [{ type: 'text', props: { content: 'Submit' } }],
    };
    const r = inferStructure(spec);
    expect(spec.props.height).toBe(48);
    expect(r.fixes.some(f => f.includes('height=48'))).toBe(true);
  });

  it('does not override explicit button height', () => {
    const spec = {
      type: 'frame', name: 'Submit Button',
      props: { fill: '#007AFF', height: 56 } as Record<string, unknown>,
      children: [{ type: 'text', props: { content: 'Submit' } }],
    };
    inferStructure(spec);
    expect(spec.props.height).toBe(56);
  });

  it('auto-adds padding to button without any padding', () => {
    const spec = {
      type: 'frame', name: 'Login Btn',
      props: { fill: '#007AFF' } as Record<string, unknown>,
      children: [{ type: 'text', props: { content: 'Log In' } }],
    };
    const r = inferStructure(spec);
    expect(spec.props.paddingLeft).toBe(24);
    expect(spec.props.paddingRight).toBe(24);
    expect(r.fixes.some(f => f.includes('paddingLeft/Right=24'))).toBe(true);
  });

  it('does not override explicit button padding', () => {
    const spec = {
      type: 'frame', name: 'Login Btn',
      props: { fill: '#007AFF', paddingLeft: 32, paddingRight: 32 } as Record<string, unknown>,
      children: [{ type: 'text', props: { content: 'Log In' } }],
    };
    inferStructure(spec);
    expect(spec.props.paddingLeft).toBe(32);
    expect(spec.props.paddingRight).toBe(32);
  });

  it('respects uniform padding on button', () => {
    const spec = {
      type: 'frame', name: 'CTA Button',
      props: { fill: '#007AFF', padding: 16 } as Record<string, unknown>,
      children: [{ type: 'text', props: { content: 'Go' } }],
    };
    inferStructure(spec);
    // padding is set, so paddingLeft/Right should not be added
    expect(spec.props.paddingLeft).toBeUndefined();
  });
});

// ─── Input inference enhancements ───

describe('inferStructure — input enhancements', () => {
  it('auto-adds height to input without explicit height', () => {
    const spec = {
      type: 'frame', name: 'Email Input',
      props: {} as Record<string, unknown>,
      children: [{ type: 'text', props: { content: 'Enter email' } }],
    };
    const r = inferStructure(spec);
    expect(spec.props.height).toBe(48);
    expect(r.fixes.some(f => f.includes('height=48'))).toBe(true);
  });

  it('auto-adds stroke to input without stroke', () => {
    const spec = {
      type: 'frame', name: 'Password Field',
      props: {} as Record<string, unknown>,
      children: [{ type: 'text', props: { content: '••••••' } }],
    };
    const r = inferStructure(spec);
    expect(spec.props.stroke).toBe('#E0E0E0');
    expect(spec.props.strokeWeight).toBe(1);
    expect(r.fixes.some(f => f.includes('stroke'))).toBe(true);
  });

  it('auto-adds cornerRadius to input without cornerRadius', () => {
    const spec = {
      type: 'frame', name: 'Username Input',
      props: {} as Record<string, unknown>,
      children: [{ type: 'text', props: { content: 'Username' } }],
    };
    inferStructure(spec);
    expect(spec.props.cornerRadius).toBe(8);
  });

  it('auto-adds padding to input without padding', () => {
    const spec = {
      type: 'frame', name: 'Search Bar',
      props: {} as Record<string, unknown>,
      children: [{ type: 'text', props: { content: 'Search...' } }],
    };
    inferStructure(spec);
    expect(spec.props.paddingLeft).toBe(16);
    expect(spec.props.paddingRight).toBe(16);
  });

  it('does not override explicit input stroke', () => {
    const spec = {
      type: 'frame', name: 'Email Input',
      props: { stroke: '#333333', strokeWeight: 2 } as Record<string, unknown>,
      children: [{ type: 'text', props: { content: 'Email' } }],
    };
    inferStructure(spec);
    expect(spec.props.stroke).toBe('#333333');
    expect(spec.props.strokeWeight).toBe(2);
  });

  it('does not override explicit input cornerRadius', () => {
    const spec = {
      type: 'frame', name: 'Email Input',
      props: { cornerRadius: 12 } as Record<string, unknown>,
      children: [{ type: 'text', props: { content: 'Email' } }],
    };
    inferStructure(spec);
    expect(spec.props.cornerRadius).toBe(12);
  });
});


// ─── CSS alias normalization ───

describe('normalizeAliases', () => {
  it('converts fillColor to fill', () => {
    const props: Record<string, unknown> = { fillColor: '#FF0000', width: 100 };
    const hints = normalizeAliases(props, 'Box');
    expect(props.fill).toBe('#FF0000');
    expect(props.fillColor).toBeUndefined();
    expect(hints).toHaveLength(1);
    expect(hints[0].type).toBe('confirm');
  });

  it('converts backgroundColor to fill', () => {
    const props: Record<string, unknown> = { backgroundColor: '#FFF' };
    normalizeAliases(props, 'Card');
    expect(props.fill).toBe('#FFF');
    expect(props.backgroundColor).toBeUndefined();
  });

  it('converts gap to itemSpacing', () => {
    const props: Record<string, unknown> = { gap: 16 };
    normalizeAliases(props, 'Row');
    expect(props.itemSpacing).toBe(16);
    expect(props.gap).toBeUndefined();
  });

  it('converts flexDirection row to HORIZONTAL', () => {
    const props: Record<string, unknown> = { flexDirection: 'row' };
    normalizeAliases(props, 'Row');
    expect(props.layoutDirection).toBe('HORIZONTAL');
  });

  it('converts display:flex to autoLayout:true', () => {
    const props: Record<string, unknown> = { display: 'flex' };
    normalizeAliases(props, 'Container');
    expect(props.autoLayout).toBe(true);
    expect(props.display).toBeUndefined();
  });

  it('does not override existing target', () => {
    const props: Record<string, unknown> = { fillColor: '#FF0000', fill: '#00FF00' };
    normalizeAliases(props, 'Box');
    expect(props.fill).toBe('#00FF00'); // original preserved
    expect(props.fillColor).toBe('#FF0000'); // alias not deleted since target exists
  });

  it('converts borderColor to stroke', () => {
    const props: Record<string, unknown> = { borderColor: '#E0E0E0' };
    normalizeAliases(props, 'Input');
    expect(props.stroke).toBe('#E0E0E0');
  });

  it('converts borderWidth to strokeWeight', () => {
    const props: Record<string, unknown> = { borderWidth: 2 };
    normalizeAliases(props, 'Input');
    expect(props.strokeWeight).toBe(2);
  });
});

// ─── Hint summarization ───

describe('summarizeHints', () => {
  it('suppresses confirm hints', () => {
    const hints: Hint[] = [
      { type: 'confirm', message: 'auto-promoted to VERTICAL' },
      { type: 'warn', message: 'something wrong' },
    ];
    const warnings = summarizeHints(hints);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toBe('something wrong');
  });

  it('always includes error hints', () => {
    const hints: Hint[] = [
      { type: 'error', message: 'Child failed: timeout' },
    ];
    const warnings = summarizeHints(hints);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('timeout');
  });

  it('deduplicates similar suggest hints', () => {
    const hints: Hint[] = [
      { type: 'suggest', message: 'Hardcoded fill #FF0000 on "Button" — no matching paint style found' },
      { type: 'suggest', message: 'Hardcoded fill #00FF00 on "Card" — no matching paint style found' },
    ];
    const warnings = summarizeHints(hints);
    // Both should be aggregated into a single hardcoded fill message
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('2 hardcoded fill');
    expect(warnings[0]).toContain('#FF0000');
    expect(warnings[0]).toContain('#00FF00');
  });

  it('aggregates hardcoded fill hints separately from other hints', () => {
    const hints: Hint[] = [
      { type: 'suggest', message: 'Hardcoded fill #FF0000 on "Button" — no matching paint style found' },
      { type: 'warn', message: 'Frame "Card" has 3 children but no auto-layout' },
    ];
    const warnings = summarizeHints(hints);
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain('hardcoded fill');
    expect(warnings[1]).toContain('auto-layout');
  });
});

// ─── Inference diff output ───

describe('formatInferenceDiff', () => {
  it('returns null for empty fixes', () => {
    expect(formatInferenceDiff([])).toBeNull();
  });

  it('formats arrow-style fixes as diff', () => {
    const fixes = ['"Card": layoutSizingHorizontal FIXED→FILL (cross-axis without width, stretch to parent)'];
    const diff = formatInferenceDiff(fixes);
    expect(diff).toContain('--- original');
    expect(diff).toContain('+++ corrected');
    expect(diff).toContain('@@ Card @@');
    expect(diff).toContain('- FIXED');
    expect(diff).toContain('+ FILL');
  });

  it('formats non-arrow fixes as additions', () => {
    const fixes = ['"Button": set height=48 (button minimum touch target)'];
    const diff = formatInferenceDiff(fixes);
    expect(diff).toContain('+ set height=48');
  });
});

// ─── Overlapping sibling detection ───

describe('checkOverlappingSiblings', () => {
  it('detects siblings at same position', () => {
    const children = [
      { type: 'rectangle', name: 'Bg', props: { x: 0, y: 0, width: 100, height: 100 } },
      { type: 'text', name: 'Label', props: { x: 0, y: 0 } },
    ];
    const hints = checkOverlappingSiblings(children, 'Card');
    expect(hints).toHaveLength(1);
    expect(hints[0].type).toBe('warn');
    expect(hints[0].message).toContain('overlap');
    expect(hints[0].message).toContain('Bg');
    expect(hints[0].message).toContain('Label');
  });

  it('no warning for distinct positions', () => {
    const children = [
      { type: 'rectangle', name: 'A', props: { x: 0, y: 0 } },
      { type: 'rectangle', name: 'B', props: { x: 100, y: 0 } },
    ];
    const hints = checkOverlappingSiblings(children, 'Row');
    expect(hints).toHaveLength(0);
  });

  it('no warning for single child', () => {
    const children = [
      { type: 'text', name: 'Solo', props: { x: 0, y: 0 } },
    ];
    const hints = checkOverlappingSiblings(children, 'Frame');
    expect(hints).toHaveLength(0);
  });

  it('treats missing x/y as 0,0', () => {
    const children = [
      { type: 'rectangle', name: 'A', props: {} },
      { type: 'rectangle', name: 'B', props: {} },
    ];
    const hints = checkOverlappingSiblings(children, 'Frame');
    expect(hints).toHaveLength(1);
    expect(hints[0].message).toContain('0,0');
  });
});


// ─── Extended CSS alias normalization (surpasses Vibma) ───

describe('normalizeAliases — extended aliases', () => {
  it('converts fillVariableName to fill with _variable object', () => {
    const props: Record<string, unknown> = { fillVariableName: 'colors/primary' };
    const hints = normalizeAliases(props, 'Card', 'frame');
    expect(props.fill).toEqual({ _variable: 'colors/primary' });
    expect(props.fillVariableName).toBeUndefined();
    expect(hints).toHaveLength(1);
    expect(hints[0].type).toBe('confirm');
  });

  it('converts fillStyleName to fill with _style object', () => {
    const props: Record<string, unknown> = { fillStyleName: 'Primary/500' };
    normalizeAliases(props, 'Card', 'frame');
    expect(props.fill).toEqual({ _style: 'Primary/500' });
  });

  it('converts fillVariableId to fill with _variableId object', () => {
    const props: Record<string, unknown> = { fillVariableId: 'VariableID:123:456' };
    normalizeAliases(props, 'Card', 'frame');
    expect(props.fill).toEqual({ _variableId: 'VariableID:123:456' });
  });

  it('converts strokeVariableName to stroke with _variable object', () => {
    const props: Record<string, unknown> = { strokeVariableName: 'border/default' };
    normalizeAliases(props, 'Input', 'frame');
    expect(props.stroke).toEqual({ _variable: 'border/default' });
  });

  it('converts strokeStyleName to stroke with _style object', () => {
    const props: Record<string, unknown> = { strokeStyleName: 'Border/Default' };
    normalizeAliases(props, 'Input', 'frame');
    expect(props.stroke).toEqual({ _style: 'Border/Default' });
  });

  it('converts strokeVariableId to stroke with _variableId object', () => {
    const props: Record<string, unknown> = { strokeVariableId: 'VariableID:789:012' };
    normalizeAliases(props, 'Input', 'frame');
    expect(props.stroke).toEqual({ _variableId: 'VariableID:789:012' });
  });

  it('converts fontColorVariableName to fill for text nodes', () => {
    const props: Record<string, unknown> = { fontColorVariableName: 'text/primary' };
    normalizeAliases(props, 'Label', 'text');
    expect(props.fill).toEqual({ _variable: 'text/primary' });
  });

  it('converts fontColorStyleName to fill for text nodes', () => {
    const props: Record<string, unknown> = { fontColorStyleName: 'Text/Primary' };
    normalizeAliases(props, 'Label', 'text');
    expect(props.fill).toEqual({ _style: 'Text/Primary' });
  });

  it('skips text-only aliases for non-text nodes', () => {
    const props: Record<string, unknown> = { fontColor: '#FF0000' };
    normalizeAliases(props, 'Card', 'frame');
    // fontColor is text-only, should be skipped for frame
    expect(props.fontColor).toBe('#FF0000');
    expect(props.fill).toBeUndefined();
  });

  it('skips frame-only aliases for text nodes', () => {
    const props: Record<string, unknown> = { fillVariableName: 'colors/primary' };
    normalizeAliases(props, 'Label', 'text');
    // fillVariableName is frame-only, should be skipped for text
    expect(props.fillVariableName).toBe('colors/primary');
    expect(props.fill).toBeUndefined();
  });

  it('applies fontColor for text nodes', () => {
    const props: Record<string, unknown> = { fontColor: '#333333' };
    normalizeAliases(props, 'Label', 'text');
    expect(props.fill).toBe('#333333');
    expect(props.fontColor).toBeUndefined();
  });

  it('does not override existing fill when alias present', () => {
    const props: Record<string, unknown> = { fillVariableName: 'colors/primary', fill: '#FF0000' };
    normalizeAliases(props, 'Card', 'frame');
    expect(props.fill).toBe('#FF0000'); // original preserved
  });

  it('works without nodeType (backward compatible)', () => {
    const props: Record<string, unknown> = { backgroundColor: '#FFF' };
    normalizeAliases(props, 'Card');
    expect(props.fill).toBe('#FFF');
  });
});

// ─── Inference confidence grading ───

describe('inferStructure — confidence grading', () => {
  it('marks FIXED→FILL inference as ambiguous', () => {
    const spec = {
      type: 'frame', name: 'Container',
      props: { autoLayout: true, layoutDirection: 'VERTICAL' as const },
      children: [
        { type: 'frame', name: 'Child', props: { layoutSizingHorizontal: 'FIXED' } as Record<string, unknown> },
      ],
    };
    const r = inferStructure(spec);
    expect(r.annotatedFixes.length).toBeGreaterThan(0);
    const ambiguous = r.annotatedFixes.filter(f => f.confidence === 'ambiguous');
    expect(ambiguous.length).toBeGreaterThan(0);
    expect(ambiguous[0].message).toContain('FIXED→FILL');
  });

  it('marks button auto-promote as deterministic', () => {
    const spec = {
      type: 'frame', name: 'Submit Button',
      props: { fill: '#007AFF' } as Record<string, unknown>,
      children: [{ type: 'text', props: { content: 'Submit' } }],
    };
    const r = inferStructure(spec);
    const deterministic = r.annotatedFixes.filter(f => f.confidence === 'deterministic');
    expect(deterministic.length).toBeGreaterThan(0);
    expect(deterministic.some(f => f.message.includes('button'))).toBe(true);
  });

  it('propagates annotatedFixes from child inference', () => {
    const spec = {
      type: 'frame', name: 'Parent',
      props: { autoLayout: true, layoutDirection: 'VERTICAL' as const },
      children: [
        {
          type: 'frame', name: 'Child',
          props: { autoLayout: true, layoutDirection: 'HORIZONTAL' as const },
          children: [
            { type: 'frame', name: 'GrandChild', props: { layoutSizingVertical: 'FIXED' } as Record<string, unknown> },
          ],
        },
      ],
    };
    const r = inferStructure(spec);
    // GrandChild's FIXED→FILL should propagate up
    expect(r.annotatedFixes.some(f => f.message.includes('GrandChild'))).toBe(true);
  });
});

// ─── Selective diff output ───

describe('formatInferenceDiff — selective mode', () => {
  it('shows only ambiguous fixes when annotatedFixes provided', () => {
    const fixes = [
      '"Button": auto-promoted to HORIZONTAL auto-layout',
      '"Child": layoutSizingHorizontal FIXED→FILL (cross-axis)',
    ];
    const annotated = [
      { message: fixes[0], confidence: 'deterministic' as const },
      { message: fixes[1], confidence: 'ambiguous' as const },
    ];
    const diff = formatInferenceDiff(fixes, annotated);
    expect(diff).not.toBeNull();
    expect(diff).toContain('FIXED');
    expect(diff).toContain('FILL');
    expect(diff).not.toContain('auto-promoted'); // deterministic should be hidden
    expect(diff).toContain('deterministic (hidden)');
  });

  it('returns null when all fixes are deterministic', () => {
    const fixes = ['"Button": set height=48'];
    const annotated = [{ message: fixes[0], confidence: 'deterministic' as const }];
    const diff = formatInferenceDiff(fixes, annotated);
    expect(diff).toBeNull();
  });

  it('falls back to full mode without annotatedFixes', () => {
    const fixes = ['"Button": auto-promoted to HORIZONTAL auto-layout'];
    const diff = formatInferenceDiff(fixes);
    expect(diff).not.toBeNull();
    expect(diff).toContain('auto-promoted');
  });
});

// ─── Extended KNOWN_FIGMA_PROPS ───

describe('detectWrongShapeParams — extended known props', () => {
  it('does not warn for fillVariableName (known alias)', () => {
    const w = detectWrongShapeParams({ fillVariableName: 'colors/primary' }, 'Card');
    expect(w).toHaveLength(0);
  });

  it('does not warn for strokeStyleName (known alias)', () => {
    const w = detectWrongShapeParams({ strokeStyleName: 'Border/Default' }, 'Input');
    expect(w).toHaveLength(0);
  });

  it('does not warn for fillVariableId (known alias)', () => {
    const w = detectWrongShapeParams({ fillVariableId: 'VariableID:123:456' }, 'Card');
    expect(w).toHaveLength(0);
  });
});


// ─── Text overflow prevention ───

describe('inferStructure — text overflow prevention', () => {
  it('warns about long text in fixed-width VERTICAL container', () => {
    const spec = {
      type: 'frame', name: 'Card',
      props: { autoLayout: true, layoutDirection: 'VERTICAL', width: 300 } as Record<string, unknown>,
      children: [
        { type: 'text', name: 'Description', props: { content: 'This is a very long description text that might overflow the container boundaries and cause visual issues' } },
      ],
    };
    const r = inferStructure(spec);
    expect(r.ambiguous.some(a => a.includes('long text'))).toBe(true);
    expect(r.annotatedFixes.some(f => f.confidence === 'ambiguous' && f.message.includes('long text'))).toBe(true);
  });

  it('no warning for short text in fixed-width container', () => {
    const spec = {
      type: 'frame', name: 'Card',
      props: { autoLayout: true, layoutDirection: 'VERTICAL', width: 300 } as Record<string, unknown>,
      children: [
        { type: 'text', name: 'Title', props: { content: 'Short title' } },
      ],
    };
    const r = inferStructure(spec);
    expect(r.ambiguous.filter(a => a.includes('long text'))).toHaveLength(0);
  });

  it('no warning for text with explicit layoutAlign', () => {
    const spec = {
      type: 'frame', name: 'Card',
      props: { autoLayout: true, layoutDirection: 'VERTICAL', width: 300 } as Record<string, unknown>,
      children: [
        { type: 'text', name: 'Desc', props: { content: 'A'.repeat(50), layoutAlign: 'STRETCH' } },
      ],
    };
    const r = inferStructure(spec);
    expect(r.ambiguous.filter(a => a.includes('long text'))).toHaveLength(0);
  });

  it('no warning for HUG-width container', () => {
    const spec = {
      type: 'frame', name: 'Card',
      props: { autoLayout: true, layoutDirection: 'VERTICAL', layoutSizingHorizontal: 'HUG' } as Record<string, unknown>,
      children: [
        { type: 'text', name: 'Desc', props: { content: 'A'.repeat(50) } },
      ],
    };
    const r = inferStructure(spec);
    expect(r.ambiguous.filter(a => a.includes('long text'))).toHaveLength(0);
  });

  it('no warning for HORIZONTAL container (cross-axis is height)', () => {
    const spec = {
      type: 'frame', name: 'Row',
      props: { autoLayout: true, layoutDirection: 'HORIZONTAL', width: 300 } as Record<string, unknown>,
      children: [
        { type: 'text', name: 'Label', props: { content: 'A'.repeat(50) } },
      ],
    };
    const r = inferStructure(spec);
    // HORIZONTAL container — text overflow on cross-axis (height) is not a concern
    expect(r.ambiguous.filter(a => a.includes('long text'))).toHaveLength(0);
  });
});


// ─── rejectUnknownParams ───

describe('rejectUnknownParams', () => {
  it('reports truly unknown params as errors', () => {
    const hints = rejectUnknownParams({ zIndex: 10, overflow: 'hidden' }, 'Card', 'frame');
    expect(hints).toHaveLength(2);
    expect(hints[0].type).toBe('error');
    expect(hints[0].message).toContain('zIndex');
    expect(hints[1].message).toContain('overflow');
  });

  it('does not report known Figma props', () => {
    const hints = rejectUnknownParams({ width: 100, fill: '#FF0000', autoLayout: true }, 'Card', 'frame');
    expect(hints).toHaveLength(0);
  });

  it('does not report CSS corrections (handled by detectWrongShapeParams)', () => {
    const hints = rejectUnknownParams({ gap: 16, borderRadius: 8 }, 'Card', 'frame');
    expect(hints).toHaveLength(0);
  });

  it('skips internal keys starting with _', () => {
    const hints = rejectUnknownParams({ _commandId: 'abc', _internal: true }, 'Card', 'frame');
    expect(hints).toHaveLength(0);
  });

  it('does not report per-side stroke weight props', () => {
    const hints = rejectUnknownParams(
      { strokeTopWeight: 2, strokeBottomWeight: 1, strokeLeftWeight: 0, strokeRightWeight: 0 },
      'Card', 'frame',
    );
    expect(hints).toHaveLength(0);
  });
});

// ─── checkOverlappingSiblingsPostCreation ───

describe('checkOverlappingSiblingsPostCreation', () => {
  it('detects overlapping children using rounded positions', () => {
    const parent = {
      name: 'Card',
      children: [
        { name: 'Bg', x: 0.4, y: 0.6, width: 100, height: 100 },
        { name: 'Label', x: 0.3, y: 0.7, width: 50, height: 20 },
      ],
    };
    const hints = checkOverlappingSiblingsPostCreation(parent);
    expect(hints).toHaveLength(1);
    expect(hints[0].type).toBe('warn');
    expect(hints[0].message).toContain('overlap');
    expect(hints[0].message).toContain('0,1'); // Math.round(0.4)=0, Math.round(0.6)=1
  });

  it('no overlap for distinct positions', () => {
    const parent = {
      name: 'Row',
      children: [
        { name: 'A', x: 0, y: 0, width: 50, height: 50 },
        { name: 'B', x: 60, y: 0, width: 50, height: 50 },
      ],
    };
    const hints = checkOverlappingSiblingsPostCreation(parent);
    expect(hints).toHaveLength(0);
  });

  it('handles single child', () => {
    const parent = {
      name: 'Frame',
      children: [{ name: 'Solo', x: 0, y: 0, width: 100, height: 100 }],
    };
    const hints = checkOverlappingSiblingsPostCreation(parent);
    expect(hints).toHaveLength(0);
  });
});

// ─── buildCorrectedPayload ───

describe('buildCorrectedPayload', () => {
  it('preserves original aliases that were normalized', () => {
    const original = {
      type: 'frame', name: 'Card',
      props: { backgroundColor: '#FFF', gap: 16 },
    };
    const corrected = {
      type: 'frame', name: 'Card',
      props: { fill: '#FFF', itemSpacing: 16, autoLayout: true },
    };
    const result = buildCorrectedPayload(original, corrected);
    expect(result.aliasesPreserved).toEqual({
      backgroundColor: '#FFF',
      gap: 16,
    });
    expect(result.spec).toBe(corrected);
  });

  it('returns empty aliasesPreserved when no aliases were used', () => {
    const original = {
      type: 'frame', name: 'Card',
      props: { fill: '#FFF', itemSpacing: 16 },
    };
    const corrected = {
      type: 'frame', name: 'Card',
      props: { fill: '#FFF', itemSpacing: 16, autoLayout: true },
    };
    const result = buildCorrectedPayload(original, corrected);
    expect(result.aliasesPreserved).toEqual({});
  });
});
