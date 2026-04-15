/**
 * Tests for applyPublishableMetadata and stripPublishableMetadata helpers.
 *
 * These back the shared metadata path used by update_component, create_component
 * (createSingleComponent), and create_component_from_node. Coverage here means
 * the documentationLinks length ≤ 1 guard only lives in one place, and all 3
 * entry points get the guarantee for free.
 */

import { describe, expect, it } from 'vitest';
import { HandlerError } from '../../packages/adapter-figma/src/utils/handler-error.js';
import {
  applyPublishableMetadata,
  stripPublishableMetadata,
} from '../../packages/adapter-figma/src/utils/publishable-metadata.js';

// Minimal stand-in for the PublishableMixin surface we write to. The helper
// only touches 3 fields, so a plain object with those fields is sufficient —
// no need to mock the whole Figma ComponentNode interface.
interface MockComponent {
  description: string;
  descriptionMarkdown: string;
  documentationLinks: ReadonlyArray<{ uri: string }>;
}

function makeMockComponent(): MockComponent {
  return {
    description: '',
    descriptionMarkdown: '',
    documentationLinks: [],
  };
}

describe('applyPublishableMetadata', () => {
  it('writes description when provided', () => {
    const comp = makeMockComponent();
    applyPublishableMetadata(comp as never, { description: 'Primary button' });
    expect(comp.description).toBe('Primary button');
  });

  it('writes descriptionMarkdown when provided', () => {
    const comp = makeMockComponent();
    applyPublishableMetadata(comp as never, { descriptionMarkdown: '**Bold** description' });
    expect(comp.descriptionMarkdown).toBe('**Bold** description');
  });

  it('writes both description and descriptionMarkdown together', () => {
    const comp = makeMockComponent();
    applyPublishableMetadata(comp as never, {
      description: 'Plain text',
      descriptionMarkdown: '**Rich** text',
    });
    expect(comp.description).toBe('Plain text');
    expect(comp.descriptionMarkdown).toBe('**Rich** text');
  });

  it('wraps documentationLinks strings into {uri} shape', () => {
    const comp = makeMockComponent();
    applyPublishableMetadata(comp as never, {
      documentationLinks: ['https://example.com/docs'],
    });
    expect(comp.documentationLinks).toEqual([{ uri: 'https://example.com/docs' }]);
  });

  it('accepts empty documentationLinks array to clear', () => {
    const comp = makeMockComponent();
    // Start with a link, then clear it
    comp.documentationLinks = [{ uri: 'https://old.example.com' }];
    applyPublishableMetadata(comp as never, { documentationLinks: [] });
    expect(comp.documentationLinks).toEqual([]);
  });

  it('throws DOCUMENTATION_LINKS_LIMIT when documentationLinks.length > 1', () => {
    const comp = makeMockComponent();
    const exec = () =>
      applyPublishableMetadata(comp as never, {
        documentationLinks: ['https://a.com', 'https://b.com'],
      });
    expect(exec).toThrow(HandlerError);
    expect(exec).toThrow(/at most 1 entry/);
    expect(exec).toThrow(/Figma Plugin API current limit/);
    expect(exec).toThrow(/got 2/);
  });

  it('throws with DOCUMENTATION_LINKS_LIMIT error code', () => {
    const comp = makeMockComponent();
    try {
      applyPublishableMetadata(comp as never, {
        documentationLinks: ['https://a.com', 'https://b.com', 'https://c.com'],
      });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HandlerError);
      expect((err as HandlerError).code).toBe('DOCUMENTATION_LINKS_LIMIT');
      // Message must point the agent at descriptionMarkdown as the workaround
      expect((err as HandlerError).message).toMatch(/descriptionMarkdown/);
      // Message must name this as a Figma platform restriction, not figcraft's
      expect((err as HandlerError).message).toMatch(/Figma platform restriction/);
    }
  });

  it('skips undefined fields without touching the component', () => {
    const comp = makeMockComponent();
    comp.description = 'existing';
    comp.descriptionMarkdown = 'existing md';
    applyPublishableMetadata(comp as never, {});
    expect(comp.description).toBe('existing');
    expect(comp.descriptionMarkdown).toBe('existing md');
  });

  it('skips null fields without touching the component', () => {
    const comp = makeMockComponent();
    comp.description = 'existing';
    applyPublishableMetadata(comp as never, {
      description: null,
      descriptionMarkdown: null,
      documentationLinks: null,
    });
    expect(comp.description).toBe('existing');
  });

  it('writes empty string to description (not skipped)', () => {
    // empty string is a valid value (clears the description) — the helper
    // treats `null`/`undefined` as "skip" but `""` as "write empty"
    const comp = makeMockComponent();
    comp.description = 'old';
    applyPublishableMetadata(comp as never, { description: '' });
    expect(comp.description).toBe('');
  });

  it('applies all 3 fields in a single call', () => {
    const comp = makeMockComponent();
    applyPublishableMetadata(comp as never, {
      description: 'Plain',
      descriptionMarkdown: '**Rich**',
      documentationLinks: ['https://docs.example.com'],
    });
    expect(comp.description).toBe('Plain');
    expect(comp.descriptionMarkdown).toBe('**Rich**');
    expect(comp.documentationLinks).toEqual([{ uri: 'https://docs.example.com' }]);
  });
});

describe('stripPublishableMetadata', () => {
  it('removes description, descriptionMarkdown, and documentationLinks', () => {
    const params: Record<string, unknown> = {
      description: 'Plain',
      descriptionMarkdown: '**Rich**',
      documentationLinks: ['https://example.com'],
      name: 'Button',
      width: 160,
    };
    stripPublishableMetadata(params);
    expect(params).toEqual({ name: 'Button', width: 160 });
  });

  it('leaves non-metadata fields untouched', () => {
    const params: Record<string, unknown> = {
      name: 'Button',
      width: 160,
      height: 48,
      fill: '#4F46E5',
      cornerRadius: 8,
    };
    stripPublishableMetadata(params);
    expect(params).toEqual({
      name: 'Button',
      width: 160,
      height: 48,
      fill: '#4F46E5',
      cornerRadius: 8,
    });
  });

  it('is idempotent when called twice', () => {
    const params: Record<string, unknown> = {
      description: 'to remove',
      name: 'Button',
    };
    stripPublishableMetadata(params);
    stripPublishableMetadata(params);
    expect(params).toEqual({ name: 'Button' });
  });

  it('returns the same object reference (mutates in place)', () => {
    const params: Record<string, unknown> = { description: 'x', name: 'y' };
    const returned = stripPublishableMetadata(params);
    expect(returned).toBe(params);
  });

  it('handles empty input without throwing', () => {
    const params: Record<string, unknown> = {};
    expect(() => stripPublishableMetadata(params)).not.toThrow();
    expect(params).toEqual({});
  });
});
