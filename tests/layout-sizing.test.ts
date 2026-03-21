/**
 * Tests for layoutSizingHorizontal / layoutSizingVertical translation.
 */
import { describe, it, expect } from 'vitest';
import { translateLayoutSizing, translateSingleSizing, type AutoLayoutProps } from '../src/plugin/utils/node-helpers.js';

describe('translateLayoutSizing', () => {
  // ─── VERTICAL layout direction ───

  describe('VERTICAL layout', () => {
    const dir = 'VERTICAL' as const;

    it('HUG horizontal + HUG vertical → both AUTO', () => {
      const p: AutoLayoutProps = {
        autoLayout: true,
        layoutSizingHorizontal: 'HUG',
        layoutSizingVertical: 'HUG',
      };
      const r = translateLayoutSizing(p, dir);
      // VERTICAL: primary=vertical, counter=horizontal
      expect(r.primaryMode).toBe('AUTO');   // vertical HUG
      expect(r.counterMode).toBe('AUTO');   // horizontal HUG
      expect(r.layoutGrow).toBe(0);
      expect(r.layoutAlign).toBe('INHERIT');
    });

    it('FIXED horizontal + FIXED vertical → both FIXED', () => {
      const p: AutoLayoutProps = {
        autoLayout: true,
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 300,
        height: 400,
      };
      const r = translateLayoutSizing(p, dir);
      expect(r.primaryMode).toBe('FIXED');
      expect(r.counterMode).toBe('FIXED');
    });

    it('FILL horizontal → counter STRETCH, FILL vertical → primary layoutGrow', () => {
      const p: AutoLayoutProps = {
        autoLayout: true,
        layoutSizingHorizontal: 'FILL',
        layoutSizingVertical: 'FILL',
      };
      const r = translateLayoutSizing(p, dir);
      // VERTICAL: primary=vertical → FILL means layoutGrow=1
      expect(r.primaryMode).toBe('AUTO');
      expect(r.layoutGrow).toBe(1);
      // VERTICAL: counter=horizontal → FILL means layoutAlign=STRETCH
      expect(r.counterMode).toBe('AUTO');
      expect(r.layoutAlign).toBe('STRETCH');
    });

    it('FIXED horizontal + HUG vertical', () => {
      const p: AutoLayoutProps = {
        autoLayout: true,
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'HUG',
        width: 300,
      };
      const r = translateLayoutSizing(p, dir);
      expect(r.counterMode).toBe('FIXED');  // horizontal FIXED
      expect(r.primaryMode).toBe('AUTO');    // vertical HUG
    });

    it('FILL horizontal + FIXED vertical', () => {
      const p: AutoLayoutProps = {
        autoLayout: true,
        layoutSizingHorizontal: 'FILL',
        layoutSizingVertical: 'FIXED',
        height: 200,
      };
      const r = translateLayoutSizing(p, dir);
      expect(r.counterMode).toBe('AUTO');
      expect(r.layoutAlign).toBe('STRETCH');
      expect(r.primaryMode).toBe('FIXED');
      expect(r.layoutGrow).toBe(0);
    });
  });

  // ─── HORIZONTAL layout direction ───

  describe('HORIZONTAL layout', () => {
    const dir = 'HORIZONTAL' as const;

    it('HUG horizontal + HUG vertical → both AUTO', () => {
      const p: AutoLayoutProps = {
        autoLayout: true,
        layoutSizingHorizontal: 'HUG',
        layoutSizingVertical: 'HUG',
      };
      const r = translateLayoutSizing(p, dir);
      // HORIZONTAL: primary=horizontal, counter=vertical
      expect(r.primaryMode).toBe('AUTO');
      expect(r.counterMode).toBe('AUTO');
    });

    it('FILL horizontal → primary layoutGrow, FILL vertical → counter STRETCH', () => {
      const p: AutoLayoutProps = {
        autoLayout: true,
        layoutSizingHorizontal: 'FILL',
        layoutSizingVertical: 'FILL',
      };
      const r = translateLayoutSizing(p, dir);
      // HORIZONTAL: primary=horizontal → FILL means layoutGrow=1
      expect(r.primaryMode).toBe('AUTO');
      expect(r.layoutGrow).toBe(1);
      // HORIZONTAL: counter=vertical → FILL means layoutAlign=STRETCH
      expect(r.counterMode).toBe('AUTO');
      expect(r.layoutAlign).toBe('STRETCH');
    });

    it('FIXED horizontal + HUG vertical', () => {
      const p: AutoLayoutProps = {
        autoLayout: true,
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'HUG',
        width: 400,
      };
      const r = translateLayoutSizing(p, dir);
      expect(r.primaryMode).toBe('FIXED');
      expect(r.counterMode).toBe('AUTO');
    });
  });

  // ─── Defaults when no explicit sizing ───

  describe('defaults', () => {
    it('no sizing params + width → primary FIXED (VERTICAL)', () => {
      const p: AutoLayoutProps = { autoLayout: true, width: 300 };
      const r = translateLayoutSizing(p, 'VERTICAL');
      // VERTICAL: counter=horizontal, width provided → FIXED
      expect(r.counterMode).toBe('FIXED');
      // VERTICAL: primary=vertical, no height → AUTO (hug)
      expect(r.primaryMode).toBe('AUTO');
    });

    it('no sizing params + height → primary FIXED (VERTICAL)', () => {
      const p: AutoLayoutProps = { autoLayout: true, height: 400 };
      const r = translateLayoutSizing(p, 'VERTICAL');
      expect(r.primaryMode).toBe('FIXED');
      expect(r.counterMode).toBe('AUTO');
    });

    it('no sizing params + no dimensions → both AUTO', () => {
      const p: AutoLayoutProps = { autoLayout: true };
      const r = translateLayoutSizing(p, 'VERTICAL');
      expect(r.primaryMode).toBe('AUTO');
      expect(r.counterMode).toBe('AUTO');
    });
  });

  // ─── Partial specification ───

  describe('partial specification', () => {
    it('only layoutSizingHorizontal set → vertical uses default', () => {
      const p: AutoLayoutProps = {
        autoLayout: true,
        layoutSizingHorizontal: 'FILL',
        height: 200,
      };
      const r = translateLayoutSizing(p, 'VERTICAL');
      // horizontal FILL → counter STRETCH
      expect(r.layoutAlign).toBe('STRETCH');
      // vertical not set, height provided → FIXED (default)
      expect(r.primaryMode).toBe('FIXED');
    });

    it('only layoutSizingVertical set → horizontal uses default', () => {
      const p: AutoLayoutProps = {
        autoLayout: true,
        layoutSizingVertical: 'HUG',
        width: 300,
      };
      const r = translateLayoutSizing(p, 'VERTICAL');
      // vertical HUG → primary AUTO
      expect(r.primaryMode).toBe('AUTO');
      // horizontal not set, width provided → FIXED (default)
      expect(r.counterMode).toBe('FIXED');
    });
  });

  // ─── Stale state clearing ───

  describe('stale state clearing', () => {
    it('layoutGrow is always 0 when not FILL on primary', () => {
      const p: AutoLayoutProps = {
        autoLayout: true,
        layoutSizingHorizontal: 'HUG',
        layoutSizingVertical: 'FIXED',
        height: 200,
      };
      const r = translateLayoutSizing(p, 'HORIZONTAL');
      expect(r.layoutGrow).toBe(0);
      expect(r.layoutAlign).toBe('INHERIT');
    });

    it('layoutAlign is always INHERIT when not FILL on counter', () => {
      const p: AutoLayoutProps = {
        autoLayout: true,
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'HUG',
        width: 300,
      };
      const r = translateLayoutSizing(p, 'HORIZONTAL');
      expect(r.layoutGrow).toBe(0);
      expect(r.layoutAlign).toBe('INHERIT');
    });
  });
});

