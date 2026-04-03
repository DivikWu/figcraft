import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'root',
          include: ['tests/**/*.test.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: [
        'packages/shared/src/**',
        'packages/relay/src/**',
        'packages/core-mcp/src/**',
        'packages/quality-engine/src/**',
        'packages/adapter-figma/src/**',
      ],
      exclude: [
        '**/_generated.ts',
        '**/_registry.ts',
        '**/_contracts.ts',
        '**/_guides.ts',
        '**/_templates.ts',
        '**/_prompts.ts',
        '**/_help.ts',
      ],
      reporter: ['text', 'text-summary', 'json-summary'],
      reportsDirectory: 'coverage',
    },
  },
});
