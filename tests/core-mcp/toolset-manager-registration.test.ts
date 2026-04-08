import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Bridge } from '../../packages/core-mcp/src/bridge.js';
import { registerGeneratedTools } from '../../packages/core-mcp/src/tools/_generated.js';
import { GENERATED_BRIDGE_TOOLS } from '../../packages/core-mcp/src/tools/_registry.js';
import { registerAllTools } from '../../packages/core-mcp/src/tools/toolset-manager.js';

interface FakeRegisteredTool {
  enabled: boolean;
  enable: () => void;
  disable: () => void;
}

class FakeMcpServer {
  _registeredTools: Record<string, FakeRegisteredTool> = {};

  tool(name: string): FakeRegisteredTool {
    return this.addTool(name);
  }

  registerTool(name: string): FakeRegisteredTool {
    return this.addTool(name);
  }

  sendToolListChanged(): void {}

  private addTool(name: string): FakeRegisteredTool {
    if (this._registeredTools[name]) {
      throw new Error(`Duplicate tool registration: ${name}`);
    }
    const handle: FakeRegisteredTool = {
      enabled: true,
      enable: () => {
        handle.enabled = true;
      },
      disable: () => {
        handle.enabled = false;
      },
    };
    this._registeredTools[name] = handle;
    return handle;
  }
}

function createBridge(): Bridge {
  return {
    request: vi.fn(),
    setPipeline: vi.fn(),
    session: { modeQueried: false, selectedLibrary: undefined },
  } as unknown as Bridge;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('generated tool registration', () => {
  it('registerGeneratedTools only registers the requested subset', () => {
    const server = new FakeMcpServer();
    const include = new Set(['set_selection', 'rename_page']);

    registerGeneratedTools(server as unknown as McpServer, createBridge(), { include });

    expect(Object.keys(server._registeredTools).sort()).toEqual(['rename_page', 'set_selection']);
  });
});

describe('toolset manager registration', () => {
  it('registerAllTools combines generated and custom tools without duplicates', () => {
    const server = new FakeMcpServer();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      registerAllTools(server as unknown as McpServer, createBridge());
    }).not.toThrow();

    for (const toolName of GENERATED_BRIDGE_TOOLS) {
      expect(server._registeredTools[toolName], `missing generated tool ${toolName}`).toBeDefined();
    }

    expect(server._registeredTools.cache_tokens).toBeDefined();
    expect(server._registeredTools.lint_fix_all).toBeDefined();
    // These are now ghost tools (removed flat tools with migration guidance)
    expect(server._registeredTools.update_text_style).toBeDefined();
    expect(server._registeredTools.list_library_components).toBeDefined();
    expect(server._registeredTools.get_document_info).toBeDefined();
    expect(server._registeredTools.nodes).toBeDefined();
    expect(server._registeredTools.variables_ep).toBeDefined();
    expect(errorSpy).toHaveBeenCalled();
  });
});
