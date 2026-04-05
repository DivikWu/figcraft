/**
 * Tests for content warnings detection.
 */

import { describe, expect, it } from 'vitest';
import { detectContentWarnings } from '../../packages/core-mcp/src/tools/logic/content-warnings.js';

describe('detectContentWarnings', () => {
  it('detects Lorem ipsum in text content', () => {
    const warnings = detectContentWarnings({
      name: 'Card',
      children: [{ type: 'text', content: 'Lorem ipsum dolor sit amet', name: 'Body' }],
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0].type).toBe('placeholder-text');
    expect(warnings[0].message).toContain('Lorem ipsum');
  });

  it('detects generic placeholder labels', () => {
    const warnings = detectContentWarnings({
      name: 'Screen',
      children: [
        { type: 'text', content: 'Button', name: 'CTA' },
        { type: 'text', content: 'Title', name: 'Heading' },
      ],
    });
    expect(warnings).toHaveLength(2);
    expect(warnings[0].message).toContain('"Button"');
    expect(warnings[1].message).toContain('"Title"');
  });

  it('is case-insensitive for placeholder labels', () => {
    const warnings = detectContentWarnings({
      children: [{ type: 'text', content: 'BUTTON' }],
    });
    expect(warnings).toHaveLength(1);
  });

  it('returns empty for real content', () => {
    const warnings = detectContentWarnings({
      name: 'Card',
      children: [
        { type: 'text', content: 'Welcome back, Sarah', name: 'Greeting' },
        { type: 'text', content: 'Your order has shipped', name: 'Status' },
      ],
    });
    expect(warnings).toHaveLength(0);
  });

  it('recurses into nested children', () => {
    const warnings = detectContentWarnings({
      name: 'Page',
      children: [
        {
          type: 'frame',
          name: 'Section',
          children: [{ type: 'text', content: 'Lorem ipsum dolor', name: 'Nested' }],
        },
      ],
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0].path).toContain('Section');
  });

  it('handles batch items', () => {
    const warnings = detectContentWarnings({
      items: [
        { name: 'Screen1', children: [{ type: 'text', content: 'Placeholder' }] },
        { name: 'Screen2', children: [{ type: 'text', content: 'Real content here' }] },
      ],
    });
    expect(warnings).toHaveLength(1);
  });

  it('truncates long content in warning', () => {
    const warnings = detectContentWarnings({
      children: [
        { type: 'text', content: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor' },
      ],
    });
    expect(warnings).toHaveLength(1); // one warning per text node (breaks after first match)
    expect(warnings[0].content).toContain('…');
  });

  it('does not flag partial word matches', () => {
    const warnings = detectContentWarnings({
      children: [
        { type: 'text', content: 'Buttons and titles overview' }, // "Buttons" is not "Button"
      ],
    });
    expect(warnings).toHaveLength(0);
  });

  it('handles text param alias', () => {
    const warnings = detectContentWarnings({
      children: [{ type: 'text', text: 'Title' }],
    });
    expect(warnings).toHaveLength(1);
  });
});
