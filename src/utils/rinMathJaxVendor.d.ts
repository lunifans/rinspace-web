export type RinMathJaxMenu = Record<string, unknown> & {
  rinPreservesScroll?: boolean;
  post?: (...args: unknown[]) => unknown;
  unpost?: (...args: unknown[]) => unknown;
};
export type RinMathJaxDocument = {
  menu?: { menu?: RinMathJaxMenu };
  scrollingElement?: HTMLElement | null;
  convertPromise(source: string, options: Record<string, unknown>): Promise<Element>;
};
export function createRinMathJaxDocument(
  browserDocument: Document,
  macros: Record<string, string | [string, number]>,
): Promise<RinMathJaxDocument>;
