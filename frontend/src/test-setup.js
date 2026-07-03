import '@testing-library/jest-dom'

// jsdom lacks ResizeObserver — map pages observe their containers
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
