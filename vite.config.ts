import { defineConfig } from 'vite';
export default defineConfig({ base: './', build: { outDir: 'docs', chunkSizeWarningLimit: 2000 } });
