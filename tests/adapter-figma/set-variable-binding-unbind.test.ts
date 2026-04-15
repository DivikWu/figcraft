/**
 * Fix 1: set_variable_binding supports unbind.
 *
 * Prior to this fix, the handler hard-asserted a non-empty variableId and
 * required `figma.variables.getVariableByIdAsync` to resolve. Once an agent
 * bound the wrong variable to a node, the only way to revert was to rebind to
 * a different variable — there was no path to literally REMOVE the binding.
 *
 * The unbind path is triggered when variableId is null/undefined/empty:
 *   - fills/strokes → setBoundVariableForPaint(paint, 'color', null)
 *   - other bindable fields → setBoundVariable(field, null)
 *
 * These tests pin the unbind branches and confirm that unbind response shape
 * includes `action: 'unbound'` so callers can distinguish.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../packages/adapter-figma/src/utils/node-lookup.js', () => ({
  findNodeByIdAsync: vi.fn(),
}));

import { registerWriteVariableHandlers } from '../../packages/adapter-figma/src/handlers/write-variables.js';
import { handlers } from '../../packages/adapter-figma/src/registry.js';
import { findNodeByIdAsync } from '../../packages/adapter-figma/src/utils/node-lookup.js';

type MockedFindNode = ReturnType<typeof vi.fn>;

function createMockFigma() {
  return {
    variables: {
      getVariableByIdAsync: vi.fn(),
      setBoundVariableForPaint: vi.fn(),
    },
  };
}

describe('set_variable_binding unbind (Fix 1)', () => {
  beforeEach(() => {
    handlers.clear();
    vi.stubGlobal('figma', createMockFigma());
    registerWriteVariableHandlers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    handlers.clear();
  });

  it('unbinds a fill paint when variableId is omitted', async () => {
    const paint = {
      type: 'SOLID',
      color: { r: 1, g: 0, b: 0 },
      boundVariables: { color: { id: 'VariableID:1:2', type: 'VARIABLE_ALIAS' } },
    };
    const node = {
      id: 'rect:1',
      type: 'RECTANGLE',
      setBoundVariable: vi.fn(),
      fills: [paint],
    };
    (findNodeByIdAsync as MockedFindNode).mockResolvedValue(node);

    // Plugin API returns a "bare" paint when color is set to null.
    const barePaint = { type: 'SOLID', color: { r: 1, g: 0, b: 0 } };
    (figma.variables.setBoundVariableForPaint as ReturnType<typeof vi.fn>).mockReturnValue(barePaint);

    const handler = handlers.get('set_variable_binding');
    const response = (await handler!({
      nodeId: 'rect:1',
      field: 'fills',
      // variableId omitted → unbind path
    })) as { ok: boolean; action: string };

    expect(response.ok).toBe(true);
    expect(response.action).toBe('unbound');
    // setBoundVariableForPaint must be called with null (the unbind signal).
    expect(figma.variables.setBoundVariableForPaint).toHaveBeenCalledWith(paint, 'color', null);
    // The paint array must be rewritten with the bare paint.
    expect(node.fills[0]).toBe(barePaint);
    // getVariableByIdAsync must NOT be called — there's no variable to look up.
    expect(figma.variables.getVariableByIdAsync).not.toHaveBeenCalled();
  });

  it('unbinds a stroke paint when variableId is explicit null', async () => {
    const paint = { type: 'SOLID', color: { r: 0, g: 0, b: 1 } };
    const node = {
      id: 'rect:2',
      type: 'RECTANGLE',
      setBoundVariable: vi.fn(),
      // Figma GeometryMixin exposes both fills and strokes. The handler
      // gates the paint branch on `'fills' in node`, so the mock must carry
      // a fills array even when we're testing the strokes field.
      fills: [],
      strokes: [paint],
    };
    (findNodeByIdAsync as MockedFindNode).mockResolvedValue(node);
    (figma.variables.setBoundVariableForPaint as ReturnType<typeof vi.fn>).mockReturnValue(paint);

    const handler = handlers.get('set_variable_binding');
    const response = (await handler!({
      nodeId: 'rect:2',
      field: 'strokes',
      variableId: null,
    })) as { ok: boolean; action: string };

    expect(response.action).toBe('unbound');
    expect(figma.variables.setBoundVariableForPaint).toHaveBeenCalledWith(paint, 'color', null);
  });

  it('unbinds only the requested paintIndex, leaving sibling paints untouched', async () => {
    // Multi-paint node: paint[0] and paint[2] have bindings we DON'T want to
    // touch. We target paint[1] for unbind. This pins the per-index semantics
    // of set_variable_binding so a future refactor can't accidentally clear
    // the whole fills array.
    const paint0 = {
      type: 'SOLID',
      color: { r: 1, g: 0, b: 0 },
      boundVariables: { color: { id: 'VariableID:A', type: 'VARIABLE_ALIAS' } },
    };
    const paint1 = {
      type: 'SOLID',
      color: { r: 0, g: 1, b: 0 },
      boundVariables: { color: { id: 'VariableID:B', type: 'VARIABLE_ALIAS' } },
    };
    const paint2 = {
      type: 'SOLID',
      color: { r: 0, g: 0, b: 1 },
      boundVariables: { color: { id: 'VariableID:C', type: 'VARIABLE_ALIAS' } },
    };
    const node = {
      id: 'rect:multi',
      type: 'RECTANGLE',
      setBoundVariable: vi.fn(),
      fills: [paint0, paint1, paint2],
    };
    (findNodeByIdAsync as MockedFindNode).mockResolvedValue(node);

    const barePaint1 = { type: 'SOLID', color: { r: 0, g: 1, b: 0 } };
    (figma.variables.setBoundVariableForPaint as ReturnType<typeof vi.fn>).mockReturnValue(barePaint1);

    const handler = handlers.get('set_variable_binding');
    const response = (await handler!({
      nodeId: 'rect:multi',
      field: 'fills',
      paintIndex: 1,
      // variableId omitted → unbind
    })) as { ok: boolean; action: string };

    expect(response.action).toBe('unbound');
    // Only paint[1] should have been passed to setBoundVariableForPaint.
    expect(figma.variables.setBoundVariableForPaint).toHaveBeenCalledTimes(1);
    expect(figma.variables.setBoundVariableForPaint).toHaveBeenCalledWith(paint1, 'color', null);
    // Paints 0 and 2 must retain their original (still-bound) state.
    expect(node.fills[0]).toBe(paint0);
    expect(node.fills[0].boundVariables.color.id).toBe('VariableID:A');
    expect(node.fills[1]).toBe(barePaint1);
    expect(node.fills[2]).toBe(paint2);
    expect(node.fills[2].boundVariables.color.id).toBe('VariableID:C');
  });

  it('unbinds a non-paint bindable field via setBoundVariable(field, null)', async () => {
    const setBoundVariableSpy = vi.fn();
    const node = {
      id: 'frame:1',
      type: 'FRAME',
      setBoundVariable: setBoundVariableSpy,
    };
    (findNodeByIdAsync as MockedFindNode).mockResolvedValue(node);

    const handler = handlers.get('set_variable_binding');
    const response = (await handler!({
      nodeId: 'frame:1',
      field: 'width',
      variableId: '',
    })) as { ok: boolean; action: string };

    expect(response.action).toBe('unbound');
    expect(setBoundVariableSpy).toHaveBeenCalledWith('width', null);
  });

  it('still performs bind when variableId is provided', async () => {
    const paint = { type: 'SOLID', color: { r: 0, g: 0, b: 0 } };
    const node = {
      id: 'rect:3',
      type: 'RECTANGLE',
      setBoundVariable: vi.fn(),
      fills: [paint],
    };
    (findNodeByIdAsync as MockedFindNode).mockResolvedValue(node);

    const variable = { id: 'VariableID:1:2', name: 'color/brand/primary' };
    (figma.variables.getVariableByIdAsync as ReturnType<typeof vi.fn>).mockResolvedValue(variable);
    (figma.variables.setBoundVariableForPaint as ReturnType<typeof vi.fn>).mockReturnValue({
      ...paint,
      boundVariables: { color: { id: variable.id, type: 'VARIABLE_ALIAS' } },
    });

    const handler = handlers.get('set_variable_binding');
    const response = (await handler!({
      nodeId: 'rect:3',
      field: 'fills',
      variableId: 'VariableID:1:2',
    })) as { ok: boolean; action: string };

    expect(response.action).toBe('bound');
    expect(figma.variables.getVariableByIdAsync).toHaveBeenCalledWith('VariableID:1:2');
    expect(figma.variables.setBoundVariableForPaint).toHaveBeenCalledWith(paint, 'color', variable);
  });

  it('throws when variableId is provided but the variable does not exist', async () => {
    const node = {
      id: 'rect:4',
      type: 'RECTANGLE',
      setBoundVariable: vi.fn(),
      fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }],
    };
    (findNodeByIdAsync as MockedFindNode).mockResolvedValue(node);
    (figma.variables.getVariableByIdAsync as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const handler = handlers.get('set_variable_binding');
    await expect(
      handler!({
        nodeId: 'rect:4',
        field: 'fills',
        variableId: 'VariableID:does:not:exist',
      }),
    ).rejects.toThrow(/Variable not found/);
  });
});
