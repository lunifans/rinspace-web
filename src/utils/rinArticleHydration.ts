export type RinArticleHydrationPlan = {
  renderDeferredMath: boolean;
  renderMathTextNodes: boolean;
  renderLateXMLMathML: boolean;
  renderDiagrams: boolean;
  enhanceCodeWithShiki: boolean;
  decorateFinalCode: boolean;
  hydrateMathJaxStretchy: boolean;
};

export function rinArticleHydrationPlan(options: {
  serverFinal: boolean;
  deferMath: boolean;
  hasDeferredMath: boolean;
}): RinArticleHydrationPlan {
  if (options.serverFinal) {
    return {
      renderDeferredMath: false,
      renderMathTextNodes: false,
      renderLateXMLMathML: false,
      renderDiagrams: false,
      enhanceCodeWithShiki: false,
      decorateFinalCode: true,
      hydrateMathJaxStretchy: false,
    };
  }
  return {
    renderDeferredMath: true,
    renderMathTextNodes: options.deferMath && !options.hasDeferredMath,
    renderLateXMLMathML: true,
    renderDiagrams: true,
    enhanceCodeWithShiki: true,
    decorateFinalCode: false,
    hydrateMathJaxStretchy: true,
  };
}
