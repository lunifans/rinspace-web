import { createRinMathJaxDocument, type RinMathJaxDocument } from './rinMathJaxVendor';

type MathJaxMenuRuntime = {
  document: RinMathJaxDocument;
};

let runtimePromise: Promise<MathJaxMenuRuntime> | null = null;
const handledContextMenuEvents = new WeakSet<MouseEvent>();

const defaultMacros: Record<string, string | [string, number]> = {
  ket: ['\\left|#1\\right\\rangle', 1],
  bra: ['\\left\\langle#1\\right|', 1],
  braket: ['\\left\\langle#1\\,\\middle|\\,#2\\right\\rangle', 2],
  norm: ['\\left\\lVert#1\\right\\rVert', 1],
  abs: ['\\left\\lvert#1\\right\\rvert', 1],
  innerproduct: ['\\left\\langle#1,#2\\right\\rangle', 2],
  coloneqq: '\\mathrel{\\vcenter{:}}=',
  xlongrightarrow: ['\\xrightarrow{#1}', 1],
};

function preserveScrollWhenMathJaxMenuChanges(document: RinMathJaxDocument) {
  const menu = document?.menu?.menu;
  if (!menu || menu.rinPreservesScroll) return;
  const preserveScroll = (method: string) => {
    if (typeof menu[method] !== 'function') return;
    const original = menu[method].bind(menu);
    menu[method] = (...args: unknown[]) => {
      const scrollX = window.scrollX;
      const scrollY = window.scrollY;
      const scrollingElement = document.scrollingElement as HTMLElement | null;
      const previousScrollBehavior = scrollingElement?.style.getPropertyValue('scroll-behavior') || '';
      const previousScrollBehaviorPriority = scrollingElement?.style.getPropertyPriority('scroll-behavior') || '';
      scrollingElement?.style.setProperty('scroll-behavior', 'auto', 'important');
      const restore = () => {
        if (window.scrollX !== scrollX || window.scrollY !== scrollY) {
          window.scrollTo(scrollX, scrollY);
        }
      };
      const restoreScrollBehavior = () => {
        if (!scrollingElement) return;
        if (previousScrollBehavior) {
          scrollingElement.style.setProperty(
            'scroll-behavior',
            previousScrollBehavior,
            previousScrollBehaviorPriority,
          );
        } else {
          scrollingElement.style.removeProperty('scroll-behavior');
        }
      };
      try {
        const result = original(...args);
        restore();
        let framesRemaining = 12;
        const keepScrollPosition = () => {
          restore();
          framesRemaining -= 1;
          if (framesRemaining > 0) {
            window.requestAnimationFrame(keepScrollPosition);
          } else {
            restoreScrollBehavior();
          }
        };
        window.requestAnimationFrame(keepScrollPosition);
        return result;
      } catch (error) {
        restore();
        restoreScrollBehavior();
        throw error;
      }
    };
  };
  preserveScroll('post');
  preserveScroll('unpost');
  menu.rinPreservesScroll = true;
}

function loadMathJaxMenuRuntime() {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      const document = await createRinMathJaxDocument(window.document, defaultMacros);
      preserveScrollWhenMathJaxMenuChanges(document);

      return { document };
    })();
  }
  return runtimePromise;
}

function dispatchDeferredContextMenu(target: Element, event: MouseEvent) {
  window.setTimeout(() => {
    target.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: event.clientX,
        clientY: event.clientY,
        screenX: event.screenX,
        screenY: event.screenY,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
        button: event.button,
        buttons: event.buttons,
      }),
    );
  }, 0);
}

function findMathWrapper(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  return target.closest<HTMLElement>(
    '.rin-math.rin-math-mathjax[data-rin-math-source]',
  );
}

function mathDisplayMode(wrapper: HTMLElement) {
  return wrapper.classList.contains('rin-math-display');
}

function replaceTypesetRoot(wrapper: HTMLElement, node: Element) {
  const current = wrapper.querySelector(':scope > mjx-container');
  if (current) {
    current.replaceWith(node);
    return;
  }
  wrapper.replaceChildren(node);
}

