import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the build works from any static host sub-path (GitHub Pages).
  base: './',
  build: { target: 'es2022' },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
