import type { Player, Match, GameType, PairingType, TournamentGroup } from '../../types';
import { getEliminationTitleI18n, getEliminatedRound } from '../ranking';
import { sortPlayers } from '../swissPairing';
import { translations, formatText, type AppLanguage } from '../../i18n/data';
import { writeExcelWorkbook } from './excelWorkbook';

type TranslationTable = Record<keyof typeof translations['zh'], string>;

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function getPlayerName(players: Player[], playerId: string, t: TranslationTable): string {
  if (playerId === 'bye') return '-';
  const player = players.find(p => p.id === playerId);
  return player ? player.name : t.unknownPlayer;
}

function getMatchScore(match: Match): string {
  if (match.isBye) return '-';
  if (match.result === 'pending') return 'VS';
  if (match.result === 'draw') return '0-0';
  if (match.player1Games !== undefined && match.player2Games !== undefined) {
    return `${match.player1Games}-${match.player2Games}`;
  }
  if (match.result === 'player1') return '1-0';
  if (match.result === 'player2') return '0-1';
  return '';
}

function getMatchResultText(match: Match, t: TranslationTable): string {
  if (match.isBye) return t.byeResult;
  if (match.result === 'pending') return t.pendingResult;
  if (match.result === 'draw') return t.drawResult;
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
      if (m.result === 'draw') return t.drawResult;
      if (m.result === 'player1') return m.player1Id === player.id ? 'W' : 'L';
      if (m.result === 'player2') return m.player2Id === player.id ? 'W' : 'L';
      return '';
    })
    .join('-');
}

