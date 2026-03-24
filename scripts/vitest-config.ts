import { defineConfig } from 'vitest/config';

const SHARED_EXCLUDE = ['node_modules', 'dist'];
const INTEGRATION_TEST_FILES = 'src/**/*.integration.test.ts';
const BIG_TIMEOUT_IN_MILLISECONDS = 30_000;

export const config = defineConfig({
  test: {
    coverage: {
      exclude: [
        'src/**/*.test.ts'
      ],
      include: ['src/**/*.ts'],
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage'
    },
    exclude: ['node_modules', 'dist'],
    globals: false,
    include: ['src/**/*.test.ts'],
    projects: [
      {
        test: {
          environment: 'node',
          exclude: [...SHARED_EXCLUDE, INTEGRATION_TEST_FILES],
          include: ['src/**/*.test.ts'],
          name: 'unit-tests'
        }
      },
      {
        test: {
          environment: 'node',
          fileParallelism: false,
          globalSetup: 'obsidian-integration-testing/obsidian-plugin-vitest-setup',
          include: [INTEGRATION_TEST_FILES],
          name: 'integration-tests',
          testTimeout: BIG_TIMEOUT_IN_MILLISECONDS
        }
      }
    ]
  }
});
