import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Story 9.2：`@datafox/ui`（pnpm）自带嵌套 react 副本，其 Radix 原语会解析到该副本 →
  // 与 trace-timeline（npm）的 react 形成双实例、hooks 失效（null dispatcher）。
  // dedupe + 内联 datafox（下方 server.deps.inline）令 vite 统一解析 react/react-dom 到本包唯一副本，
  // 消除跨 PM `file:` 链的重复 React。
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    // 内联 datafox-ui 及其嵌套 Radix / react-remove-scroll 等 transitive 依赖，令 dedupe 作用于它们的
    // `import 'react'`（否则 vitest 把 node_modules 交给 Node/optimizer 解析，绕过 vite resolve → 双 React）。
    // 两个 pattern 兼顾：`/datafox-ui/` 匹配 `file:` 链的 symlink 真实路径（`.../workspace/datafox-ui/...`，
    // 亦覆盖其下嵌套 pnpm 依赖）；`/@datafox\/ui/` 兜底匹配非软链安装时的 scoped 路径 `node_modules/@datafox/ui`。
    server: {
      deps: {
        inline: [/datafox-ui/, /@datafox\/ui/],
      },
    },
    deps: {
      optimizer: {
        web: { enabled: false },
      },
    },
  },
});