/** 生成排行榜表格数据（表头+行），供预览和导出共用 */
export function getRankingTableData(group: TournamentGroup, language: AppLanguage = 'zh'): { headers: string[]; rows: (string | number)[][] } {
  const t = translations[language];
  const sortedPlayers = sortPlayers(group.players, group.gameType, group.pairingType);
  const isMultiGame = group.gameType !== 'bo1';
  const isSingleElimination = group.pairingType === 'single_elimination';

  let headers: string[];
  if (isSingleElimination) {
    headers = [t.rankCol, t.playerCol, t.titleCol, `${t.recordCol}(W-L)`, t.eliminatedRoundCol];
  } else {
    headers = [t.rankCol, t.playerCol, `${t.recordCol}(W-L)`, t.winRateCol, t.oppWinRateCol];
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
    const displayName = player.dropped
      ? `${player.name}${t.dropppedMark}`
      : (player.eliminated && !(isCompleted && isSingleElim))
        ? `${player.name}${t.eliminatedMark}`
        : player.name;
    const rank = index + 1;

    if (isSingleElimination) {
      const eliminatedRound = getEliminatedRound(player, group.matches);
      const eliminatedText = eliminatedRound !== null
        ? formatText(t.eliminatedRound, { round: eliminatedRound })
        : rank === 1 ? t.champion : '-';
      return [rank, displayName, getEliminationTitleI18n(rank, group.totalRounds, language), `${player.wins}-${player.losses}`, eliminatedText];
    } else {
      const row: (string | number)[] = [
        rank,
        displayName,
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

  const headers = [t.matchNoCol, t.player1Col, t.scoreCol, t.player2Col, t.resultCol];
  const rows: (string | number)[][] = roundMatches.map((match, index) => [
    index + 1,
    getPlayerName(group.players, match.player1Id, t),
    getMatchScore(match),
    match.isBye ? '-' : getPlayerName(group.players, match.player2Id, t),
    getMatchResultText(match, t),
  ]);

  return { headers, rows };
}

export async function exportRankingToExcel(
  players: Player[],
  competitionName: string,
  groupName: string,
  gameType: GameType,
  matches?: Match[],
  pairingType: PairingType = 'swiss',
  totalRounds?: number,
  language: AppLanguage = 'zh'
): Promise<void> {
  const group: TournamentGroup = {
    id: '', name: groupName, players, gameType, pairingType,
    totalRounds: totalRounds || 5, currentRound: 0, matches: matches || [],
    status: 'setup', createdAt: '',
  };
  const { headers, rows } = getRankingTableData(group, language);
  const t = translations[language];
  const data: (string | number)[][] = [headers, ...rows];
  await writeExcelWorkbook([{ name: t.ranking, rows: data }], `${competitionName}-${groupName}-${t.ranking}.xlsx`);
}

export async function exportMatchesToExcel(
  matches: Match[],
  players: Player[],
  competitionName: string,
  groupName: string,
  round: number,
  language: AppLanguage = 'zh'
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
    `${competitionName}-${groupName}-${formatText(t.roundN, { round })} ${t.matchTable}.xlsx`
  );
}

export async function exportAllRoundsToExcel(
  matches: Match[],
  players: Player[],
  competitionName: string,
  groupName: string,
  totalRounds: number,
  language: AppLanguage = 'zh'
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
  await writeExcelWorkbook(sheets, `${competitionName}-${groupName}-${t.matchTable}.xlsx`);
}

/** 导出单小组总表（排行榜+全部对阵） */
export async function exportGroupSummaryToExcel(
  group: TournamentGroup,
  competitionName: string,
  language: AppLanguage = 'zh'
): Promise<void> {
  const t = translations[language];
  const { headers, rows } = getRankingTableData(group, language);
  const rankData: (string | number)[][] = [headers, ...rows];
  const sheets: Array<{ name: string; rows: (string | number)[][] }> = [
    { name: t.ranking, rows: rankData },
  ];
  for (let round = 1; round <= group.totalRounds; round++) {
    const { headers: mHeaders, rows: mRows } = getMatchTableData(group, round, language);
    if (mRows.length === 0) continue;
    const mData: (string | number)[][] = [mHeaders, ...mRows];
    sheets.push({ name: formatText(t.roundN, { round }), rows: mData });
  }
  await writeExcelWorkbook(sheets, `${competitionName}-${group.name}-${t.summary}.xlsx`);
}

export async function exportAllGroupsToExcel(
  groups: TournamentGroup[],
  competitionName: string,
  language: AppLanguage = 'zh'
): Promise<void> {
  const t = translations[language];
  const sheets: Array<{ name: string; rows: (string | number)[][] }> = [];
  groups.forEach(group => {
    const { headers, rows } = getRankingTableData(group, language);
    const data: (string | number)[][] = [headers, ...rows];
    sheets.push({ name: `${group.name}-${t.ranking}`, rows: data });
    for (let round = 1; round <= group.totalRounds; round++) {
      const { headers: mHeaders, rows: mRows } = getMatchTableData(group, round, language);
      if (mRows.length === 0) continue;
      const mData: (string | number)[][] = [mHeaders, ...mRows];
      sheets.push({ name: `${group.name}-${formatText(t.roundN, { round })}`, rows: mData });
    }
  });
  await writeExcelWorkbook(sheets, `${competitionName}-${t.summary}.xlsx`);
}

export async function exportAllGroupsRankingToExcel(
  groups: TournamentGroup[],
  competitionName: string,
  language: AppLanguage = 'zh'
): Promise<void> {
  const t = translations[language];
  const sheets: Array<{ name: string; rows: (string | number)[][] }> = [];
  groups.forEach(group => {
    if (group.currentRound === 0) return;
    const { headers, rows } = getRankingTableData(group, language);
    const data: (string | number)[][] = [headers, ...rows];
    sheets.push({ name: `${group.name}-${t.ranking}`, rows: data });
  });
  await writeExcelWorkbook(sheets, `${competitionName}-${t.allGroups} ${t.ranking}.xlsx`);
}

/** 导出所有小组本轮对阵表 */
export async function exportAllGroupsCurrentRoundMatchesToExcel(
  groups: TournamentGroup[],
  competitionName: string,
  language: AppLanguage = 'zh'
): Promise<void> {
  const t = translations[language];
  const sheets: Array<{ name: string; rows: (string | number)[][] }> = [];
  groups.forEach(group => {
    if (group.currentRound === 0) return;
    const { headers, rows } = getMatchTableData(group, group.currentRound, language);
    if (rows.length === 0) return;
    const data: (string | number)[][] = [headers, ...rows];
    sheets.push({
      name: `${group.name}-${formatText(t.roundN, { round: group.currentRound })}`,
      rows: data,
    });
  });
  await writeExcelWorkbook(sheets, `${competitionName}-${t.allGroups} ${t.matchTable}.xlsx`);
}

export async function exportSingleSheetToExcel(
  sheetName: string,
  rows: (string | number)[][],
  fileName: string
): Promise<void> {
  await writeExcelWorkbook([{ name: sheetName, rows }], fileName);
}
