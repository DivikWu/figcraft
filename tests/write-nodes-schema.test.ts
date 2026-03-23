/**
 * Tests for create_document — validates the recursive node-spec Zod schema
 * and the MCP-side runtime validation catches invalid semantic input.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

const VALID_TYPES = new Set(['frame', 'text', 'rectangle', 'ellipse', 'line', 'vector', 'instance']);
const VALID_ROLES = new Set([
  'screen', 'header', 'hero', 'nav', 'content', 'list', 'row', 'stats', 'card',
  'form', 'field', 'input', 'button', 'footer', 'actions', 'social_row', 'system_bar',
]);

// ─── Schema (mirrors src/mcp-server/tools/write-nodes.ts) ───
const nodeRoleSchema = z.enum([
  'screen', 'header', 'hero', 'nav', 'content', 'list', 'row', 'stats', 'card',
  'form', 'field', 'input', 'button', 'footer', 'actions', 'social_row', 'system_bar',
]);

const nodeTypeSchema = z.enum(['frame', 'text', 'rectangle', 'ellipse', 'line', 'vector', 'instance']);

const nodeSpecSchema: z.ZodType<Record<string, unknown>> = z.lazy(() =>
  z.object({
    type: nodeTypeSchema,
    name: z.string().optional(),
    role: nodeRoleSchema.optional(),
    props: z.record(z.unknown()).optional(),
    children: z.array(nodeSpecSchema).optional(),
  }),
);

const createDocumentSchema = z.object({
  parentId: z.string().optional(),
  nodes: z.array(nodeSpecSchema),
});

// ─── Runtime validation (mirrors the handler's validateTypes) ───

function normalizeRole(role: string): string {
  return role.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function validateTypes(specs: Array<Record<string, unknown>>, path: string): string | null {
  for (let i = 0; i < specs.length; i++) {
    const t = specs[i].type;
    if (!t || !VALID_TYPES.has(t as string)) {
      return `${path}[${i}].type is ${t === undefined ? 'missing' : `"${t}" (invalid)`}. Must be one of: ${[...VALID_TYPES].join(', ')}`;
    }
    const role = specs[i].role;
    if (role != null) {
      if (typeof role !== 'string' || !VALID_ROLES.has(normalizeRole(role))) {
        return `${path}[${i}].role is ${typeof role === 'string' ? `"${role}" (invalid)` : `${String(role)} (invalid)`}. Must be one of: ${[...VALID_ROLES].join(', ')}`;
      }
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

  it('accepts canonical role values like social_row', () => {
    const r = validate({
      nodes: [{ type: 'frame', role: 'social_row', name: 'Social Row' }],
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

  it('accepts deeply nested children', () => {
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
    const parsed = createDocumentSchema.safeParse({ nodes: [{ type: 'component', name: 'Bad' }] });
    expect(parsed.success).toBe(false);
  });

  it('rejects missing type on top-level node', () => {
    const parsed = createDocumentSchema.safeParse({ nodes: [{ name: 'NoType' }] });
    expect(parsed.success).toBe(false);
  });

  it('rejects invalid direct role values at schema level', () => {
    const parsed = createDocumentSchema.safeParse({ nodes: [{ type: 'frame', role: 'banana' }] });
    expect(parsed.success).toBe(false);
  });

  it('rejects invalid nested type at schema level', () => {
    const parsed = createDocumentSchema.safeParse({
      nodes: [{
        type: 'frame',
        children: [{ type: 'div', props: {} }],
      }],
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects missing type in deeply nested children at schema level', () => {
    const parsed = createDocumentSchema.safeParse({
      nodes: [{
        type: 'frame', children: [{
          type: 'frame', children: [{ name: 'oops' }],
        }],
      }],
    });
    expect(parsed.success).toBe(false);
  });
});
