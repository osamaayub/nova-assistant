import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      // The Node side holds the agent, tools and safety rules. The window (src/renderer) and
      // the voice and Windows parts are checked by hand, so they are not counted here.
      include: ['src/main/**/*.ts', 'src/shared/**/*.ts'],
      reporter: ['text-summary', 'text', 'lcov'],
      // A floor a few points under the measured numbers (68% lines, 62% branches on
      // 2026-11-19). A pull request that drops coverage below it fails. Raise it as tests grow.
      thresholds: { statements: 64, lines: 65, functions: 62, branches: 58 }
    }
  }
})