describe('translateSingleSizing', () => {
  it('FIXED primary → mode FIXED, no layoutGrow', () => {
    const r = translateSingleSizing('FIXED', 'primary');
    expect(r.mode).toBe('FIXED');
    expect(r.layoutGrow).toBeUndefined();
    expect(r.layoutAlign).toBeUndefined();
  });

  it('HUG primary → mode AUTO, no layoutGrow', () => {
    const r = translateSingleSizing('HUG', 'primary');
    expect(r.mode).toBe('AUTO');
    expect(r.layoutGrow).toBeUndefined();
  });

  it('FILL primary → mode AUTO + layoutGrow=1', () => {
    const r = translateSingleSizing('FILL', 'primary');
    expect(r.mode).toBe('AUTO');
    expect(r.layoutGrow).toBe(1);
    expect(r.layoutAlign).toBeUndefined();
  });

  it('FIXED counter → mode FIXED, no layoutAlign', () => {
    const r = translateSingleSizing('FIXED', 'counter');
    expect(r.mode).toBe('FIXED');
    expect(r.layoutAlign).toBeUndefined();
  });

  it('FILL counter → mode AUTO + layoutAlign=STRETCH', () => {
    const r = translateSingleSizing('FILL', 'counter');
    expect(r.mode).toBe('AUTO');
    expect(r.layoutAlign).toBe('STRETCH');
    expect(r.layoutGrow).toBeUndefined();
  });
});
