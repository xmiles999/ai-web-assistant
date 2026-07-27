import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    sourcemap: true,
    lib: {
      entry: 'src/content/content-script.tsx',
      name: 'AiWebAssistantContent',
      formats: ['iife'],
      fileName: () => 'content-script.js',
    },
  },
});
