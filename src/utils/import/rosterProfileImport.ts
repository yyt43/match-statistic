import { parseWorkbookFile, type ParsedWorkbookSheet } from './playerImport';
import { normalizeUid } from '../playerProfiles';

export interface RosterProfileImportRow {
  id?: string;
  name: string;
  groupName?: string;
  participantCode?: string;
  profile?: Record<string, string>;
}

export interface RosterColumnChoices {
  name: string;
  participantCode?: string;
  uid?: string;
  qq?: string;
}

export interface RosterWorkbookColumns {
  headers: string[];
  detected: RosterColumnChoices;
}

const ALIASES = {
  name: ['游戏昵称', '昵称', '姓名', '选手姓名', 'name', 'player', 'playername'],
  participantCode: ['选手编号', '参赛编号', '编号', 'code', 'playercode'],
  uid: ['uid', '玩家uid', '游戏uid', '游戏 uid'],
  qq: ['qq号', 'qq', '联系qq'],
};

function normalize(value: string): string {
  return value.trim().replace(/[\s\u3000]+/g, '').toLowerCase();
}

function detect(headers: string[], aliases: string[]): string | undefined {
  const normalizedAliases = aliases.map(normalize);
  return headers.find(header => normalizedAliases.includes(normalize(header)))
    ?? headers.find(header => normalizedAliases.some(alias => normalize(header).includes(alias)));
}

function rowsWithHeaders(sheet: ParsedWorkbookSheet): {
  headers: string[];
  rows: Array<Record<string, string>>;
} {
  const arrayRows = sheet.rows.filter(Array.isArray) as unknown[][];
  const first = arrayRows.find(row => row.some(value => {
    const cell = normalize(String(value ?? ''));
    return Object.values(ALIASES).flat().some(alias => cell === normalize(alias));
  })) ?? arrayRows.find(row => row.some(value => String(value ?? '').trim()));
  if (!first) return { headers: [], rows: [] };
  const headerIndex = arrayRows.indexOf(first);
  const headers = first.map(value => String(value ?? '').trim()).filter(Boolean);
  const rows: Array<Record<string, string>> = [];
  for (let index = headerIndex + 1; index < arrayRows.length; index += 1) {
    const record: Record<string, string> = {};
    headers.forEach((header, columnIndex) => {
      record[header] = String(arrayRows[index][columnIndex] ?? '').trim();
    });
    if (Object.values(record).some(Boolean)) rows.push(record);
  }
  return { headers, rows };
}

export async function getRosterWorkbookColumnsFromFile(file: File): Promise<RosterWorkbookColumns> {
  const sheets = await parseWorkbookFile(file);
  const headers = Array.from(new Set(sheets.flatMap(sheet => rowsWithHeaders(sheet).headers)));
  return {
    headers,
    detected: {
      name: detect(headers, ALIASES.name) ?? headers[0] ?? '',
      participantCode: detect(headers, ALIASES.participantCode),
      uid: detect(headers, ALIASES.uid),
      qq: detect(headers, ALIASES.qq),
    },
  };
}

export async function parseRosterProfilesFromWorkbook(
  file: File,
  columns: RosterColumnChoices
): Promise<RosterProfileImportRow[]> {
  if (!columns.name) throw new Error('必须选择昵称列');
  const sheets = await parseWorkbookFile(file);
  const parsedSheets: Array<{ name: string; rows: RosterProfileImportRow[] }> = [];
  for (const sheet of sheets) {
    const { rows } = rowsWithHeaders(sheet);
    const parsedRows: RosterProfileImportRow[] = [];
    for (const row of rows) {
      const name = row[columns.name]?.trim() ?? '';
      if (!name) continue;
      const profile: Record<string, string> = {};
      const uid = columns.uid ? normalizeUid(row[columns.uid] ?? '') : '';
      const qq = columns.qq ? row[columns.qq]?.trim() ?? '' : '';
      if (uid) profile.uid = uid;
      if (qq) profile.qq = qq;
      parsedRows.push({
        name,
        groupName: sheet.name,
        participantCode: columns.participantCode
          ? row[columns.participantCode]?.trim() ?? ''
          : '',
        profile,
      });
    }
    if (parsedRows.length > 0) parsedSheets.push({ name: sheet.name, rows: parsedRows });
  }
  const isSummarySheet = (name: string) => /全部|汇总|总表|all/i.test(name);
  const groupedSheets = parsedSheets.filter(sheet => !isSummarySheet(sheet.name));
  const selectedSheets = groupedSheets.length > 0 ? groupedSheets : parsedSheets;
  const deduplicated: RosterProfileImportRow[] = [];
  const seen = new Set<string>();
  for (const sheet of selectedSheets) {
    for (const row of sheet.rows) {
      const key = row.profile?.uid
        ? `uid:${row.profile.uid}`
        : row.participantCode
          ? `code:${row.participantCode.trim().toUpperCase()}`
          : `name:${row.name.trim().toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduplicated.push(row);
    }
  }
  return deduplicated;
}
