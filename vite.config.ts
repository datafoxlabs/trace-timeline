import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// demo 开发服务器（占位页）。root 指向 demo/，从 ../src 引入库。
export default defineConfig({
  root: 'demo',
  plugins: [react()],
  // Story 9.2：dedupe 单一 react/react-dom，避免 `@datafox/ui`（pnpm 嵌套 react）与本包 react 双实例。
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  server: { open: true },
});
