/**
 * Tests for 3-tier access control (read / create / edit).
 *
 * Validates that the generated registry correctly classifies tools
 * and that the access control logic blocks the right tools at each level.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  GENERATED_WRITE_TOOLS,
  GENERATED_CREATE_TOOLS,
  GENERATED_EDIT_TOOLS,
  GENERATED_CORE_TOOLS,
  GENERATED_TOOLSETS,
} from '../../packages/core-mcp/src/tools/_registry.js';

// ─── Registry invariant tests (static, no env mocking needed) ───

describe('access control registry', () => {
  it('CREATE_TOOLS + EDIT_TOOLS = WRITE_TOOLS (no overlap, no gaps)', () => {
    const union = new Set([...GENERATED_CREATE_TOOLS, ...GENERATED_EDIT_TOOLS]);
    expect(union.size).toBe(GENERATED_WRITE_TOOLS.size);
    for (const tool of GENERATED_WRITE_TOOLS) {
      expect(union.has(tool)).toBe(true);
    }
  });

  it('CREATE_TOOLS and EDIT_TOOLS have no overlap', () => {
    for (const tool of GENERATED_CREATE_TOOLS) {
      expect(GENERATED_EDIT_TOOLS.has(tool)).toBe(false);
    }
  });

  it('every WRITE_TOOL is in exactly one of CREATE or EDIT', () => {
    for (const tool of GENERATED_WRITE_TOOLS) {
      const inCreate = GENERATED_CREATE_TOOLS.has(tool);
      const inEdit = GENERATED_EDIT_TOOLS.has(tool);
      expect(inCreate || inEdit).toBe(true);
      expect(inCreate && inEdit).toBe(false);
    }
  });

  it('non-write tools are not in CREATE or EDIT sets', () => {
    const allTools = new Set([
      ...GENERATED_CORE_TOOLS,
      ...Object.values(GENERATED_TOOLSETS).flatMap(ts => ts.tools),
    ]);
    for (const tool of allTools) {
      if (!GENERATED_WRITE_TOOLS.has(tool)) {
        expect(GENERATED_CREATE_TOOLS.has(tool)).toBe(false);
        expect(GENERATED_EDIT_TOOLS.has(tool)).toBe(false);
      }
    }
  });

  it('create tools include expected creation operations', () => {
    const expectedCreate = [
      'create_component', 'create_page',
    ];
    for (const tool of expectedCreate) {
      expect(GENERATED_CREATE_TOOLS.has(tool)).toBe(true);
    }
  });

  it('edit tools include expected modification/deletion operations', () => {
    const expectedEdit = [
      'delete_node',
      'rename_page', 'delete_component', 'lint_fix_all',
    ];
    for (const tool of expectedEdit) {
      expect(GENERATED_EDIT_TOOLS.has(tool)).toBe(true);
    }
  });

  it('has reasonable create/edit ratio', () => {
    // Sanity check: both sets should have meaningful size
    expect(GENERATED_CREATE_TOOLS.size).toBeGreaterThan(10);
    expect(GENERATED_EDIT_TOOLS.size).toBeGreaterThan(10);
    // Total should match WRITE_TOOLS
    expect(GENERATED_CREATE_TOOLS.size + GENERATED_EDIT_TOOLS.size).toBe(GENERATED_WRITE_TOOLS.size);
  });
});

// ─── isToolBlocked logic tests (require dynamic import with env mocking) ───

describe('isToolBlocked', () => {
  let originalAccess: string | undefined;
  let originalReadOnly: string | undefined;

  beforeEach(() => {
    originalAccess = process.env.FIGCRAFT_ACCESS;
    originalReadOnly = process.env.FIGCRAFT_READ_ONLY;
  });

  afterEach(() => {
    // Restore env
    if (originalAccess !== undefined) process.env.FIGCRAFT_ACCESS = originalAccess;
    else delete process.env.FIGCRAFT_ACCESS;
    if (originalReadOnly !== undefined) process.env.FIGCRAFT_READ_ONLY = originalReadOnly;
    else delete process.env.FIGCRAFT_READ_ONLY;
  });

  // Note: isToolBlocked reads ACCESS_LEVEL which is resolved at module load time.
  // Since the module is already loaded with default env (edit), we test the
  // exported function against the default level. For full env-based testing,
  // we'd need module re-import which is complex. Instead we test the logic
  // via the registry sets directly.

  it('at edit level (default), no tools are blocked', async () => {
    // Default env = edit level
    const { isToolBlocked } = await import('../../packages/core-mcp/src/tools/toolset-manager.js');
    // At edit level, nothing should be blocked
    expect(isToolBlocked('ping')).toBeNull();
    expect(isToolBlocked('get_current_page')).toBeNull();
  });

  it('resolveAccessLevel defaults to edit', async () => {
    const { getAccessLevel } = await import('../../packages/core-mcp/src/tools/toolset-manager.js');
    // Module was loaded without FIGCRAFT_ACCESS set, should default to edit
    expect(getAccessLevel()).toBe('edit');
  });
});

// ─── Access level blocking logic (unit test without module reload) ───

describe('access level blocking logic (pure)', () => {
  // Test the blocking logic directly using the registry sets,
  // simulating what isToolBlocked does at each level.

  function simulateBlocked(level: 'read' | 'create' | 'edit', toolName: string): string | null {
    if (level === 'edit') return null;
    if (level === 'create') {
      if (GENERATED_EDIT_TOOLS.has(toolName)) return 'blocked';
      return null;
    }
    if (GENERATED_WRITE_TOOLS.has(toolName)) return 'blocked';
    return null;
  }

  it('read level blocks all write tools', () => {
    for (const tool of GENERATED_WRITE_TOOLS) {
      expect(simulateBlocked('read', tool)).toBe('blocked');
    }
  });

  it('read level allows read-only tools', () => {
    expect(simulateBlocked('read', 'ping')).toBeNull();
    expect(simulateBlocked('read', 'get_current_page')).toBeNull();
    expect(simulateBlocked('read', 'export_image')).toBeNull();
  });

  it('create level blocks edit tools', () => {
    for (const tool of GENERATED_EDIT_TOOLS) {
      expect(simulateBlocked('create', tool)).toBe('blocked');
    }
  });

  it('create level allows create tools', () => {
    for (const tool of GENERATED_CREATE_TOOLS) {
      expect(simulateBlocked('create', tool)).toBeNull();
    }
  });

  it('create level allows read-only tools', () => {
    expect(simulateBlocked('create', 'ping')).toBeNull();
    expect(simulateBlocked('create', 'get_current_page')).toBeNull();
  });

  it('edit level allows everything', () => {
    for (const tool of GENERATED_WRITE_TOOLS) {
      expect(simulateBlocked('edit', tool)).toBeNull();
    }
    expect(simulateBlocked('edit', 'ping')).toBeNull();
  });
});

// ─── Endpoint method-level access control tests ───

import {
  GENERATED_ENDPOINT_METHOD_ACCESS,
  GENERATED_ENDPOINT_TOOLS,
  GENERATED_ENDPOINT_REPLACES,
} from '../../packages/core-mcp/src/tools/_registry.js';

describe('endpoint access control registry', () => {
  it('every endpoint tool has a method access map', () => {
    for (const ep of GENERATED_ENDPOINT_TOOLS) {
      expect(GENERATED_ENDPOINT_METHOD_ACCESS[ep]).toBeDefined();
      expect(Object.keys(GENERATED_ENDPOINT_METHOD_ACCESS[ep]).length).toBeGreaterThan(0);
    }
  });

  it('every endpoint tool has a replaces list', () => {
    for (const ep of GENERATED_ENDPOINT_TOOLS) {
      expect(GENERATED_ENDPOINT_REPLACES[ep]).toBeDefined();
      expect(GENERATED_ENDPOINT_REPLACES[ep].length).toBeGreaterThan(0);
    }
  });

  it('endpoint tools are NOT in WRITE_TOOLS (access control is at method level)', () => {
    for (const ep of GENERATED_ENDPOINT_TOOLS) {
      expect(GENERATED_WRITE_TOOLS.has(ep)).toBe(false);
    }
  });

  it('nodes endpoint has correct method access', () => {
    const nodes = GENERATED_ENDPOINT_METHOD_ACCESS['nodes'];
    expect(nodes).toBeDefined();
    expect(nodes['get']).toEqual({ write: false });
    expect(nodes['list']).toEqual({ write: false });
    expect(nodes['update']).toEqual({ write: true, access: 'edit' });
    expect(nodes['delete']).toEqual({ write: true, access: 'edit' });
  });

  it('text endpoint has correct method access', () => {
    const text = GENERATED_ENDPOINT_METHOD_ACCESS['text'];
    expect(text['set_content']).toEqual({ write: true, access: 'edit' });
  });

  it('components endpoint read methods are all non-write', () => {
    const comp = GENERATED_ENDPOINT_METHOD_ACCESS['components'];
    for (const [, v] of Object.entries(comp)) {
      expect(v.write).toBe(false);
    }
  });
});

describe('endpoint method-level blocking logic (pure)', () => {
  function simulateMethodBlocked(
    level: 'read' | 'create' | 'edit',
    endpoint: string,
    method: string,
  ): string | null {
    if (level === 'edit') return null;
    const methodAccess = GENERATED_ENDPOINT_METHOD_ACCESS[endpoint]?.[method];
    if (!methodAccess?.write) return null; // read methods always allowed
    const methodAccessLevel = methodAccess.access ?? 'edit';
    if (level === 'read') return 'blocked';
    if (level === 'create' && methodAccessLevel === 'edit') return 'blocked';
    return null;
  }

  it('read level only allows read methods on nodes endpoint', () => {
    expect(simulateMethodBlocked('read', 'nodes', 'get')).toBeNull();
    expect(simulateMethodBlocked('read', 'nodes', 'list')).toBeNull();
    expect(simulateMethodBlocked('read', 'nodes', 'update')).toBe('blocked');
    expect(simulateMethodBlocked('read', 'nodes', 'delete')).toBe('blocked');
  });

  it('create level allows read methods, blocks edit methods on nodes', () => {
    expect(simulateMethodBlocked('create', 'nodes', 'get')).toBeNull();
    expect(simulateMethodBlocked('create', 'nodes', 'list')).toBeNull();
    expect(simulateMethodBlocked('create', 'nodes', 'update')).toBe('blocked'); // access: edit
    expect(simulateMethodBlocked('create', 'nodes', 'delete')).toBe('blocked'); // access: edit
  });

  it('edit level allows all methods', () => {
    for (const [ep, methods] of Object.entries(GENERATED_ENDPOINT_METHOD_ACCESS)) {
      for (const method of Object.keys(methods)) {
        expect(simulateMethodBlocked('edit', ep, method)).toBeNull();
      }
    }
  });

  it('read level blocks all write methods across all endpoints', () => {
    for (const [ep, methods] of Object.entries(GENERATED_ENDPOINT_METHOD_ACCESS)) {
      for (const [method, access] of Object.entries(methods)) {
        if (access.write) {
          expect(simulateMethodBlocked('read', ep, method)).toBe('blocked');
        } else {
          expect(simulateMethodBlocked('read', ep, method)).toBeNull();
        }
      }
    }
  });
});
