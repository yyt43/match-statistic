import type { Player, Match, GameType, PairingType, TournamentGroup } from '../../types';
import type { FinalStandingPlace } from '../advancement';
import type { StageAdvancementRecord } from '../../types';
import { getEliminationTitleI18n, getEliminatedRound } from '../ranking';
import { sortPlayers } from '../swissPairing';
import { translations, formatText, type AppLanguage } from '../../i18n/data';
import { writeExcelWorkbook, type ExcelExportOptions } from './excelWorkbook';
import { buildEliminationBracketExportRows } from '../elimination';
import { formatRecordedDoubleLoss } from '../matchResult';

/** 多阶段赛事导出：工作表名可带赛段前缀，并可追加汇总工作表。 */
export interface ExcelExportExtras {
  groupLabel?: (group: TournamentGroup) => string;
  extraSheets?: Array<{ name: string; rows: (string | number)[][] }>;
}

function getSheetLabel(group: TournamentGroup, extras?: ExcelExportExtras): string {
  const label = extras?.groupLabel?.(group) ?? group.name;
  // Excel 工作表名上限 31 个字符
  return label.length > 24 ? label.slice(0, 24) : label;
}

function withExtras(
  sheets: Array<{ name: string; rows: (string | number)[][] }>,
  extras?: ExcelExportExtras
): Array<{ name: string; rows: (string | number)[][] }> {
  return extras?.extraSheets?.length ? [...sheets, ...extras.extraSheets] : sheets;
}

type TranslationTable = Record<keyof typeof translations['zh'], string>;

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function getPlayerName(players: Player[], playerId: string, t: TranslationTable): string {
  if (playerId === 'bye') return '-';
  const player = players.find(p => p.id === playerId);
  if (!player) return t.unknownPlayer;
  return player.name;
}

function getPlayerCode(players: Player[], playerId: string): string {
  if (playerId === 'bye') return '';
  return players.find(player => player.id === playerId)?.participantCode?.trim() ?? '';
}

function getPlayerUid(players: Player[], playerId: string): string {
  if (playerId === 'bye') return '';
  return players.find(player => player.id === playerId)?.profile?.uid?.trim() ?? '';
}

function getMatchScore(match: Match): string {
  if (match.isBye) return '-';
  if (match.result === 'pending') return 'VS';
  if (match.result === 'draw') {
    return `${match.player1Games ?? 0}-${match.player2Games ?? 0}`;
  }
  if (match.player1Games !== undefined && match.player2Games !== undefined) {
    return `${match.player1Games}-${match.player2Games}`;
  }
  if (match.result === 'player1') return '1-0';
  if (match.result === 'player2') return '0-1';
  return '';
}

function getMatchResultText(match: Match, t: TranslationTable, language: AppLanguage): string {
  if (match.isBye) return t.byeResult;
  if (match.result === 'pending') return t.pendingResult;
  if (match.result === 'draw') {
    return formatRecordedDoubleLoss(match, language === 'en');
  }
  if (match.result === 'player1') return t.player1Win;
  if (match.result === 'player2') return t.player2Win;
  return '';
}

function formatPlayerMatchHistoryTextI18n(player: Player, matches: Match[], t: TranslationTable): string {
  const playerMatches = matches
    .filter(m => m.player1Id === player.id || m.player2Id === player.id)
    .sort((a, b) => a.round - b.round);
  if (playerMatches.length === 0) return '-';
  return playerMatches
    .map(m => {
      if (m.isBye) return t.byeResult;
      if (m.result === 'pending') return t.pendingResult;
      if (m.result === 'draw') {
        return formatRecordedDoubleLoss(m);
      }
      if (m.result === 'player1') return m.player1Id === player.id ? 'W' : 'L';
      if (m.result === 'player2') return m.player2Id === player.id ? 'W' : 'L';
      return '';
    })
    .join('-');
}