function cssFontFamilies(value: string) {
  return value
    .split(',')
    .map((family) => family.trim().replace(/^(['"])(.*)\1$/, '$2'))
    .filter((family) => family.startsWith('MJX-'));
}

export type RinMathJaxFontLoad = {
  font: string;
  text: string;
};

export function rinMathJaxStretchyFontLoads(root: ParentNode): RinMathJaxFontLoad[] {
  if (typeof window === 'undefined') return [];
  const loads = new Map<string, RinMathJaxFontLoad>();
  root.querySelectorAll<HTMLElement>('mjx-stretchy-v').forEach((stretchy) => {
    const pieces = Array.from(
      stretchy.querySelectorAll<HTMLElement>(
        ':scope > mjx-beg, :scope > mjx-ext, :scope > mjx-mid, :scope > mjx-end',
      ),
    );
    pieces.forEach((piece) => {
      const text = piece.textContent || '';
      if (!text) return;
      const style = window.getComputedStyle(piece);
      const size = style.fontSize || '1em';
      cssFontFamilies(style.fontFamily).forEach((family) => {
        const font = `${size} "${family}"`;
        const key = `${font}\u0000${text}`;
        loads.set(key, { font, text });
      });
    });
  });
  return Array.from(loads.values());
}

async function loadMathJaxStretchyFonts(root: ParentNode, signal?: AbortSignal) {
  const document = root instanceof Document ? root : root.ownerDocument || window.document;
  if (!document.fonts) return !signal?.aborted;
  await Promise.all(
    rinMathJaxStretchyFontLoads(root).map(({ font, text }) => document.fonts.load(font, text)),
  );
  return !signal?.aborted;
}

async function hydrateMathWrapper(
  wrapper: HTMLElement,
  runtime?: MathJaxMenuRuntime,
) {
  const source = wrapper.dataset.rinMathSource || '';
  if (!source.trim()) return null;

  const mathJaxRuntime = runtime || await loadMathJaxMenuRuntime();
  if (!wrapper.isConnected) return null;
  const width = Math.max(
    wrapper.getBoundingClientRect().width || 0,
    window.innerWidth * 0.9,
  );
  const node = await mathJaxRuntime.document.convertPromise(source, {
    display: mathDisplayMode(wrapper),
    em: 16,
    ex: 8,
    containerWidth: width,
  });
  if (!wrapper.isConnected) return null;
  replaceTypesetRoot(wrapper, node);
  wrapper.dataset.rinMathMenuHydrated = 'true';
  return node;
}

function waitForNextBatch(signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const handle = window.setTimeout(resolve, 16);
    signal.addEventListener('abort', () => {
      window.clearTimeout(handle);
      resolve();
    }, { once: true });
  });
}

export async function hydrateRinMathJaxStretchyMath(
  root: ParentNode,
  signal: AbortSignal,
) {
  if (typeof window === 'undefined' || signal.aborted) return 0;
  const wrappers = Array.from(
    root.querySelectorAll<HTMLElement>(
      '.rin-math.rin-math-mathjax[data-rin-math-source]:not([data-rin-math-stretchy-hydrated="true"])',
    ),
  ).filter((wrapper) => wrapper.querySelector('mjx-stretchy-v'));
  if (!wrappers.length) return 0;

  let runtime: MathJaxMenuRuntime;
  try {
    if (!await loadMathJaxStretchyFonts(root, signal)) return 0;
    runtime = await loadMathJaxMenuRuntime();
  } catch (error) {
    console.warn('MathJax stretchy math runtime failed', error);
    return 0;
  }
  let hydratedCount = 0;
  for (let index = 0; index < wrappers.length && !signal.aborted; index += 1) {
    const wrapper = wrappers[index];
    try {
      const node = await hydrateMathWrapper(wrapper, runtime);
      if (node) {
        wrapper.dataset.rinMathStretchyHydrated = 'true';
        hydratedCount += 1;
      }
    } catch (error) {
      wrapper.dataset.rinMathStretchyHydrated = 'failed';
      console.warn('MathJax stretchy math hydration failed', error);
    }
    if ((index + 1) % 8 === 0 && index + 1 < wrappers.length) {
      await waitForNextBatch(signal);
    }
  }
  return hydratedCount;
}

export async function hydrateRinMathJaxOfficialMenu(event: MouseEvent) {
  if (typeof window === 'undefined') return false;
  const wrapper = findMathWrapper(event.target);
  if (!wrapper) return false;

  const source = wrapper.dataset.rinMathSource || '';
  if (!source.trim()) return false;
  if (handledContextMenuEvents.has(event)) return false;
  handledContextMenuEvents.add(event);

  const hydrated = wrapper.dataset.rinMathMenuHydrated === 'true';
  const menuTarget = wrapper.querySelector<HTMLElement>(':scope > mjx-container');
  if (hydrated && menuTarget) {
    return false;
  }

  event.preventDefault();

  try {
    await loadMathJaxStretchyFonts(wrapper);
    const node = await hydrateMathWrapper(wrapper);
    if (!node) return false;
    dispatchDeferredContextMenu(node, event);
    return true;
  } catch (error) {
    wrapper.dataset.rinMathMenuHydrated = 'failed';
    console.warn('MathJax menu hydration failed', error);
    return false;
  }
}
