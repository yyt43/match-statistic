/// <reference lib="webworker" />

import * as XLSX from 'xlsx';

export interface ExcelSheetPayload {
  name: string;
  rows: (string | number)[][];
}

interface ExcelWorkerWriteRequest {
  id: string;
  type: 'write';
  sheets: ExcelSheetPayload[];
}

interface ExcelWorkerParseRequest {
  id: string;
  type: 'parse';
  buffer: ArrayBuffer;
}

type ExcelWorkerRequest = ExcelWorkerWriteRequest | ExcelWorkerParseRequest;

self.onmessage = (event: MessageEvent<ExcelWorkerRequest>) => {
  const request = event.data;
  try {
    if (request.type === 'write') {
      const workbook = XLSX.utils.book_new();
      for (const sheet of request.sheets) {
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(sheet.rows), sheet.name);
      }
      const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
      self.postMessage({ id: request.id, buffer }, { transfer: [buffer] });
      return;
    }

    const workbook = XLSX.read(request.buffer, { type: 'array' });
    const sheets = workbook.SheetNames.map(name => ({
      name,
      rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], {
        header: 1,
        raw: false,
        defval: '',
      }) as unknown[],
    }));
    self.postMessage({ id: request.id, sheets });
  } catch (error) {
    self.postMessage({
      id: request.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
