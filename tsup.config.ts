import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist',
  format: ['esm'], // atau 'cjs' jika kamu pakai require()
  target: 'es2020',
  sourcemap: true,
  clean: true,
  splitting: false
})