/** 生成排行榜表格数据（表头+行），供预览和导出共用 */
export function getRankingTableData(group: TournamentGroup, language: AppLanguage = 'zh'): { headers: string[]; rows: (string | number)[][] } {
  const t = translations[language];
  const sortedPlayers = sortPlayers(
    group.players,
    group.gameType,
    group.pairingType,
    group.tiebreakRules
  );
  const isMultiGame = group.gameType !== 'bo1';
  const isSingleElimination = group.pairingType === 'single_elimination';

  let headers: string[];
  if (isSingleElimination) {
    headers = [
      t.rankCol,
      t.participantCodeCol,
      t.playerCol,
      t.uidCol,
      t.titleCol,
      `${t.recordCol}(W-L)`,
      t.eliminatedRoundCol,
    ];
  } else {
    headers = [
      t.rankCol,
      t.participantCodeCol,
      t.playerCol,
      t.uidCol,
      `${t.recordCol}(W-L)`,
      t.winRateCol,
      t.oppWinRateCol,
    ];
    if (isMultiGame) {
      headers.push(t.gameWinRateCol, t.oppGameWinRateCol);
    } else {
      headers.push(t.oppOppWinRateCol);
    }
    headers.push(t.historyCol);
  }

  const rows: (string | number)[][] = sortedPlayers.map((player, index) => {
    const isCompleted = group.status === 'completed';
    const isSingleElim = group.pairingType === 'single_elimination';
    const baseDisplayName = player.name;
    const displayName = player.dropped
      ? `${baseDisplayName}${t.dropppedMark}`
      : (player.eliminated && !(isCompleted && isSingleElim))
        ? `${baseDisplayName}${t.eliminatedMark}`
        : baseDisplayName;
    const rank = index + 1;
    const participantCode = player.participantCode?.trim() ?? '';
    const uid = player.profile?.uid?.trim() ?? '';

    if (isSingleElimination) {
      const eliminatedRound = getEliminatedRound(player, group.matches);
      const eliminatedText = eliminatedRound !== null
        ? formatText(t.eliminatedRound, { round: eliminatedRound })
        : rank === 1 ? t.champion : '-';
      return [
        rank,
        participantCode,
        displayName,
        uid,
        getEliminationTitleI18n(rank, group.totalRounds, language),
        `${player.wins}-${player.losses}`,
        eliminatedText,
      ];
    } else {
      const row: (string | number)[] = [
        rank,
        participantCode,
        displayName,
        uid,
        `${player.wins}-${player.losses}`,
        formatPercent(player.winRate),
        formatPercent(player.opponentWinRate),
      ];
      if (isMultiGame) {
        row.push(formatPercent(player.gameWinRate));
        row.push(formatPercent(player.opponentGameWinRate));
      } else {
        row.push(formatPercent(player.opponentOpponentWinRate));
      }
      row.push(formatPlayerMatchHistoryTextI18n(player, group.matches, t));
      return row;
    }
  });

  return { headers, rows };
}

/** 生成某轮对阵表数据，供预览和导出共用 */
export function getMatchTableData(group: TournamentGroup, round: number, language: AppLanguage = 'zh'): { headers: string[]; rows: (string | number)[][] } {
  const t = translations[language];
  const roundMatches = group.matches
    .filter(m => m.round === round)
    .sort((a, b) => {
      if (a.isBye && !b.isBye) return 1;
      if (!a.isBye && b.isBye) return -1;
      return 0;
    });

  const headers = [
    t.matchNoCol,
    `${t.participantCodeCol} 1`,
    `${t.playerCol} 1`,
    `${t.uidCol} 1`,
    t.scoreCol,
    `${t.participantCodeCol} 2`,
    `${t.playerCol} 2`,
    `${t.uidCol} 2`,
    t.resultCol,
  ];
  const rows: (string | number)[][] = roundMatches.map((match, index) => [
    index + 1,
    getPlayerCode(group.players, match.player1Id),
    getPlayerName(group.players, match.player1Id, t),
    getPlayerUid(group.players, match.player1Id),
    getMatchScore(match),
    match.isBye ? '' : getPlayerCode(group.players, match.player2Id),
    match.isBye ? '-' : getPlayerName(group.players, match.player2Id, t),
    match.isBye ? '' : getPlayerUid(group.players, match.player2Id),
    getMatchResultText(match, t, language),
  ]);

  return { headers, rows };
}

