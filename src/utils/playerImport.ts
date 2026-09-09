export function parsePlayerNamesFromText(input: string): string[] {
  const normalized = input
    .replace(/\r/g, '\n')
    .replace(/[\t\u3000]+/g, ' ')
    .replace(/\s*[,;\n]+\s*/g, '\n')
    .split('\n')
    .map(v => v.trim())
    .filter(v => v.length > 0)
    .filter(v => !/^姓名$|^name$/i.test(v));

  const unique: string[] = [];
  const seen = new Set<string>();

  for (const name of normalized) {
    const cleaned = name.replace(/^['\"]|['\"]$/g, '').trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(cleaned);
  }

  return unique;
}

export interface ParsedGroupImport {
  groupName: string;
  names: string[];
}

export function extractPlayerGroupsFromWorkbook(workbook: { SheetNames: string[]; Sheets: Record<string, any> }, XLSX: typeof import('xlsx')): ParsedGroupImport[] {
  const groups: ParsedGroupImport[] = [];

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

    const names = parsePlayerNamesFromText(values.join('\n'));
    if (names.length === 0) continue;

    groups.push({
      groupName: (sheetName || '新小组').trim() || '新小组',
      names,
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
