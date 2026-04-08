/**
 * Tests for DesignSession — design workflow state management.
 */

import { describe, expect, it } from 'vitest';
import { DesignSession } from '../../packages/core-mcp/src/design-session.js';

describe('DesignSession', () => {
  describe('mode state', () => {
    it('starts with unknown selectedLibrary and modeQueried=false', () => {
      const s = new DesignSession();
      expect(s.selectedLibrary).toBe(undefined);
      expect(s.modeQueried).toBe(false);
    });

    it('tracks selectedLibrary and modeQueried', () => {
      const s = new DesignSession();
      s.selectedLibrary = 'MyLib';
      s.modeQueried = true;
      expect(s.selectedLibrary).toBe('MyLib');
      expect(s.modeQueried).toBe(true);
    });

    it('setting modeQueried=false clears accumulated design state', () => {
      const s = new DesignSession();
      s.modeQueried = true;
      s.lastWorkflowHash = 'abc';
      s.designContextDefaults = { 'bg/primary': { name: 'Blue/500' } };
      s.mergeDesignDecisions({ fillsUsed: ['#FF0000'] });
      s.mergeDesignDecisions({ fillsUsed: ['#00FF00'] }, 'libraryFallback');

      // All state should be populated
      expect(s.lastWorkflowHash).toBe('abc');
      expect(s.designContextDefaults).not.toBeNull();
      expect(s.designDecisions?.fillsUsed).toEqual(['#FF0000']);
      expect(s.libraryFallbackDecisions?.fillsUsed).toEqual(['#00FF00']);

      // Reset via modeQueried = false
      s.modeQueried = false;
      expect(s.lastWorkflowHash).toBeNull();
      expect(s.designContextDefaults).toBeNull();
      expect(s.designDecisions).toBeNull();
      expect(s.libraryFallbackDecisions).toBeNull();
    });
  });

  describe('design decisions', () => {
    it('merges and deduplicates fills', () => {
      const s = new DesignSession();
      s.mergeDesignDecisions({ fillsUsed: ['#FF0000', '#00FF00'] });
      s.mergeDesignDecisions({ fillsUsed: ['#FF0000', '#0000FF'] });
      expect(s.designDecisions?.fillsUsed).toEqual(['#FF0000', '#00FF00', '#0000FF']);
    });

    it('merges fonts, radius, spacing independently', () => {
      const s = new DesignSession();
      s.mergeDesignDecisions({ fontsUsed: ['Inter'], radiusValues: [8], spacingValues: [16] });
      s.mergeDesignDecisions({ fontsUsed: ['Inter', 'Roboto'], radiusValues: [8, 12] });
      expect(s.designDecisions?.fontsUsed).toEqual(['Inter', 'Roboto']);
      expect(s.designDecisions?.radiusValues).toEqual([8, 12]);
      expect(s.designDecisions?.spacingValues).toEqual([16]);
    });

    it('tracks library fallback decisions separately', () => {
      const s = new DesignSession();
      s.mergeDesignDecisions({ fillsUsed: ['#111'] });
      s.mergeDesignDecisions({ fillsUsed: ['#222'] }, 'libraryFallback');
      expect(s.designDecisions?.fillsUsed).toEqual(['#111']);
      expect(s.libraryFallbackDecisions?.fillsUsed).toEqual(['#222']);
    });

    it('clearDesignDecisions clears both tracks', () => {
      const s = new DesignSession();
      s.mergeDesignDecisions({ fillsUsed: ['#111'] });
      s.mergeDesignDecisions({ fillsUsed: ['#222'] }, 'libraryFallback');
      s.clearDesignDecisions();
      expect(s.designDecisions).toBeNull();
      expect(s.libraryFallbackDecisions).toBeNull();
    });

    it('tracks elevation style', () => {
      const s = new DesignSession();
      s.mergeDesignDecisions({ elevationStyle: 'subtle' });
      expect(s.designDecisions?.elevationStyle).toBe('subtle');
      s.mergeDesignDecisions({ elevationStyle: 'elevated' });
      expect(s.designDecisions?.elevationStyle).toBe('elevated');
    });
  });

  describe('migration context', () => {
    it('saves and consumes migration context', () => {
      const s = new DesignSession();
      s.mergeDesignDecisions({ fillsUsed: ['#FF0000'], fontsUsed: ['Inter'] });
      s.saveMigrationContext();

      const ctx = s.consumeMigrationContext();
      expect(ctx?.fillsUsed).toEqual(['#FF0000']);
      expect(ctx?.fontsUsed).toEqual(['Inter']);

      // Second consume returns null (cleared)
      expect(s.consumeMigrationContext()).toBeNull();
    });

    it('returns null if no design decisions when saving', () => {
      const s = new DesignSession();
      s.saveMigrationContext();
      expect(s.consumeMigrationContext()).toBeNull();
    });
  });

  describe('REST component cache', () => {
    it('caches and retrieves by fileKey', () => {
      const s = new DesignSession();
      const data = { componentSets: [] };
      s.setRestComponentCache('file123', data);
      expect(s.getRestComponentCache('file123')).toBe(data);
    });

    it('returns null for mismatched fileKey', () => {
      const s = new DesignSession();
      s.setRestComponentCache('file123', { componentSets: [] });
      expect(s.getRestComponentCache('otherFile')).toBeNull();
    });

    it('returns null when no cache set', () => {
      const s = new DesignSession();
      expect(s.getRestComponentCache('file123')).toBeNull();
    });
  });

  describe('reset', () => {
    it('clears all state', () => {
      const s = new DesignSession();
      s.selectedLibrary = 'MyLib';
      s.modeQueried = true;
      s.lastWorkflowHash = 'hash';
      s.designContextDefaults = { bg: { name: 'Blue' } };
      s.mergeDesignDecisions({ fillsUsed: ['#FF0000'] });
      s.mergeDesignDecisions({ fillsUsed: ['#00FF00'] }, 'libraryFallback');
      s.saveMigrationContext();
      s.setRestComponentCache('file', {});

      s.reset();

      expect(s.selectedLibrary).toBe(undefined);
      expect(s.modeQueried).toBe(false);
      expect(s.lastWorkflowHash).toBeNull();
      expect(s.designContextDefaults).toBeNull();
      expect(s.designDecisions).toBeNull();
      expect(s.libraryFallbackDecisions).toBeNull();
      expect(s.consumeMigrationContext()).toBeNull();
      expect(s.getRestComponentCache('file')).toBeNull();
    });
  });
});
