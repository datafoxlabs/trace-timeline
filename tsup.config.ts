import { defineConfig } from 'tsup';

// ESM-only 包（AD-10）：出 ESM + d.ts，react/react-dom 作为 external（peer，不打进产物）
// 多入口（AD-15）：主入口后端中立；数据源适配器走子路径，可 tree-shake、按需引入。
// Story 9.2：`@datafox/ui`（Foundation 设计系统）作为 external——叶子组件在运行时从共享依赖引入，
//   不内联进 trace-timeline 产物（避免打包 Radix/cmdk 等、并让消费方去重同一 Foundation）。
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'datasources/datafox': 'src/datasources/datafox/index.ts',
    'datasources/otlp': 'src/datasources/otlp/index.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  loader: { '.woff2': 'dataurl' },
  treeshake: true,
  clean: true,
  external: ['react', 'react-dom', '@datafox/ui'],
});
