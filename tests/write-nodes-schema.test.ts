/**
 * Tests for create_document — validates the flat Zod schema accepts valid
 * node specs, and the MCP-side runtime validation catches invalid input.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// ─── Schema (mirrors src/mcp-server/tools/write-nodes.ts) ───
const createDocumentSchema = z.object({
  parentId: z.string().optional(),
  nodes: z.array(z.record(z.unknown())),
});

// ─── Runtime validation (mirrors the handler's validateTypes) ───
const VALID_TYPES = new Set(['frame', 'text', 'rectangle', 'ellipse', 'line', 'vector', 'instance']);

function validateTypes(specs: Array<Record<string, unknown>>, path: string): string | null {
  for (let i = 0; i < specs.length; i++) {
    const t = specs[i].type;
    if (!t || !VALID_TYPES.has(t as string)) {
      return `${path}[${i}].type is ${t === undefined ? 'missing' : `"${t}" (invalid)`}. Must be one of: ${[...VALID_TYPES].join(', ')}`;
    }
    if (Array.isArray(specs[i].children)) {
      const childErr = validateTypes(specs[i].children as Array<Record<string, unknown>>, `${path}[${i}].children`);
      if (childErr) return childErr;
    }
  }
  return null;
}

function validate(input: unknown): { ok: boolean; error?: string } {
  const parsed = createDocumentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  const { nodes } = parsed.data;
  if (!nodes || nodes.length === 0) return { ok: false, error: 'nodes array must not be empty' };
  const typeErr = validateTypes(nodes, 'nodes');
  if (typeErr) return { ok: false, error: typeErr };
  return { ok: true };
}

describe('create_document schema + runtime validation', () => {
  // ─── Valid inputs ───

  it('accepts frame with text children', () => {
    const r = validate({
      nodes: [{
        type: 'frame', name: 'Card',
        props: { width: 300, height: 200, fill: '#FFFFFF' },
        children: [
          { type: 'text', name: 'Title', props: { content: 'Hello', fontSize: 18 } },
        ],
      }],
    });
    expect(r.ok).toBe(true);
  });

  it('accepts all 7 node types', () => {
    const r = validate({
      nodes: [
        { type: 'frame', name: 'F' },
        { type: 'text', props: { content: 'T' } },
        { type: 'rectangle', props: { width: 50, height: 50 } },
        { type: 'ellipse', props: { width: 40, height: 40 } },
        { type: 'line', props: { length: 100 } },
        { type: 'vector', props: { svg: '<svg><rect width="10" height="10"/></svg>' } },
        { type: 'instance', props: { componentKey: 'abc123' } },
      ],
    });
    expect(r.ok).toBe(true);
  });

  it('accepts vector with resize array', () => {
    const r = validate({
      nodes: [{ type: 'vector', props: { svg: '<svg/>', resize: [20, 20] } }],
    });
    expect(r.ok).toBe(true);
  });

  it('accepts instance with componentId and properties', () => {
    const r = validate({
      nodes: [{
        type: 'instance', name: 'Button',
        props: { componentId: '1:23', properties: { Size: 'Large' } },
      }],
    });
    expect(r.ok).toBe(true);
  });

  it('accepts parentId', () => {
    const r = validate({ parentId: '1:23', nodes: [{ type: 'frame' }] });
    expect(r.ok).toBe(true);
  });

  it('accepts deeply nested children (flat schema allows any depth)', () => {
    const r = validate({
      nodes: [{
        type: 'frame', children: [{
          type: 'frame', children: [{
            type: 'frame', children: [{ type: 'text', props: { content: 'deep' } }],
          }],
        }],
      }],
    });
    expect(r.ok).toBe(true);
  });

  // ─── Invalid inputs ───

  it('rejects empty nodes array', () => {
    const r = validate({ nodes: [] });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('empty');
  });

  it('rejects missing nodes', () => {
    const parsed = createDocumentSchema.safeParse({});
    expect(parsed.success).toBe(false);
  });

  it('rejects unknown top-level type', () => {
    const r = validate({ nodes: [{ type: 'component', name: 'Bad' }] });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('nodes[0].type');
    expect(r.error).toContain('invalid');
  });

  it('rejects missing type on top-level node', () => {
    const r = validate({ nodes: [{ name: 'NoType' }] });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('nodes[0].type');
    expect(r.error).toContain('missing');
  });

  it('rejects invalid type in nested children', () => {
    const r = validate({
      nodes: [{
        type: 'frame', children: [
          { type: 'text', props: { content: 'ok' } },
          { type: 'div', props: {} },
        ],
      }],
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('nodes[0].children[1].type');
    expect(r.error).toContain('"div"');
  });

  it('rejects missing type in deeply nested children', () => {
    const r = validate({
      nodes: [{
        type: 'frame', children: [{
          type: 'frame', children: [{ name: 'oops' }],
        }],
      }],
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('nodes[0].children[0].children[0].type');
    expect(r.error).toContain('missing');
  });
});