export function getEliminationBracketTableData(
  group: TournamentGroup,
  language: AppLanguage = 'zh'
): { headers: string[]; rows: (string | number)[][] } {
  const t = translations[language];
  const headers = [
    language === 'en' ? 'Round' : '轮次',
    language === 'en' ? 'Match' : '场次',
    `${t.participantCodeCol} 1`,
    `${t.playerCol} 1`,
    `${t.uidCol} 1`,
    `${t.participantCodeCol} 2`,
    `${t.playerCol} 2`,
    `${t.uidCol} 2`,
    t.scoreCol,
    language === 'en' ? 'Winner' : '胜者',
    t.resultCol,
  ];
  const rows: (string | number)[][] = buildEliminationBracketExportRows(group, language).map(row => [
    language === 'en' ? `Round ${row.round}` : `第${row.round}轮`,
    row.matchIndex + 1,
    row.player1Code,
    row.player1Name,
    row.player1Uid,
    row.player2Code,
    row.player2Name,
    row.player2Uid,
    row.score,
    row.winnerName,
    row.status,
  ]);
  return { headers, rows };
}

export async function exportEliminationBracketToExcel(
  group: TournamentGroup,
  competitionName: string,
  language: AppLanguage = 'zh',
  options?: ExcelExportOptions
): Promise<void> {
  const { headers, rows } = getEliminationBracketTableData(group, language);
  const sheetName = language === 'en' ? 'Bracket' : '淘汰签表';
  await writeExcelWorkbook(
    [{ name: sheetName, rows: [headers, ...rows] }],
    `${competitionName}-${group.name}-${sheetName}.xlsx`,
    options
  );
}

export async function exportAllGroupsBracketsToExcel(
  groups: TournamentGroup[],
  competitionName: string,
  language: AppLanguage = 'zh',
  options?: ExcelExportOptions,
  extras?: ExcelExportExtras
): Promise<void> {
  const sheetName = language === 'en' ? 'Bracket' : '淘汰签表';
  const sheets = groups
    .filter(group => group.eliminationBracket)
    .map(group => {
      const { headers, rows } = getEliminationBracketTableData(group, language);
      return {
        name: `${getSheetLabel(group, extras)}-${sheetName}`,
        rows: [headers, ...rows],
      };
    });
  await writeExcelWorkbook(withExtras(sheets, extras), `${competitionName}-${sheetName}.xlsx`, options);
}

export async function exportRankingToExcel(
  players: Player[],
  competitionName: string,
  groupName: string,
  gameType: GameType,
  matches?: Match[],
  pairingType: PairingType = 'swiss',
  totalRounds?: number,
  language: AppLanguage = 'zh',
  options?: ExcelExportOptions
): Promise<void> {
  const group: TournamentGroup = {
    id: '', name: groupName, players, gameType, pairingType,
    totalRounds: totalRounds || 5, currentRound: 0, matches: matches || [],
    status: 'setup', createdAt: '',
  };
  const { headers, rows } = getRankingTableData(group, language);
  const t = translations[language];
  const data: (string | number)[][] = [headers, ...rows];
  await writeExcelWorkbook([{ name: t.ranking, rows: data }], `${competitionName}-${groupName}-${t.ranking}.xlsx`, options);
}

export async function exportMatchesToExcel(
  matches: Match[],
  players: Player[],
  competitionName: string,
  groupName: string,
  round: number,
  language: AppLanguage = 'zh',
  options?: ExcelExportOptions
): Promise<void> {
  const group: TournamentGroup = {
    id: '', name: groupName, players, gameType: 'bo1', pairingType: 'swiss',
    totalRounds: round, currentRound: round, matches, status: 'in_progress', createdAt: '',
  };
  const { headers, rows } = getMatchTableData(group, round, language);
  const t = translations[language];
  const data: (string | number)[][] = [headers, ...rows];
  await writeExcelWorkbook(
    [{ name: formatText(t.roundN, { round }), rows: data }],
    `${competitionName}-${groupName}-${formatText(t.roundN, { round })} ${t.matchTable}.xlsx`,
    options
  );
}

