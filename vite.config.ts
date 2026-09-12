import { defineConfig } from 'vite';

// GitHub Pages serves project sites from /<repo>/. Override with BASE_PATH in CI
// if the repository is renamed or moved to a custom domain (where base must be '/').
export default defineConfig({
  base: process.env.BASE_PATH ?? '/FinanceDashboard/',
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  resolve: {
    alias: { react: 'preact/compat', 'react-dom': 'preact/compat' },
  },
  build: { outDir: 'dist', sourcemap: true },
});
