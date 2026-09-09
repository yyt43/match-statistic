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

export async function parsePlayerNamesFromExcel(file: File): Promise<string[]> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });

  const rows: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json<string[]>(sheet, {
      raw: false,
      defval: '',
    });

    for (const row of data) {
      const cells = Object.values(row)
        .map(value => typeof value === 'string' ? value.trim() : String(value ?? '').trim())
        .filter(value => value.length > 0);
      rows.push(...cells);
    }
  }

  return parsePlayerNamesFromText(rows.join('\n'));
}
