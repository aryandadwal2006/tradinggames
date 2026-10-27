import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    clearMocks: true
  },
  build: {
    target: 'es2022',
    sourcemap: true
  }
});