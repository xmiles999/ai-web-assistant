import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      // Provider network I/O is covered by the local mock E2E boundary; pure parsing,
      // validation, prompt and crypto modules are the unit-coverage scope.
      include: [
        'src/prompts/**/*.ts',
        'src/security/**/*.ts',
        'src/providers/sse.ts',
        'src/providers/url.ts',
        'src/background/content-injection.ts',
        'src/background/context-menus.ts',
      ],
      thresholds: { lines: 80, functions: 75, statements: 80, branches: 50 },
    },
  },
});
