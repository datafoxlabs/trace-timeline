import '@testing-library/jest-dom';

// Story 9.2：叶子替换引入 `@datafox/ui`（Radix primitives）。Radix 的 Select/Tooltip/Popover
// 在交互时依赖若干 DOM API，而 jsdom 未实现 → 补 polyfill，否则打开下拉/浮层即抛错。
// 仅测试环境补齐；真实浏览器原生具备。
if (typeof window !== 'undefined') {
  const proto = window.Element.prototype as unknown as Record<string, unknown>;
  if (!proto.hasPointerCapture) proto.hasPointerCapture = () => false;
  if (!proto.setPointerCapture) proto.setPointerCapture = () => {};
  if (!proto.releasePointerCapture) proto.releasePointerCapture = () => {};
  if (!proto.scrollIntoView) proto.scrollIntoView = () => {};

  if (!('ResizeObserver' in window)) {
    (window as unknown as Record<string, unknown>).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
}

// RichSearchBar measures the caret with Range; jsdom has no layout engine.
if (!Range.prototype.getBoundingClientRect) {
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
}
