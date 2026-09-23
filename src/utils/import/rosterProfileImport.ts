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
  isResultCollection: boolean;
}

const ALIASES: Record<keyof RosterColumnChoices, string[]> = {
  name: ['游戏昵称', '昵称', '姓名', '选手姓名', 'name', 'player', 'playername'],
  participantCode: ['选手编号', '参赛编号', '编号', 'code', 'playercode'],
  uid: ['uid', '玩家uid', '游戏uid', '游戏 uid'],
  qq: ['qq号', 'qq', '联系qq'],
};

const RESULT_COLLECTION_HEADERS = ['比分', '截图', '提交时间', '提交者'];

function normalize(value: string): string {
  return value.trim().replace(/[\s\u3000]+/g, '').toLowerCase();
}

function detect(headers: string[], aliases: string[]): string | undefined {
  const normalizedAliases = aliases.map(normalize);
  return headers.find(header => normalizedAliases.includes(normalize(header)))
    ?? headers.find(header => normalizedAliases.some(alias => normalize(header).includes(alias)));
}

function isAlias(value: string, aliases: string[]): boolean {
  const normalizedValue = normalize(value);
  return aliases.some(alias => {
    const normalizedAlias = normalize(alias);
    return normalizedValue === normalizedAlias || normalizedValue.includes(normalizedAlias);
  });
}

function resolveColumnForSheet(
  headers: string[],
  selected: string | undefined,
  aliases: string[]
): string | undefined {
  if (!selected) return undefined;
  const normalizedSelected = normalize(selected);
  const exactMatch = headers.find(header => normalize(header) === normalizedSelected);
  if (exactMatch) return exactMatch;
  return isAlias(selected, aliases) ? detect(headers, aliases) : undefined;
}

export function detectRosterColumns(headers: string[]): RosterColumnChoices {
  return {
    name: detect(headers, ALIASES.name) ?? '',
    participantCode: detect(headers, ALIASES.participantCode),
    uid: detect(headers, ALIASES.uid),
    qq: detect(headers, ALIASES.qq),
  };
}

export function isResultCollectionWorkbook(headers: string[]): boolean {
  const normalizedHeaders = headers.map(normalize);
  const hasScoreHeader = normalizedHeaders.some(header => header.includes('比分'));
  const hasSubmissionHeader = normalizedHeaders.some(header =>
    RESULT_COLLECTION_HEADERS.some(alias => header.includes(normalize(alias)))
  );
  return hasScoreHeader && hasSubmissionHeader;
}

function rowsWithHeaders(sheet: ParsedWorkbookSheet): {
  headers: string[];
  rows: Array<Record<string, string>>;
} {
  const arrayRows = sheet.rows.filter(Array.isArray) as unknown[][];
  const headerAliases = Object.values(ALIASES).flat().map(normalize);
  const first = arrayRows.find(row => row.some(value => {
    const cell = normalize(String(value ?? ''));
    return headerAliases.some(alias => cell === alias || cell.includes(alias));
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
    detected: detectRosterColumns(headers),
    isResultCollection: isResultCollectionWorkbook(headers),
  };
}

export async function parseRosterProfilesFromWorkbook(
  file: File,
  columns: RosterColumnChoices
): Promise<RosterProfileImportRow[]> {
  return parseRosterProfilesFromSheets(await parseWorkbookFile(file), columns);
}

export function parseRosterProfilesFromSheets(
  sheets: ParsedWorkbookSheet[],
  columns: RosterColumnChoices
): RosterProfileImportRow[] {
  if (!columns.name) throw new Error('必须选择昵称列');
  const sheetData = sheets.map(sheet => ({
    name: sheet.name,
    ...rowsWithHeaders(sheet),
  }));
  const headers = Array.from(new Set(sheetData.flatMap(sheet => sheet.headers)));
  if (isResultCollectionWorkbook(headers)) {
    throw new Error('这是比赛结果收集表，不是选手信息表。当前选手、分组和赛制数据已保留。');
  }
  const parsedSheets: Array<{ name: string; rows: RosterProfileImportRow[] }> = [];
  for (const sheet of sheetData) {
    const sheetColumns: RosterColumnChoices = {
      name: resolveColumnForSheet(sheet.headers, columns.name, ALIASES.name) ?? '',
      participantCode: resolveColumnForSheet(
        sheet.headers,
        columns.participantCode,
        ALIASES.participantCode
      ),
      uid: resolveColumnForSheet(sheet.headers, columns.uid, ALIASES.uid),
      qq: resolveColumnForSheet(sheet.headers, columns.qq, ALIASES.qq),
    };
    if (!sheetColumns.name) continue;
    const parsedRows: RosterProfileImportRow[] = [];
    for (const row of sheet.rows) {
      const name = row[sheetColumns.name]?.trim() ?? '';
      if (!name) continue;
      const profile: Record<string, string> = {};
      const uid = sheetColumns.uid ? normalizeUid(row[sheetColumns.uid] ?? '') : '';
      const qq = sheetColumns.qq ? row[sheetColumns.qq]?.trim() ?? '' : '';
      if (uid) profile.uid = uid;
      if (qq) profile.qq = qq;
      parsedRows.push({
        name,
        groupName: sheet.name,
        participantCode: sheetColumns.participantCode
          ? row[sheetColumns.participantCode]?.trim() ?? ''
          : '',
        profile,
      });
    }
    if (parsedRows.length > 0) parsedSheets.push({ name: sheet.name, rows: parsedRows });
  }
  const isSummarySheet = (name: string) => /全部|汇总|总表|报名|all/i.test(name);
  const groupedSheets = parsedSheets.filter(sheet => !isSummarySheet(sheet.name));
  const selectedSheets = groupedSheets.length > 0 ? groupedSheets : parsedSheets;
  const deduplicated: RosterProfileImportRow[] = [];
  const globalSeen = new Set<string>();
  for (const sheet of selectedSheets) {
    const sheetSeen = new Set<string>();
    for (const row of sheet.rows) {
      const uid = row.profile?.uid?.trim();
      const participantCode = row.participantCode?.trim();
      const key = uid
        ? `uid:${uid}`
        : participantCode
          ? `code:${participantCode.toUpperCase()}`
          : `name:${row.name.trim().toLowerCase()}`;
      const seen = uid || participantCode ? globalSeen : sheetSeen;
      if (seen.has(key)) continue;
      seen.add(key);
      deduplicated.push(row);
    }
  }
  if (deduplicated.length === 0) {
    throw new Error('没有从表格中读取到选手数据，当前选手、分组和赛制数据已保留。');
  }
  return deduplicated;
}
