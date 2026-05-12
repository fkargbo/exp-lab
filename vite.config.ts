import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';

export default defineConfig(({ mode }) => ({
  base: './',
  /* React / devtools branches reference process.env.NODE_ENV — browsers have no `process`. */
  define: {
    'process.env.NODE_ENV': JSON.stringify(mode === 'production' ? 'production' : 'development'),
  },
  plugins: [react(), cssInjectedByJsPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    emptyOutDir: true,
    lib: {
      entry: path.resolve(__dirname, 'src/embed.tsx'),
      name: 'ExpLabFeedbackLayer',
      formats: ['iife'],
      fileName: () => 'feedback-layer.js',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        assetFileNames: 'feedback-layer[extname]',
      },
    },
  },
}));
