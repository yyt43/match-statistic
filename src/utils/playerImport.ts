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

export function summarizeWorkbookImport(
  workbook: { SheetNames: string[]; Sheets: Record<string, import('xlsx').WorkSheet> },
  XLSX: typeof import('xlsx')
): WorkbookImportSummary {
  const groups: WorkbookImportSummary['groups'] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const data = XLSX.utils.sheet_to_json(sheet, {
      raw: false,
      defval: '',
    }) as Array<Record<string, string | number | null>>;

    const values: string[] = [];
    for (const row of data) {
      const cells = Object.values(row)
        .map(value => typeof value === 'string' ? value.trim() : String(value ?? '').trim())
        .filter(value => value.length > 0);
      values.push(...cells);
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
  XLSX: typeof import('xlsx')
): ParsedGroupImport[] {
  const groups: ParsedGroupImport[] = [];

  const summary = summarizeWorkbookImport(workbook, XLSX);
  for (const group of summary.groups) {
    if (group.names.length === 0) continue;
    groups.push({
      groupName: group.groupName,
      names: group.names,
    });
  }

  return groups;
}

export async function parsePlayerNamesFromExcel(file: File): Promise<string[]> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });

  const groups = extractPlayerGroupsFromWorkbook(workbook, XLSX);
  const mergedNames: string[] = [];
  for (const group of groups) {
    mergedNames.push(...group.names);
  }
  return parsePlayerNamesFromText(mergedNames.join('\n'));
}

export async function parsePlayerGroupsFromExcel(file: File): Promise<ParsedGroupImport[]> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  return extractPlayerGroupsFromWorkbook(workbook, XLSX);
}
