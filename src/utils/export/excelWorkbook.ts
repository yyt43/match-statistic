import type { ExcelSheetPayload } from '../../workers/excelWorker';
import { createAbortError, throwIfAborted } from '../async';

export interface ExcelExportProgress {
  percent: number;
  phase: 'preparing' | 'writing';
}

export interface ExcelExportOptions {
  signal?: AbortSignal;
  onProgress?: (progress: ExcelExportProgress) => void;
}

export async function writeExcelWorkbook(
  sheets: ExcelSheetPayload[],
  fileName: string,
  options: ExcelExportOptions = {}
): Promise<void> {
  if (typeof Worker === 'undefined') {
    throw new Error('Web Worker is not available in this environment.');
  }

  throwIfAborted(options.signal);

  const worker = new Worker(
    new URL('../../workers/excelWorker.ts', import.meta.url),
    { type: 'module' }
  );
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

  try {
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const handleAbort = () => {
        worker.terminate();
        reject(createAbortError());
      };
      const cleanup = () => options.signal?.removeEventListener('abort', handleAbort);

      options.signal?.addEventListener('abort', handleAbort, { once: true });
      worker.onmessage = (event: MessageEvent<{
        id: string;
        buffer?: ArrayBuffer;
        error?: string;
        progress?: number;
        phase?: ExcelExportProgress['phase'];
      }>) => {
        if (event.data.id !== id) return;
        if (event.data.error) {
          cleanup();
          reject(new Error(event.data.error));
        } else if (typeof event.data.progress === 'number' && event.data.phase) {
          options.onProgress?.({ percent: event.data.progress, phase: event.data.phase });
        } else if (event.data.buffer) {
          cleanup();
          resolve(event.data.buffer);
        } else {
          cleanup();
          reject(new Error('Excel worker returned no data.'));
        }
      };
      worker.onerror = event => {
        cleanup();
        reject(new Error(event.message));
      };
      worker.postMessage({ id, type: 'write', sheets });
    });

    throwIfAborted(options.signal);
    const url = URL.createObjectURL(new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } finally {
    worker.terminate();
  }
}
