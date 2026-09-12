import { createAbortError, throwIfAborted } from '../async';

export interface ImageExportOptions {
  signal?: AbortSignal;
  onProgress?: (percent: number) => void;
}

async function encodeCanvas(canvas: HTMLCanvasElement, signal?: AbortSignal): Promise<Blob> {
  throwIfAborted(signal);
  const canUseWorker = typeof Worker !== 'undefined'
    && typeof OffscreenCanvas !== 'undefined'
    && typeof createImageBitmap === 'function';

  if (canUseWorker) {
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(canvas);
    } catch {
      // Some older Safari versions expose the APIs but reject canvas bitmaps.
      return encodeCanvasFallback(canvas, signal);
    }
    throwIfAborted(signal);

    const worker = new Worker(
      new URL('../../workers/imageWorker.ts', import.meta.url),
      { type: 'module' }
    );
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);

    try {
      return await new Promise<Blob>((resolve, reject) => {
        const handleAbort = () => {
          worker.terminate();
          reject(createAbortError());
        };

        signal?.addEventListener('abort', handleAbort, { once: true });
        worker.onmessage = (event: MessageEvent<{ id: string; blob?: Blob; error?: string }>) => {
          if (event.data.id !== id) return;
          signal?.removeEventListener('abort', handleAbort);
          if (event.data.error) reject(new Error(event.data.error));
          else if (event.data.blob) resolve(event.data.blob);
          else reject(new Error('Image worker returned no data.'));
        };
        worker.onerror = event => reject(new Error(event.message));
        worker.postMessage({ id, bitmap }, [bitmap]);
      });
    } finally {
      worker.terminate();
    }
  }

  return encodeCanvasFallback(canvas, signal);
}

function encodeCanvasFallback(canvas: HTMLCanvasElement, signal?: AbortSignal): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (signal?.aborted) reject(createAbortError());
      else if (blob) resolve(blob);
      else reject(new Error('Canvas could not be encoded as PNG.'));
    }, 'image/png');
  });
}

export async function generateImage(
  elementId: string,
  fileName: string,
  options: ImageExportOptions = {}
): Promise<void> {
  throwIfAborted(options.signal);
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(`Element with id "${elementId}" not found`);
  }

  options.onProgress?.(5);
  const { default: html2canvas } = await import('html2canvas');
  throwIfAborted(options.signal);
  options.onProgress?.(25);

  const originalScrollY = window.scrollY;
  const originalScrollX = window.scrollX;
  window.scrollTo(0, 0);

  try {
    const canvas = await html2canvas(element, {
      backgroundColor: '#1e293b',
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      windowWidth: document.documentElement.scrollWidth,
      windowHeight: document.documentElement.scrollHeight,
      scrollX: 0,
      scrollY: 0,
      x: 0,
      y: 0,
      width: element.offsetWidth,
      height: element.offsetHeight,
      onclone: clonedDoc => {
        const clonedElement = clonedDoc.getElementById(elementId);
        if (!clonedElement) return;

        let parent = clonedElement.parentElement;
        while (parent && parent !== clonedDoc.body) {
          const style = clonedDoc.defaultView?.getComputedStyle(parent) || parent.style;
          if (style.overflow === 'auto' || style.overflow === 'hidden' || style.overflowY === 'auto' || style.overflowY === 'hidden') {
            parent.style.overflow = 'visible';
            parent.style.overflowY = 'visible';
          }
          if (style.maxHeight && style.maxHeight !== 'none') {
            parent.style.maxHeight = 'none';
          }
          if (style.height && (style.height.includes('px') || style.height.includes('vh') || style.height.includes('calc'))) {
            parent.style.height = 'auto';
          }
          parent = parent.parentElement;
        }
      },
    });

    throwIfAborted(options.signal);
    options.onProgress?.(75);
    const blob = await encodeCanvas(canvas, options.signal);
    throwIfAborted(options.signal);
    options.onProgress?.(95);

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `${fileName}.png`;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    options.onProgress?.(100);
  } finally {
    window.scrollTo(originalScrollX, originalScrollY);
  }
}
