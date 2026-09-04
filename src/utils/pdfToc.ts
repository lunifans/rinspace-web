import { publicEnv } from '@/app/config/env';
import * as pdfjs from 'pdfjs-dist';
import type { BookTOCItem } from '@/services/contracts';

pdfjs.GlobalWorkerOptions.workerSrc = `${publicEnv.publicBasePath || ''}/assets/pdf.worker.min.js`;

type PDFDestination = string | unknown[] | null;

type PDFOutlineNode = {
  title: string;
  dest: PDFDestination;
  items: PDFOutlineNode[];
};

function outlineNode(value: unknown): PDFOutlineNode | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.title !== 'string') return null;
  const rawItems = Array.isArray(record.items) ? record.items : [];
  return {
    title: record.title,
    dest:
      typeof record.dest === 'string' || Array.isArray(record.dest) || record.dest === null
        ? record.dest
        : null,
    items: rawItems
      .map(outlineNode)
      .filter((item): item is PDFOutlineNode => item !== null),
  };
}

function flattenOutline(nodes: PDFOutlineNode[], level = 1): BookTOCItem[] {
  const items: BookTOCItem[] = [];
  nodes.forEach((node) => {
    const title = node.title.replace(/\s+/g, ' ').trim();
    if (title) {
      items.push({ title, level });
    }
    items.push(...flattenOutline(node.items, level + 1));
  });
  return items;
}

export async function extractPDFTOC(file: File): Promise<BookTOCItem[]> {
  const data = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({
    data,
  });
  const document = await loadingTask.promise;
  try {
    const outline = await document.getOutline();
    const nodes = (outline || [])
      .map(outlineNode)
      .filter((item): item is PDFOutlineNode => item !== null);
    return flattenOutline(nodes).slice(0, 120);
  } finally {
    await document.destroy();
  }
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error('PDF cover render failed'));
    }, type, quality);
  });
}

export async function renderPDFCover(file: File): Promise<File> {
  const data = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data });
  const document = await loadingTask.promise;
  try {
    const page = await document.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const targetWidth = 900;
    const scale = Math.min(2, Math.max(0.6, targetWidth / Math.max(1, baseViewport.width)));
    const viewport = page.getViewport({ scale });
    const canvas = window.document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('PDF cover canvas unavailable');
    }
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({
      canvasContext: context,
      viewport,
    }).promise;

    // Crop the rendered page to its content bounding box and cover-fit it into
    // the canonical 2:3 book cover canvas. Raw PDF pages are ~A4 and leave a
    // whitespace band at the bottom that reads as an offset cover.
    const trimmed = trimCanvasToContent(canvas);
    const output = window.document.createElement('canvas');
    output.width = 900;
    output.height = 1350;
    const outputContext = output.getContext('2d');
    if (!outputContext) {
      throw new Error('PDF cover canvas unavailable');
    }
    outputContext.fillStyle = '#ffffff';
    outputContext.fillRect(0, 0, output.width, output.height);
    const source = trimmed || { sx: 0, sy: 0, sw: canvas.width, sh: canvas.height };
    const fit = Math.max(output.width / source.sw, output.height / source.sh);
    const drawWidth = source.sw * fit;
    const drawHeight = source.sh * fit;
    outputContext.drawImage(
      canvas,
      source.sx, source.sy, source.sw, source.sh,
      (output.width - drawWidth) / 2, (output.height - drawHeight) / 2,
      drawWidth, drawHeight,
    );

    const blob = await canvasBlob(output, 'image/jpeg', 0.86);
    return new File([blob], `${file.name.replace(/\.pdf$/i, '') || 'book'}-cover.jpg`, {
      type: 'image/jpeg',
    });
  } finally {
    await document.destroy();
  }
}

function trimCanvasToContent(canvas: HTMLCanvasElement): { sx: number; sy: number; sw: number; sh: number } | null {
  const context = canvas.getContext('2d');
  if (!context) return null;
  const { width, height } = canvas;
  const pixels = context.getImageData(0, 0, width, height).data;
  const channelTolerance = 246;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const r = pixels[offset];
      const g = pixels[offset + 1];
      const b = pixels[offset + 2];
      if (r < channelTolerance || g < channelTolerance || b < channelTolerance) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { sx: minX, sy: minY, sw: maxX - minX + 1, sh: maxY - minY + 1 };
}
