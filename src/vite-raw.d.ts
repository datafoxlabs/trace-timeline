// Vite/vitest `?raw` 导入：把文件作为字符串引入（Story 9.1 源级守卫测试用；避免引入 @types/node）。
declare module '*?raw' {
  const src: string;
  export default src;
}

// `import.meta.glob`（Story 9.3e 全域 lucide 守卫用）。
// 只声明本仓实际使用的那一种形态（eager + ?raw + default），不引 `vite/client`——
// 后者会连带声明 `*?raw` / `*.css` 等模块，与上面的 shim 重复定义。
interface ImportMeta {
  glob(
    pattern: string,
    options: { query: '?raw'; import: 'default'; eager: true }
  ): Record<string, string>;
}
