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
      request.sheets.forEach((sheet, index) => {
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(sheet.rows), sheet.name);
        self.postMessage({
          id: request.id,
          phase: 'preparing',
          progress: Math.round(((index + 1) / request.sheets.length) * 80),
        });
      });
      self.postMessage({ id: request.id, phase: 'writing', progress: 90 });
      const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
      self.postMessage({ id: request.id, phase: 'writing', progress: 100 });
      self.postMessage({ id: request.id, buffer }, [buffer]);
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
