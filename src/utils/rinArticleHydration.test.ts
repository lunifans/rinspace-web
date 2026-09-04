import { rinArticleHydrationPlan } from './rinArticleHydration';

declare function test(name: string, callback: () => void): void;
declare function expect(actual: unknown): {
  toBe(expected: unknown): void;
};

test('server-final articles do not invoke browser math renderers or hydration', () => {
  const plan = rinArticleHydrationPlan({
    serverFinal: true,
    deferMath: true,
    hasDeferredMath: false,
  });

  expect(plan.renderDeferredMath).toBe(false);
  expect(plan.renderMathTextNodes).toBe(false);
  expect(plan.renderLateXMLMathML).toBe(false);
  expect(plan.renderDiagrams).toBe(false);
  expect(plan.enhanceCodeWithShiki).toBe(false);
  expect(plan.decorateFinalCode).toBe(true);
  expect(plan.hydrateMathJaxStretchy).toBe(false);
});

test('historical Markdown keeps the established browser fallback pipeline', () => {
  const plan = rinArticleHydrationPlan({
    serverFinal: false,
    deferMath: true,
    hasDeferredMath: false,
  });

  expect(plan.renderDeferredMath).toBe(true);
  expect(plan.renderMathTextNodes).toBe(true);
  expect(plan.renderLateXMLMathML).toBe(true);
  expect(plan.renderDiagrams).toBe(true);
  expect(plan.enhanceCodeWithShiki).toBe(true);
  expect(plan.decorateFinalCode).toBe(false);
  expect(plan.hydrateMathJaxStretchy).toBe(true);
});