export async function exportAllRoundsToExcel(
  matches: Match[],
  players: Player[],
  competitionName: string,
  groupName: string,
  totalRounds: number,
  language: AppLanguage = 'zh',
  options?: ExcelExportOptions
): Promise<void> {
  const group: TournamentGroup = {
    id: '', name: groupName, players, gameType: 'bo1', pairingType: 'swiss',
    totalRounds, currentRound: totalRounds, matches, status: 'in_progress', createdAt: '',
  };
  const t = translations[language];
  const sheets: Array<{ name: string; rows: (string | number)[][] }> = [];
  for (let round = 1; round <= totalRounds; round++) {
    const { headers, rows } = getMatchTableData(group, round, language);
    if (rows.length === 0) continue;
    const data: (string | number)[][] = [headers, ...rows];
    sheets.push({ name: formatText(t.roundN, { round }), rows: data });
  }
  await writeExcelWorkbook(sheets, `${competitionName}-${groupName}-${t.matchTable}.xlsx`, options);
}

/** 导出单小组总表（排行榜+全部对阵） */
export async function exportGroupSummaryToExcel(
  group: TournamentGroup,
  competitionName: string,
  language: AppLanguage = 'zh',
  options?: ExcelExportOptions,
  extras?: ExcelExportExtras
): Promise<void> {
  const t = translations[language];
  const { headers, rows } = getRankingTableData(group, language);
  const rankData: (string | number)[][] = [headers, ...rows];
  const sheets: Array<{ name: string; rows: (string | number)[][] }> = [
    { name: t.ranking, rows: rankData },
  ];
  if (group.eliminationBracket) {
    const { headers: bracketHeaders, rows: bracketRows } =
      getEliminationBracketTableData(group, language);
    sheets.push({
      name: language === 'en' ? 'Bracket' : '淘汰签表',
      rows: [bracketHeaders, ...bracketRows],
    });
  }
  for (let round = 1; round <= group.totalRounds; round++) {
    const { headers: mHeaders, rows: mRows } = getMatchTableData(group, round, language);
    if (mRows.length === 0) continue;
    const mData: (string | number)[][] = [mHeaders, ...mRows];
    sheets.push({ name: formatText(t.roundN, { round }), rows: mData });
  }
  await writeExcelWorkbook(
    withExtras(sheets, extras),
    `${competitionName}-${getSheetLabel(group, extras)}-${t.summary}.xlsx`,
    options
  );
}

export async function exportAllGroupsToExcel(
  groups: TournamentGroup[],
  competitionName: string,
  language: AppLanguage = 'zh',
  options?: ExcelExportOptions,
  extras?: ExcelExportExtras
): Promise<void> {
  const t = translations[language];
  const sheets: Array<{ name: string; rows: (string | number)[][] }> = [];
  groups.forEach(group => {
    const { headers, rows } = getRankingTableData(group, language);
    const data: (string | number)[][] = [headers, ...rows];
    const label = getSheetLabel(group, extras);
    sheets.push({ name: `${label}-${t.ranking}`, rows: data });
    if (group.eliminationBracket) {
      const { headers: bracketHeaders, rows: bracketRows } =
        getEliminationBracketTableData(group, language);
      sheets.push({
        name: `${label}-${language === 'en' ? 'Bracket' : '淘汰签表'}`,
        rows: [bracketHeaders, ...bracketRows],
      });
    }
    for (let round = 1; round <= group.totalRounds; round++) {
      const { headers: mHeaders, rows: mRows } = getMatchTableData(group, round, language);
      if (mRows.length === 0) continue;
      const mData: (string | number)[][] = [mHeaders, ...mRows];
      sheets.push({ name: `${label}-${formatText(t.roundN, { round })}`, rows: mData });
    }
  });
  await writeExcelWorkbook(withExtras(sheets, extras), `${competitionName}-${t.summary}.xlsx`, options);
}

export async function exportAllGroupsRankingToExcel(
  groups: TournamentGroup[],
  competitionName: string,
  language: AppLanguage = 'zh',
  options?: ExcelExportOptions,
  extras?: ExcelExportExtras
): Promise<void> {
  const t = translations[language];
  const sheets: Array<{ name: string; rows: (string | number)[][] }> = [];
  groups.forEach(group => {
    if (group.currentRound === 0) return;
    const { headers, rows } = getRankingTableData(group, language);
    const data: (string | number)[][] = [headers, ...rows];
    sheets.push({ name: `${getSheetLabel(group, extras)}-${t.ranking}`, rows: data });
  });
  await writeExcelWorkbook(
    withExtras(sheets, extras),
    `${competitionName}-${t.allGroups} ${t.ranking}.xlsx`,
    options
  );
}

