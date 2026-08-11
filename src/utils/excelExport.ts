import type { Player, Match, GameType, PairingType, TournamentGroup } from '../types';
import { getEliminationTitle, getEliminatedRound, formatPlayerMatchHistoryText } from './ranking';
import { sortPlayers } from './swissPairing';

/** 动态加载 xlsx 库（仅在导出文件时按需加载，减小初始 bundle 体积） */
async function loadXLSX(): Promise<typeof import('xlsx')> {
  return await import('xlsx');
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function getPlayerName(players: Player[], playerId: string): string {
  if (playerId === 'bye') return '-';
  const player = players.find(p => p.id === playerId);
  return player ? player.name : '未知选手';
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

function getMatchResultText(match: Match): string {
  if (match.isBye) return '轮空';
  if (match.result === 'pending') return '待定';
  if (match.result === 'draw') return '双负';
  if (match.result === 'player1') return '选手1胜';
  if (match.result === 'player2') return '选手2胜';
  return '';
}

/** 生成排行榜表格数据（表头+行），供预览和导出共用 */
export function getRankingTableData(group: TournamentGroup): { headers: string[]; rows: (string | number)[][] } {
  const sortedPlayers = sortPlayers(group.players, group.gameType, group.pairingType);
  const isMultiGame = group.gameType !== 'bo1';
  const isSingleElimination = group.pairingType === 'single_elimination';

  let headers: string[];
  if (isSingleElimination) {
    headers = ['排名', '选手名称', '头衔', '战绩(W-L)', '淘汰轮次'];
  } else {
    headers = ['排名', '选手名称', '战绩(W-L)', '胜率', '对手胜率'];
    if (isMultiGame) {
      headers.push('局胜率', '对手局胜率');
    } else {
      headers.push('对手对手胜率');
    }
    headers.push('比赛历史');
  }

  const rows: (string | number)[][] = sortedPlayers.map((player, index) => {
    const isCompleted = group.status === 'completed';
    const isSingleElim = group.pairingType === 'single_elimination';
    const displayName = player.dropped
      ? `${player.name}（弃赛）`
      : (player.eliminated && !(isCompleted && isSingleElim))
        ? `${player.name}（淘汰）`
        : player.name;
    const rank = index + 1;

    if (isSingleElimination) {
      const eliminatedRound = getEliminatedRound(player, group.matches);
      const eliminatedText = eliminatedRound !== null ? `第${eliminatedRound}轮` : rank === 1 ? '冠军' : '-';
      return [rank, displayName, getEliminationTitle(rank, group.totalRounds), `${player.wins}-${player.losses}`, eliminatedText];
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
      row.push(formatPlayerMatchHistoryText(player, group.matches));
      return row;
    }
  });

  return { headers, rows };
}

/** 生成某轮对阵表数据，供预览和导出共用 */
export function getMatchTableData(group: TournamentGroup, round: number): { headers: string[]; rows: (string | number)[][] } {
  const roundMatches = group.matches
    .filter(m => m.round === round)
    .sort((a, b) => {
      if (a.isBye && !b.isBye) return 1;
      if (!a.isBye && b.isBye) return -1;
      return 0;
    });

  const headers = ['场次', '选手1', '比分', '选手2', '结果'];
  const rows: (string | number)[][] = roundMatches.map((match, index) => [
    index + 1,
    getPlayerName(group.players, match.player1Id),
    getMatchScore(match),
    match.isBye ? '-' : getPlayerName(group.players, match.player2Id),
    getMatchResultText(match),
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
  totalRounds?: number
): Promise<void> {
  const XLSX = await loadXLSX();
  // 复用 getRankingTableData，通过构建一个临时 group
  const group: TournamentGroup = {
    id: '', name: groupName, players, gameType, pairingType,
    totalRounds: totalRounds || 5, currentRound: 0, matches: matches || [],
    status: 'setup', createdAt: '',
  };
  const { headers, rows } = getRankingTableData(group);
  const data: (string | number)[][] = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '排行榜');
  XLSX.writeFile(wb, `${competitionName}-${groupName}-排行榜.xlsx`);
}

export async function exportMatchesToExcel(
  matches: Match[],
  players: Player[],
  competitionName: string,
  groupName: string,
  round: number
): Promise<void> {
  const XLSX = await loadXLSX();
  const group: TournamentGroup = {
    id: '', name: groupName, players, gameType: 'bo1', pairingType: 'swiss',
    totalRounds: round, currentRound: round, matches, status: 'in_progress', createdAt: '',
  };
  const { headers, rows } = getMatchTableData(group, round);
  const data: (string | number)[][] = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `第${round}轮`);
  XLSX.writeFile(wb, `${competitionName}-${groupName}-第${round}轮对阵表.xlsx`);
}

export async function exportAllRoundsToExcel(
  matches: Match[],
  players: Player[],
  competitionName: string,
  groupName: string,
  totalRounds: number
): Promise<void> {
  const XLSX = await loadXLSX();
  const group: TournamentGroup = {
    id: '', name: groupName, players, gameType: 'bo1', pairingType: 'swiss',
    totalRounds, currentRound: totalRounds, matches, status: 'in_progress', createdAt: '',
  };
  const wb = XLSX.utils.book_new();
  for (let round = 1; round <= totalRounds; round++) {
    const { headers, rows } = getMatchTableData(group, round);
    if (rows.length === 0) continue;
    const data: (string | number)[][] = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, `第${round}轮`);
  }
  XLSX.writeFile(wb, `${competitionName}-${groupName}-全部对阵表.xlsx`);
}

/** 导出单小组总表（排行榜+全部对阵） */
export async function exportGroupSummaryToExcel(
  group: TournamentGroup,
  competitionName: string
): Promise<void> {
  const XLSX = await loadXLSX();
  const wb = XLSX.utils.book_new();

  // 排行榜
  const { headers, rows } = getRankingTableData(group);
  const rankData: (string | number)[][] = [headers, ...rows];
  const rankWs = XLSX.utils.aoa_to_sheet(rankData);
  XLSX.utils.book_append_sheet(wb, rankWs, '排行榜');

  // 各轮对阵
  for (let round = 1; round <= group.totalRounds; round++) {
    const { headers: mHeaders, rows: mRows } = getMatchTableData(group, round);
    if (mRows.length === 0) continue;
    const mData: (string | number)[][] = [mHeaders, ...mRows];
    const matchWs = XLSX.utils.aoa_to_sheet(mData);
    XLSX.utils.book_append_sheet(wb, matchWs, `第${round}轮`);
  }

  XLSX.writeFile(wb, `${competitionName}-${group.name}-总表.xlsx`);
}

export async function exportAllGroupsToExcel(
  groups: TournamentGroup[],
  competitionName: string
): Promise<void> {
  const XLSX = await loadXLSX();
  const wb = XLSX.utils.book_new();

  groups.forEach(group => {
    const { headers, rows } = getRankingTableData(group);
    const data: (string | number)[][] = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, `${group.name}-排行榜`);

    for (let round = 1; round <= group.totalRounds; round++) {
      const { headers: mHeaders, rows: mRows } = getMatchTableData(group, round);
      if (mRows.length === 0) continue;
      const mData: (string | number)[][] = [mHeaders, ...mRows];
      const matchWs = XLSX.utils.aoa_to_sheet(mData);
      XLSX.utils.book_append_sheet(wb, matchWs, `${group.name}-第${round}轮`);
    }
  });

  XLSX.writeFile(wb, `${competitionName}-全部小组比赛结果.xlsx`);
}

export async function exportAllGroupsRankingToExcel(
  groups: TournamentGroup[],
  competitionName: string
): Promise<void> {
  const XLSX = await loadXLSX();
  const wb = XLSX.utils.book_new();

  groups.forEach(group => {
    if (group.currentRound === 0) return;
    const { headers, rows } = getRankingTableData(group);
    const data: (string | number)[][] = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, `${group.name}-排行榜`);
  });

  XLSX.writeFile(wb, `${competitionName}-所有小组排行榜.xlsx`);
}

/** 导出所有小组本轮对阵表 */
export async function exportAllGroupsCurrentRoundMatchesToExcel(
  groups: TournamentGroup[],
  competitionName: string
): Promise<void> {
  const XLSX = await loadXLSX();
  const wb = XLSX.utils.book_new();

  groups.forEach(group => {
    if (group.currentRound === 0) return;
    const { headers, rows } = getMatchTableData(group, group.currentRound);
    if (rows.length === 0) return;
    const data: (string | number)[][] = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, `${group.name}-第${group.currentRound}轮`);
  });

  XLSX.writeFile(wb, `${competitionName}-所有小组本轮对阵表.xlsx`);
}
