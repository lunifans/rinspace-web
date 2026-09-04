const quiverDialogMargin = 16;
const quiverDialogMinWidth = 360;
const quiverDialogMinHeight = 320;

export type QuiverDialogLayout = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type QuiverResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export const quiverResizeEdges: QuiverResizeEdge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function quiverDialogBounds() {
  if (typeof window === 'undefined') {
    return {
      viewportWidth: 1200,
      viewportHeight: 860,
      minWidth: quiverDialogMinWidth,
      minHeight: quiverDialogMinHeight,
      maxWidth: 1168,
      maxHeight: 828,
    };
  }
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const minWidth = Math.min(quiverDialogMinWidth, Math.max(280, viewportWidth - quiverDialogMargin * 2));
  const minHeight = Math.min(quiverDialogMinHeight, Math.max(240, viewportHeight - quiverDialogMargin * 2));
  return {
    viewportWidth,
    viewportHeight,
    minWidth,
    minHeight,
    maxWidth: Math.max(minWidth, viewportWidth - quiverDialogMargin * 2),
    maxHeight: Math.max(minHeight, viewportHeight - quiverDialogMargin * 2),
  };
}

export function defaultQuiverDialogLayout(): QuiverDialogLayout {
  const { viewportWidth, viewportHeight, maxWidth, maxHeight } = quiverDialogBounds();
  const width = Math.min(1080, maxWidth);
  const height = Math.min(760, Math.max(360, viewportHeight - 96), maxHeight);
  return {
    left: Math.max(quiverDialogMargin, viewportWidth - width - Math.min(44, Math.max(16, viewportWidth * 0.04))),
    top: Math.max(quiverDialogMargin, viewportHeight - height - Math.min(36, Math.max(16, viewportWidth * 0.04))),
    width,
    height,
  };
}

export function fitQuiverDialogLayout(layout: QuiverDialogLayout): QuiverDialogLayout {
  const { viewportWidth, viewportHeight, minWidth, minHeight, maxWidth, maxHeight } = quiverDialogBounds();
  const width = clampNumber(layout.width, minWidth, maxWidth);
  const height = clampNumber(layout.height, minHeight, maxHeight);
  return {
    left: clampNumber(layout.left, quiverDialogMargin, viewportWidth - width - quiverDialogMargin),
    top: clampNumber(layout.top, quiverDialogMargin, viewportHeight - height - quiverDialogMargin),
    width,
    height,
  };
}

export function resizeQuiverDialogLayout(
  layout: QuiverDialogLayout,
  edge: QuiverResizeEdge,
  deltaX: number,
  deltaY: number,
) {
  const next = { ...layout };
  if (edge.includes('e')) {
    next.width = layout.width + deltaX;
  }
  if (edge.includes('s')) {
    next.height = layout.height + deltaY;
  }
  if (edge.includes('w')) {
    next.left = layout.left + deltaX;
    next.width = layout.width - deltaX;
  }
  if (edge.includes('n')) {
    next.top = layout.top + deltaY;
    next.height = layout.height - deltaY;
  }
  return fitQuiverDialogLayout(next);
}
