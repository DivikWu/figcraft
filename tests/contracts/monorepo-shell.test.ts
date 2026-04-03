import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

describe('monorepo compatibility shell', () => {
  it('keeps root build shell pointed at package-owned server and relay sources', () => {
    const tsupConfig = readFileSync('tsup.config.ts', 'utf-8');

    expect(tsupConfig).toContain("packages/figcraft-design/src/index.ts");
    expect(tsupConfig).toContain("packages/relay/src/index.ts");
    expect(tsupConfig).toContain("skills/");
    expect(tsupConfig).toContain("SKILL.md");
  });

  it('keeps the root plugin build script delegated to adapter-figma', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
    expect(pkg.scripts['build:plugin']).toContain("packages/adapter-figma/build.plugin.mjs");
  });

  it('removes legacy src compatibility trees now that packages own the runtime sources', () => {
    expect(existsSync('src/mcp-server')).toBe(false);
    expect(existsSync('src/plugin')).toBe(false);
    expect(existsSync('src/shared')).toBe(false);
    expect(existsSync('src/relay')).toBe(false);
  });

  it('documents the local source MCP entrypoint via packages/figcraft-design in both READMEs', () => {
    const readmeEn = readFileSync('README.md', 'utf-8');
    const readmeZh = readFileSync('README.zh-CN.md', 'utf-8');

    expect(readmeEn).toContain('packages/figcraft-design/src/index.ts');
    expect(readmeZh).toContain('packages/figcraft-design/src/index.ts');
  });
});
