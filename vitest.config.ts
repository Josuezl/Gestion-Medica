import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Pruebas unitarias de lógica pura (sin BD ni red). El alias '@' replica el de tsconfig
// para poder importar utilidades con '@/utils/...'.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)).replace(/\/$/, ''),
    },
  },
})
