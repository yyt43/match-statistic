export interface PlayerNameImportSummary {
  validNames: string[];
  duplicateNames: string[];
  ignoredEntries: string[];
  rawEntries: string[];
}

export function summarizePlayerNameInput(input: string): PlayerNameImportSummary {
  const rawEntries = input
    .replace(/\r/g, '\n')
    .replace(/[\t\u3000]+/g, ' ')
    .replace(/\s*[,;\n]+\s*/g, '\n')
    .split('\n')
    .map(v => v.trim())
    .filter(v => v.length > 0);

  const validNames: string[] = [];
  const duplicateNames: string[] = [];
  const ignoredEntries: string[] = [];
  const seen = new Set<string>();

  for (const entry of rawEntries) {
    if (/^姓名$|^name$/i.test(entry)) {
      ignoredEntries.push(entry);
      continue;
    }

    const cleaned = entry.replace(/^['"]|['"]$/g, '').trim();
    if (!cleaned) {
      ignoredEntries.push(entry);
      continue;
    }

    if (/[#$@%*+=|<>]/.test(cleaned) || /https?:\/\//i.test(cleaned)) {
      ignoredEntries.push(cleaned);
      continue;
    }

    const key = cleaned.toLowerCase();
    if (seen.has(key)) {
      duplicateNames.push(cleaned);
      ignoredEntries.push(entry);
      continue;
    }

    seen.add(key);
    validNames.push(cleaned);
  }

  return { validNames, duplicateNames, ignoredEntries, rawEntries };
}

export function parsePlayerNamesFromText(input: string): string[] {
  return summarizePlayerNameInput(input).validNames;
}

export interface ParsedGroupImport {
  groupName: string;
  names: string[];
}

export interface WorkbookImportSummary {
  sheetCount: number;
  totalValidNames: number;
  totalDuplicateNames: number;
  totalIgnoredEntries: number;
  groups: Array<ParsedGroupImport & {
    validNames: string[];
    duplicateNames: string[];
    ignoredEntries: string[];
  }>;
}

export interface WorkbookImportOptions {
  selectedColumns?: Record<string, string>;
}

export interface SheetColumnChoice {
  sheetName: string;
  columns: string[];
  detectedColumn: string;
}

const NAME_COLUMN_CANDIDATES = [
  '姓名', 'name', 'player', 'playername', '选手', '参赛者', '选手姓名', 'fullname', 'full name'
];

function normalizeColumnLabel(value: string): string {
  return value.trim().replace(/[\s\u3000]+/g, '').toLowerCase();
}

function isObjectRow(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeWorkbookRows(rows: unknown[]): { headers: string[]; dataRows: Array<Record<string, string>> } {
  if (rows.length === 0) {
    return { headers: [], dataRows: [] };
  }

  const firstNonEmptyRow = rows.find(row => {
    if (Array.isArray(row)) {
      return row.some(value => String(value ?? '').trim().length > 0);
    }
    if (isObjectRow(row)) {
      return Object.values(row).some(value => String(value ?? '').trim().length > 0);
    }
    return false;
  });

  if (!firstNonEmptyRow) {
    return { headers: [], dataRows: [] };
  }

  if (Array.isArray(firstNonEmptyRow)) {
    const headers = firstNonEmptyRow.map(value => String(value ?? '').trim()).filter(Boolean);
    const dataRows = rows
      .filter(row => row !== firstNonEmptyRow && Array.isArray(row))
      .map(row => {
        const values = row as Array<string | number | null>;
        const result: Record<string, string> = {};
        headers.forEach((header, index) => {
          result[header] = String(values[index] ?? '').trim();
        });
        return result;
      });
    return { headers, dataRows };
  }

  if (isObjectRow(firstNonEmptyRow)) {
    const rowKeys = Object.keys(firstNonEmptyRow);
    const rowValues = Object.values(firstNonEmptyRow).map(value => String(value ?? '').trim());
    const looksLikeHeaderRow = rowValues.some(value =>
      NAME_COLUMN_CANDIDATES.some(candidate =>
        normalizeColumnLabel(value).includes(normalizeColumnLabel(candidate))
      ) || /^(姓名|name|player|选手|playername)$/i.test(value)
    );

    const headers = looksLikeHeaderRow ? rowKeys : rowKeys.length > 0 ? rowKeys : [];
    const dataRows = rows
      .filter(row => (!looksLikeHeaderRow ? true : row !== firstNonEmptyRow) && isObjectRow(row))
      .map(row => {
        const result: Record<string, string> = {};
        const rowEntries = Object.entries(row);
        rowEntries.forEach(([key, value]) => {
          const headerName = headers.includes(key) ? key : key;
          result[headerName] = String(value ?? '').trim();
        });
        return result;
      });

    if (looksLikeHeaderRow) {
      return { headers, dataRows };
    }

    const fallbackRows = rows.filter(isObjectRow).map(row => {
      const result: Record<string, string> = {};
      Object.entries(row).forEach(([key, value]) => {
        result[key] = String(value ?? '').trim();
      });
      return result;
    });
    return { headers: rowKeys.length > 0 ? rowKeys : [], dataRows: fallbackRows };
  }

  return { headers: [], dataRows: [] };
}

function detectNameColumn(headers: string[]): string {
  const normalizedHeaders = headers.map(header => normalizeColumnLabel(header));
  const matchIndex = normalizedHeaders.findIndex(header =>
    NAME_COLUMN_CANDIDATES.some(candidate =>
      header.includes(normalizeColumnLabel(candidate))
    )
  );
  return matchIndex >= 0 ? headers[matchIndex] : headers[0] || '';
}

export function getWorkbookImportColumnChoices(
  workbook: { SheetNames: string[]; Sheets: Record<string, import('xlsx').WorkSheet> },
  XLSX: typeof import('xlsx')
): SheetColumnChoice[] {
  const choices: SheetColumnChoice[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: '',
    }) as unknown[];
    const { headers } = normalizeWorkbookRows(rows);

    choices.push({
      sheetName,
      columns: headers,
      detectedColumn: detectNameColumn(headers),
    });
  }

  return choices;
}

function resolveSelectedNameColumn(
  sheetName: string,
  headers: string[],
  selectedColumns?: Record<string, string>
): string {
  if (selectedColumns && selectedColumns[sheetName]) {
    const selected = selectedColumns[sheetName];
    const matchedIndex = headers.findIndex(header => normalizeColumnLabel(header) === normalizeColumnLabel(selected));
    if (matchedIndex >= 0) return headers[matchedIndex];
  }

  return detectNameColumn(headers);
}

export function summarizeWorkbookImport(
  workbook: { SheetNames: string[]; Sheets: Record<string, import('xlsx').WorkSheet> },
  XLSX: typeof import('xlsx'),
  options: WorkbookImportOptions = {}
): WorkbookImportSummary {
  const groups: WorkbookImportSummary['groups'] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: '',
    }) as unknown[];
    const { headers, dataRows } = normalizeWorkbookRows(rows);
    const selectedHeader = resolveSelectedNameColumn(sheetName, headers, options.selectedColumns);
    const columnName = selectedHeader ? headers.find(header => normalizeColumnLabel(header) === normalizeColumnLabel(selectedHeader)) ?? headers[0] : headers[0];

    const values: string[] = [];
    for (const row of dataRows) {
      const value = columnName ? row[columnName] ?? row[headers[0] ?? ''] ?? '' : '';
      const normalized = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
      if (!normalized || normalized === '姓名' || normalized === 'name') continue;
      values.push(normalized);
    }

    const summary = summarizePlayerNameInput(values.join('\n'));
    groups.push({
      groupName: (sheetName || '新小组').trim() || '新小组',
      names: summary.validNames,
      validNames: summary.validNames,
      duplicateNames: summary.duplicateNames,
      ignoredEntries: summary.ignoredEntries,
    });
  }

  const totalValidNames = groups.reduce((sum, group) => sum + group.names.length, 0);
  const totalDuplicateNames = groups.reduce((sum, group) => sum + group.duplicateNames.length, 0);
  const totalIgnoredEntries = groups.reduce((sum, group) => sum + group.ignoredEntries.length, 0);

  return {
    sheetCount: groups.length,
    totalValidNames,
    totalDuplicateNames,
    totalIgnoredEntries,
    groups,
  };
}

export function extractPlayerGroupsFromWorkbook(
  workbook: { SheetNames: string[]; Sheets: Record<string, import('xlsx').WorkSheet> },
  XLSX: typeof import('xlsx'),
  options: WorkbookImportOptions = {}
): ParsedGroupImport[] {
  const groups: ParsedGroupImport[] = [];

  const summary = summarizeWorkbookImport(workbook, XLSX, options);
  for (const group of summary.groups) {
    if (group.names.length === 0) continue;
    groups.push({
      groupName: group.groupName,
      names: group.names,
    });
  }

  return groups;
}

export async function parsePlayerNamesFromExcel(file: File, selectedColumns?: Record<string, string>): Promise<string[]> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });

  const groups = extractPlayerGroupsFromWorkbook(workbook, XLSX, { selectedColumns });
  const mergedNames: string[] = [];
  for (const group of groups) {
    mergedNames.push(...group.names);
  }
  return parsePlayerNamesFromText(mergedNames.join('\n'));
}

export async function parsePlayerGroupsFromExcel(file: File, selectedColumns?: Record<string, string>): Promise<ParsedGroupImport[]> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  return extractPlayerGroupsFromWorkbook(workbook, XLSX, { selectedColumns });
}
