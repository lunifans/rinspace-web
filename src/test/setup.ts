import '@/i18n';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

if (typeof globalThis.IntersectionObserver === 'undefined') {
  class MockIntersectionObserver {
    readonly root = null;
    readonly rootMargin = '0px';
    readonly thresholds = [0];
    observe() { return undefined; }
    unobserve() { return undefined; }
    disconnect() { return undefined; }
    takeRecords() { return []; }
  }
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    writable: true,
    value: MockIntersectionObserver,
  });
}
