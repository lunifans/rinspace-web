import { loadRinMathJaxNewcmDynamicFont } from './rinMathJaxDynamicFonts';

export async function createRinMathJaxDocument(browserDocument, macros) {
  const [mathjaxModule, texModule, chtmlModule, adaptorModule, htmlHandlerModule, menuHandlerModule] =
    await Promise.all([
      import('@mathjax/src/mjs/mathjax.js'),
      import('@mathjax/src/mjs/input/tex.js'),
      import('@mathjax/src/mjs/output/chtml.js'),
      import('@mathjax/src/mjs/adaptors/browserAdaptor.js'),
      import('@mathjax/src/mjs/handlers/html.js'),
      import('@mathjax/src/mjs/ui/menu/MenuHandler.js'),
      import('@mathjax/src/mjs/util/asyncLoad/esm.js'),
      import('@mathjax/src/mjs/input/tex/base/BaseConfiguration.js'),
      import('@mathjax/src/mjs/input/tex/ams/AmsConfiguration.js'),
      import('@mathjax/src/mjs/input/tex/color/ColorConfiguration.js'),
      import('@mathjax/src/mjs/input/tex/extpfeil/ExtpfeilConfiguration.js'),
      import('@mathjax/src/mjs/input/tex/newcommand/NewcommandConfiguration.js'),
      import('@mathjax/src/mjs/input/tex/configmacros/ConfigMacrosConfiguration.js'),
    ]);
  const adaptor = adaptorModule.browserAdaptor();
  const handler = htmlHandlerModule.RegisterHTMLHandler(adaptor);
  menuHandlerModule.MenuHandler(handler);
  const fallbackAsyncLoad = mathjaxModule.mathjax.asyncLoad?.bind(mathjaxModule.mathjax);
  mathjaxModule.mathjax.asyncLoad = (name) => {
    const dynamicFont = loadRinMathJaxNewcmDynamicFont(name);
    if (dynamicFont) return dynamicFont;
    if (fallbackAsyncLoad) return fallbackAsyncLoad(name);
    return Promise.reject(new Error(`MathJax dynamic module is not registered: ${name}`));
  };
  const tex = new texModule.TeX({
    packages: ['base', 'ams', 'color', 'extpfeil', 'newcommand', 'configmacros'],
    macros,
  });
  const chtml = new chtmlModule.CHTML({
    fontURL: '/fonts/mathjax-newcm/woff2',
    displayOverflow: 'overflow',
    linebreaks: { inline: false },
  });
  return mathjaxModule.mathjax.document(browserDocument, {
    InputJax: tex,
    OutputJax: chtml,
    enableMenu: true,
    menuOptions: {
      settings: { enrich: false, speech: false, braille: false, collapsible: false },
    },
  });
}
