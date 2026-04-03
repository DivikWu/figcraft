import { describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync } from 'node:fs';

const IDE_FILES = [
  'CLAUDE.md',
  'AGENTS.md',
  '.kiro/steering/figcraft.md',
  '.cursor/rules/figcraft.mdc',
];

const INJECT_PATTERN = /<!-- @inject-start: (.+?) -->\n([\s\S]*?)<!-- @inject-end -->/g;

describe('IDE config consistency', () => {
  it('all inject regions match their source snippets (run `npm run content` if stale)', () => {
    for (const file of IDE_FILES) {
      if (!existsSync(file)) continue;
      const content = readFileSync(file, 'utf-8');
      let match;
      while ((match = INJECT_PATTERN.exec(content)) !== null) {
        const [, snippetPath, injected] = match;
        const sourcePath = `content/${snippetPath}`;
        expect(existsSync(sourcePath), `${file}: source snippet ${sourcePath} not found`).toBe(true);
        const source = readFileSync(sourcePath, 'utf-8').trimEnd();
        expect(injected.trimEnd(), `${file}: inject region for ${snippetPath} is stale`).toBe(source);
      }
    }
  });

  it('all IDE files exist', () => {
    for (const file of IDE_FILES) {
      expect(existsSync(file), `Missing IDE config: ${file}`).toBe(true);
    }
  });

  it('all ide-shared snippets are used in at least one IDE file', () => {
    const snippets = readdirSync('content/ide-shared').filter(f => f.endsWith('.md'));
    const allContent = IDE_FILES.map(f => readFileSync(f, 'utf-8')).join('\n');
    for (const snippet of snippets) {
      expect(
        allContent.includes(`ide-shared/${snippet}`),
        `content/ide-shared/${snippet} is not referenced by any IDE file`,
      ).toBe(true);
    }
  });
});