/** 导出所有小组本轮对阵表 */
export async function exportAllGroupsCurrentRoundMatchesToExcel(
  groups: TournamentGroup[],
  competitionName: string,
  language: AppLanguage = 'zh',
  options?: ExcelExportOptions,
  extras?: ExcelExportExtras
): Promise<void> {
  const t = translations[language];
  const sheets: Array<{ name: string; rows: (string | number)[][] }> = [];
  groups.forEach(group => {
    if (group.currentRound === 0) return;
    const { headers, rows } = getMatchTableData(group, group.currentRound, language);
    if (rows.length === 0) return;
    const data: (string | number)[][] = [headers, ...rows];
    sheets.push({
      name: `${getSheetLabel(group, extras)}-${formatText(t.roundN, { round: group.currentRound })}`,
      rows: data,
    });
  });
  await writeExcelWorkbook(
    withExtras(sheets, extras),
    `${competitionName}-${t.allGroups} ${t.matchTable}.xlsx`,
    options
  );
}

export async function exportSingleSheetToExcel(
  sheetName: string,
  rows: (string | number)[][],
  fileName: string,
  options?: ExcelExportOptions,
  extras?: ExcelExportExtras
): Promise<void> {
  await writeExcelWorkbook(withExtras([{ name: sheetName, rows }], extras), fileName, options);
}

/** 多阶段赛事汇总工作表：最终名次 + 晋级记录。 */
export function buildMultiStageSummarySheets(
  standings: FinalStandingPlace[],
  records: StageAdvancementRecord[],
  stageNames: Map<string, string>,
  language: AppLanguage = 'zh'
): Array<{ name: string; rows: (string | number)[][] }> {
  const isEnglish = language === 'en';
  const sheets: Array<{ name: string; rows: (string | number)[][] }> = [];

  if (standings.length > 0) {
    sheets.push({
      name: isEnglish ? 'Final standings' : '最终名次',
      rows: [
        isEnglish ? ['Place', 'Code', 'Name'] : ['名次', '编号', '昵称'],
        ...standings.flatMap(entry =>
          entry.players.map(player => [entry.place, player.participantCode ?? '', player.name])
        ),
      ],
    });
  }

  if (records.length > 0) {
    sheets.push({
      name: isEnglish ? 'Advancement' : '晋级记录',
      rows: [
        isEnglish
          ? ['Source stage', 'Target stage', 'Confirmed at', 'Place', 'Group', 'Code', 'Name']
          : ['来源赛段', '目标赛段', '确认时间', '名次', '小组', '编号', '昵称'],
        ...records.flatMap(record =>
          record.seats.map(seat => [
            stageNames.get(record.sourceStageId) ?? record.sourceStageId,
            stageNames.get(seat.targetStageId ?? '') ?? seat.targetStageId ?? '',
            new Date(record.confirmedAt).toLocaleString(),
            seat.targetSlot !== undefined ? seat.targetSlot + 1 : seat.finalRank,
            seat.originGroupName ?? seat.sourceGroupName,
            seat.participantCode ?? '',
            seat.name,
          ])
        ),
      ],
    });
  }

  return sheets;
}

/** 需要单独导出汇总工作簿时使用。 */
export async function exportMultiStageSummaryToExcel(
  standings: FinalStandingPlace[],
  records: StageAdvancementRecord[],
  stageNames: Map<string, string>,
  competitionName: string,
  language: AppLanguage = 'zh',
  options?: ExcelExportOptions
): Promise<void> {
  const sheets = buildMultiStageSummarySheets(standings, records, stageNames, language);
  if (sheets.length === 0) return;
  await writeExcelWorkbook(
    sheets,
    `${competitionName}-${language === 'en' ? 'summary' : '汇总'}.xlsx`,
    options
  );
}
