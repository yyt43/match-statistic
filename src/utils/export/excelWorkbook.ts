import type { ExcelSheetPayload } from '../../workers/excelWorker';

export async function writeExcelWorkbook(
  sheets: ExcelSheetPayload[],
  fileName: string
): Promise<void> {
  if (typeof Worker === 'undefined') {
    throw new Error('Web Worker is not available in this environment.');
  }

  const worker = new Worker(
    new URL('../../workers/excelWorker.ts', import.meta.url),
    { type: 'module' }
  );
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

  try {
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<{ id: string; buffer?: ArrayBuffer; error?: string }>) => {
        if (event.data.id !== id) return;
        if (event.data.error) reject(new Error(event.data.error));
        else if (event.data.buffer) resolve(event.data.buffer);
        else reject(new Error('Excel worker returned no data.'));
      };
      worker.onerror = event => reject(new Error(event.message));
      worker.postMessage({ id, type: 'write', sheets });
    });

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
