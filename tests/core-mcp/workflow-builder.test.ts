/**
 * Tests for buildWorkflow — pure function that constructs _workflow for get_mode.
 */

import { describe, expect, it } from 'vitest';
import { buildWorkflow, type WorkflowInput } from '../../packages/core-mcp/src/tools/logic/workflow-builder.js';

function baseInput(overrides: Partial<WorkflowInput> = {}): WorkflowInput {
  return {
    selectedLibrary: null,
    designDecisions: null,
    libraryFallbackDecisions: null,
    designContext: null,
    localComponents: undefined,
    migrationContext: null,
    ...overrides,
  };
}

describe('buildWorkflow', () => {
  describe('mode selection', () => {
    it('returns design-creator when no library', () => {
      const w = buildWorkflow(baseInput());
      expect(w.mode).toBe('design-creator');
      expect(w.description as string).toContain('Creator mode');
    });

    it('returns design-guardian when library selected', () => {
      const w = buildWorkflow(baseInput({ selectedLibrary: 'MyLib' }));
      expect(w.mode).toBe('design-guardian');
      expect(w.description as string).toContain('Library mode');
    });

    it('returns design-guardian with local description for __local__', () => {
      const w = buildWorkflow(
        baseInput({
          selectedLibrary: '__local__',
          designContext: { colorVariables: [{ name: 'bg' }] },
        }),
      );
      expect(w.mode).toBe('design-guardian');
      expect(w.description as string).toContain('Local mode');
    });
  });

  describe('creator mode — design decisions injection', () => {
    it('includes established palette when design decisions exist', () => {
      const w = buildWorkflow(
        baseInput({
          designDecisions: {
            fillsUsed: ['#FF0000', '#00FF00'],
            fontsUsed: ['Inter'],
            radiusValues: [8],
            spacingValues: [16],
          },
        }),
      );
      const preflight = w.designPreflight as Record<string, unknown>;
      expect(preflight.colorRules as string).toContain('#FF0000');
      expect(preflight.colorRules as string).toContain('Established palette');
      expect(preflight.typographyRules as string).toContain('Inter');
      expect(preflight.establishedPalette).toBeDefined();
    });

    it('uses default color rules when no design decisions', () => {
      const w = buildWorkflow(baseInput());
      const preflight = w.designPreflight as Record<string, unknown>;
      expect(preflight.colorRules as string).toContain('1 dominant + 1 accent');
    });
  });

  describe('library mode — token binding', () => {
    it('includes token binding step in creationSteps', () => {
      const w = buildWorkflow(baseInput({ selectedLibrary: 'MyLib' }));
      const steps = w.creationSteps as string[];
      expect(steps[0]).toContain('TOKEN BINDING');
    });

    it('includes library component instance step', () => {
      const w = buildWorkflow(baseInput({ selectedLibrary: 'MyLib' }));
      const steps = w.creationSteps as string[];
      expect(steps[1]).toContain('COMPONENT INSTANCES');
    });

    it('includes library fallback consistency in colorRules', () => {
      const w = buildWorkflow(
        baseInput({
          selectedLibrary: 'MyLib',
          libraryFallbackDecisions: {
            fillsUsed: ['#AABBCC'],
            fontsUsed: [],
            radiusValues: [],
            spacingValues: [],
          },
        }),
      );
      const preflight = w.designPreflight as Record<string, unknown>;
      expect(preflight.colorRules as string).toContain('#AABBCC');
      expect(preflight.colorRules as string).toContain('Fallback consistency');
    });
  });

  describe('__local__ mode — sparse token fallback', () => {
    it('falls back to creator rules when no local tokens', () => {
      const w = buildWorkflow(
        baseInput({
          selectedLibrary: '__local__',
          designContext: { colorVariables: [], textStyles: [] },
          localComponents: undefined,
        }),
      );
      expect(w.localTokensEmpty).toBe(true);
      expect(w.description as string).toContain('Local mode (empty)');
      expect(w.searchBehavior as string).toContain('empty results');
    });

    it('preserves component step when local components exist but no tokens', () => {
      const w = buildWorkflow(
        baseInput({
          selectedLibrary: '__local__',
          designContext: { colorVariables: [] },
          localComponents: { componentSets: [{ id: '1', name: 'Button' }], standalone: [] },
        }),
      );
      expect(w.localTokensEmpty).toBe(true);
      // Component step should still be present
      const steps = w.creationSteps as string[];
      const hasComponentStep = steps.some((s) => s.includes('LOCAL COMPONENT INSTANCES'));
      expect(hasComponentStep).toBe(true);
      expect(w.searchBehavior as string).toContain('local components exist');
    });

    it('keeps tokens and components when local tokens exist', () => {
      const w = buildWorkflow(
        baseInput({
          selectedLibrary: '__local__',
          designContext: { colorVariables: [{ name: 'primary', value: '#FF0000' }] },
        }),
      );
      expect(w.localTokensEmpty).toBeUndefined();
      expect(w.description as string).toContain('Local mode');
      expect(w.description as string).not.toContain('empty');
    });
  });

  describe('migration context', () => {
    it('injects migration context when switching creator → library', () => {
      const w = buildWorkflow(
        baseInput({
          selectedLibrary: 'MyLib',
          migrationContext: {
            fillsUsed: ['#FF0000'],
            fontsUsed: ['Inter'],
            radiusValues: [8],
            spacingValues: [16],
          },
        }),
      );
      const migration = w.migrationContext as Record<string, unknown>;
      expect(migration).toBeDefined();
      expect(migration.priorColors).toEqual(['#FF0000']);
      expect(migration.priorFonts).toEqual(['Inter']);
    });

    it('does not inject migration context in creator mode', () => {
      const w = buildWorkflow(
        baseInput({
          migrationContext: {
            fillsUsed: ['#FF0000'],
            fontsUsed: [],
            radiusValues: [],
            spacingValues: [],
          },
        }),
      );
      expect(w.migrationContext).toBeUndefined();
    });
  });

  describe('search behavior', () => {
    it('disables search in creator mode', () => {
      const w = buildWorkflow(baseInput());
      expect(w.searchBehavior as string).toContain('disabled');
    });

    it('enables mandatory search in library mode', () => {
      const w = buildWorkflow(baseInput({ selectedLibrary: 'MyLib' }));
      expect(w.searchBehavior as string).toContain('MANDATORY');
    });

    it('uses local search description for __local__ with tokens', () => {
      const w = buildWorkflow(
        baseInput({
          selectedLibrary: '__local__',
          designContext: { colorVariables: [{ name: 'x' }] },
        }),
      );
      expect(w.searchBehavior as string).toContain('local variables and styles');
    });
  });

  describe('structural completeness', () => {
    it('always includes designPreflight, creationSteps, toolBehavior, references, nextAction', () => {
      for (const lib of [null, 'MyLib', '__local__']) {
        const w = buildWorkflow(
          baseInput({
            selectedLibrary: lib,
            designContext: lib === '__local__' ? { colorVariables: [{ name: 'x' }] } : null,
          }),
        );
        expect(w.designPreflight).toBeDefined();
        expect(Array.isArray(w.creationSteps)).toBe(true);
        expect((w.creationSteps as string[]).length).toBeGreaterThan(0);
        expect(w.toolBehavior).toBeDefined();
        expect(w.references).toBeDefined();
        expect(w.nextAction).toBeDefined();
      }
    });

    it('filters null steps from creationSteps', () => {
      const w = buildWorkflow(baseInput()); // creator mode: no token/component steps
      const steps = w.creationSteps as string[];
      expect(steps.every((s) => s !== null && s !== undefined)).toBe(true);
    });
  });
});
