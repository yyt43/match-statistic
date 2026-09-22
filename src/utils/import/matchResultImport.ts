import type {
  Match,
  MatchResult,
  EvidenceVerificationStatus,
  Player,
  TournamentCompetition,
  TournamentGroup,
} from '../../types';
import { getRoundGameType } from '../swissPairing';
import { normalizeUid } from '../playerProfiles';
import { parseWorkbookFile, type ParsedWorkbookSheet } from './playerImport';

export type MatchImportPhase =
  | 'group'
  | 'r16'
  | 'quarterfinal'
  | 'semifinal'
  | 'final';

export interface MatchImportContext {
  phase: MatchImportPhase;
  groupIndex?: number;
  round?: number;
}

export interface MatchSubmissionRow {
  participantCode: string;
  uid: string;
  resultOption: string;
  evidenceRef: string;
  submitter?: string;
  submittedAt?: string;
  note?: string;
  rowNumber: number;
}

export type MatchImportIssueCode =
  | 'MISSING_REQUIRED'
  | 'UNKNOWN_PLAYER_CODE'
  | 'UID_MISSING'
  | 'UID_MISMATCH'
  | 'UID_CODE_MISMATCH'
  | 'NO_MATCH_IN_CONTEXT'
  | 'MULTIPLE_MATCHES'
  | 'UNKNOWN_MATCH'
  | 'INVALID_SCORE'
  | 'EVIDENCE_MISSING'
  | 'CONFLICT';

export interface MatchImportIssue {
  rowNumber: number;
  code: MatchImportIssueCode;
  message: string;
  messageEn?: string;
  matchId?: string;
}

export interface MatchImportCandidate {
  rowNumber: number;
  participantCode: string;
  submittedUid: string;
  profileUid: string;
  identityVerified: boolean;
  playerId: string;
  opponentId: string;
  groupIndex: number;
  matchId: string;
  round: number;
  canonicalScore: string;
  result: Exclude<MatchResult, 'pending'>;
  player1Games: number;
  player2Games: number;
  evidenceRef: string;
  evidenceHash?: string;
  evidenceVerificationStatus?: EvidenceVerificationStatus;
  sourceSubmissionId: string;
  sourceSubmittedAt?: string;
  submitter?: string;
  note?: string;
}

export interface MatchImportPreview {
  context: MatchImportContext;
  sourceFileName: string;
  rows: MatchSubmissionRow[];
  ready: MatchImportCandidate[];
  duplicates: MatchImportCandidate[];
  issues: MatchImportIssue[];
}

interface NormalizedSheetRow {
  rowNumber: number;
  values: Record<string, string>;
}

const COLUMN_ALIASES: Record<keyof Pick<MatchSubmissionRow,
  'participantCode' | 'uid' | 'resultOption' | 'evidenceRef' | 'submitter' | 'submittedAt' | 'note'
>, string[]> = {
  participantCode: ['我的选手编号', '选手编号', '参赛编号', '编号'],
  uid: ['我的原神UID', '你的原神UID', '游戏UID', '玩家UID', 'UID'],
  resultOption: ['比赛结果', '胜方比分', '获胜的比分', '比分是', '结果'],
  evidenceRef: ['结算截图', '截图编号或链接', '小王子对局截图', '上传截图', '截图', '证据引用'],
  submitter: ['提交者', '提交人'],
  submittedAt: ['提交时间', '时间'],
  note: ['备注', '说明'],
};

function normalizeHeader(value: string): string {
  return value.trim().replace(/[\s\u3000]+/g, '').toLowerCase();
}

function normalizeSheetRows(sheet: ParsedWorkbookSheet): NormalizedSheetRow[] {
  const rows = sheet.rows.filter(Array.isArray) as unknown[][];
  if (rows.length === 0) return [];
  const first = rows.find(row => row.some(value => String(value ?? '').trim()));
  if (!first) return [];
  const headerIndex = rows.indexOf(first);
  const headers = first.map(value => String(value ?? '').trim());
  const dataRows: NormalizedSheetRow[] = [];

  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index];
    const values: Record<string, string> = {};
    headers.forEach((header, columnIndex) => {
      if (header) values[header] = String(row[columnIndex] ?? '').trim();
    });
    if (Object.values(values).some(Boolean)) {
      dataRows.push({ rowNumber: index + 1, values });
    }
  }
  return dataRows;
}

function resolveColumn(
  headers: string[],
  aliases: string[]
): string | undefined {
  const normalizedAliases = aliases.map(normalizeHeader);
  return headers.find(header => normalizedAliases.includes(normalizeHeader(header)))
    ?? headers.find(header => {
      const normalizedHeader = normalizeHeader(header);
      return normalizedAliases.some(alias => normalizedHeader.includes(alias));
    });
}

export function normalizeSubmissionRows(sheet: ParsedWorkbookSheet): MatchSubmissionRow[] {
  const rows = sheet.rows.filter(Array.isArray) as unknown[][];
  const first = rows.find(row => row.some(value => String(value ?? '').trim()));
  if (!first) return [];
  const headers = first.map(value => String(value ?? '').trim()).filter(Boolean);
  const columns = Object.fromEntries(
    Object.entries(COLUMN_ALIASES).map(([key, aliases]) => [key, resolveColumn(headers, aliases)])
  ) as Record<keyof typeof COLUMN_ALIASES, string | undefined>;

  return normalizeSheetRows(sheet).map(row => ({
    rowNumber: row.rowNumber,
    participantCode: columns.participantCode ? row.values[columns.participantCode] ?? '' : '',
    uid: columns.uid ? normalizeUid(row.values[columns.uid] ?? '') : '',
    resultOption: columns.resultOption ? row.values[columns.resultOption] ?? '' : '',
    evidenceRef: columns.evidenceRef ? row.values[columns.evidenceRef] ?? '' : '',
    submitter: columns.submitter ? row.values[columns.submitter] ?? '' : undefined,
    submittedAt: columns.submittedAt ? row.values[columns.submittedAt] ?? '' : undefined,
    note: columns.note ? row.values[columns.note] ?? '' : undefined,
  }));
}

function countWinsNeeded(gameType: TournamentGroup['gameType']): number {
  if (gameType === 'bo3') return 2;
  if (gameType === 'bo5') return 3;
  if (gameType === 'bo7') return 4;
  return 1;
}

function parseResultOption(
  option: string,
  gameType: TournamentGroup['gameType']
): { winnerWins: number; loserWins: number } | null {
  const value = option.trim().replace(/^[A-D][.、]\s*/i, '');
  const direct = value.match(/^([0-9])\s*-\s*([0-9])$/);
  const chinese = value.match(/^我以\s*([0-9])\s*[-:：]\s*([0-9])\s*获胜$/);
  const matched = chinese ?? direct;
  if (!matched) return null;
  const winnerWins = Number(matched[1]);
  const loserWins = Number(matched[2]);
  const required = countWinsNeeded(gameType);
  if (winnerWins !== required || loserWins < 0 || loserWins >= required) return null;
  return { winnerWins, loserWins };
}

function isMatchInContext(
  match: Match,
  groupIndex: number,
  context: MatchImportContext
): boolean {
  if (context.phase === 'group') {
    if (context.groupIndex !== undefined && context.groupIndex !== groupIndex) return false;
    if (context.round !== undefined && match.round !== context.round) return false;
    return match.round > 0 && !match.isPlayoff;
  }
  const expectedRound: Record<Exclude<MatchImportPhase, 'group'>, number> = {
    r16: 1,
    quarterfinal: 2,
    semifinal: 3,
    final: 4,
  };
  void groupIndex;
  return match.round === expectedRound[context.phase] && !match.isPlayoff;
}

function findPlayer(
  competition: TournamentCompetition,
  participantCode: string,
  groupIndex?: number
): { player: Player; groupIndex: number } | null {
  const indices = groupIndex === undefined
    ? competition.groups.map((_, index) => index)
    : [groupIndex];
  for (const index of indices) {
    const player = competition.groups[index]?.players.find(
      candidate => candidate.participantCode?.trim().toUpperCase() === participantCode.trim().toUpperCase()
    );
    if (player) return { player, groupIndex: index };
  }
  return null;
}

function createCandidate(
  row: MatchSubmissionRow,
  context: MatchImportContext,
  player: Player,
  submittedUid: string,
  profileUid: string,
  groupIndex: number,
  match: Match,
  score: { winnerWins: number; loserWins: number },
  evidenceRef: string
): MatchImportCandidate {
  const isPlayer1 = match.player1Id === player.id;
  const player1Games = isPlayer1 ? score.winnerWins : score.loserWins;
  const player2Games = isPlayer1 ? score.loserWins : score.winnerWins;
  const result: Exclude<MatchResult, 'pending'> = isPlayer1 ? 'player1' : 'player2';
  const opponentId = isPlayer1 ? match.player2Id : match.player1Id;
  const sourceSubmissionId = [
    context.phase,
    context.groupIndex ?? 'all',
    context.round ?? match.round,
    row.participantCode,
    row.submittedAt ?? '',
    score.winnerWins,
    score.loserWins,
  ].join(':');

  return {
    rowNumber: row.rowNumber,
    participantCode: row.participantCode,
    submittedUid,
    profileUid,
    identityVerified: true,
    playerId: player.id,
    opponentId,
    groupIndex,
    matchId: match.id,
    round: match.round,
    canonicalScore: `${player1Games}-${player2Games}`,
    result,
    player1Games,
    player2Games,
    evidenceRef,
    evidenceHash: evidenceRef.match(/^[a-f0-9]{64}$/i)?.[0],
    evidenceVerificationStatus: 'not_required',
    sourceSubmissionId,
    sourceSubmittedAt: row.submittedAt,
    submitter: row.submitter,
    note: row.note,
  };
}

export function buildMatchImportPreview(
  competition: TournamentCompetition,
  context: MatchImportContext,
  rows: MatchSubmissionRow[],
  sourceFileName = 'results.xlsx'
): MatchImportPreview {
  const ready: MatchImportCandidate[] = [];
  const duplicates: MatchImportCandidate[] = [];
  const issues: MatchImportIssue[] = [];
  const byMatch = new Map<string, MatchImportCandidate>();

  for (const row of rows) {
    if (!row.participantCode || !row.resultOption) {
      issues.push({
        rowNumber: row.rowNumber,
        code: 'MISSING_REQUIRED',
        message: '选手编号或比赛结果为空',
        messageEn: 'Participant code or result is missing',
      });
      continue;
    }

    const found = findPlayer(competition, row.participantCode, context.groupIndex);
    if (!found) {
      issues.push({
        rowNumber: row.rowNumber,
        code: 'UNKNOWN_PLAYER_CODE',
        message: `找不到选手编号 ${row.participantCode}`,
        messageEn: `Player code ${row.participantCode} was not found`,
      });
      continue;
    }

    const requiresUidConfirmation = (competition.playerSchemaId ?? 'generic') === 'poetryCupS2'
      || competition.groups.some(group => group.players.some(player => !!player.profile?.uid));
    const submittedUid = normalizeUid(row.uid);
    const profileUid = normalizeUid(found.player.profile?.uid ?? '');
    if (requiresUidConfirmation) {
      if (!submittedUid) {
        issues.push({
          rowNumber: row.rowNumber,
          code: 'UID_MISSING',
          message: `${row.participantCode} 缺少提交 UID，无法完成双重确认`,
          messageEn: `${row.participantCode} is missing a submitted UID`,
        });
        continue;
      }
      if (!profileUid || submittedUid !== profileUid) {
        const uidOwner = competition.groups
          .flatMap(group => group.players)
          .find(player => normalizeUid(player.profile?.uid ?? '') === submittedUid);
        issues.push({
          rowNumber: row.rowNumber,
          code: uidOwner && uidOwner.id !== found.player.id ? 'UID_CODE_MISMATCH' : 'UID_MISMATCH',
          message: uidOwner && uidOwner.id !== found.player.id
            ? `选手编号指向 ${row.participantCode}，但 UID 属于 ${uidOwner.participantCode ?? uidOwner.name}`
            : `${row.participantCode} 的提交 UID ${submittedUid} 与选手档案不一致`,
          messageEn: uidOwner && uidOwner.id !== found.player.id
            ? `Code ${row.participantCode} and UID belong to ${uidOwner.participantCode ?? uidOwner.name}`
            : `Submitted UID ${submittedUid} does not match ${row.participantCode}`,
        });
        continue;
      }
    }

    const group = competition.groups[found.groupIndex];
    const matches = group.matches.filter(match =>
      (match.player1Id === found.player.id || match.player2Id === found.player.id)
      && isMatchInContext(match, found.groupIndex, context)
    );

    if (matches.length === 0) {
      issues.push({
        rowNumber: row.rowNumber,
        code: 'NO_MATCH_IN_CONTEXT',
        message: `${row.participantCode} 在当前轮次没有比赛`,
        messageEn: `${row.participantCode} has no match in the selected round`,
      });
      continue;
    }
    if (matches.length > 1) {
      issues.push({
        rowNumber: row.rowNumber,
        code: 'MULTIPLE_MATCHES',
        message: `${row.participantCode} 在当前轮次对应多场比赛`,
        messageEn: `${row.participantCode} matches multiple matches in the selected round`,
      });
      continue;
    }

    const match = matches[0];
    const gameType = getRoundGameType(group, match.round);
    const score = parseResultOption(row.resultOption, gameType);
    if (!score) {
      issues.push({
        rowNumber: row.rowNumber,
        code: 'INVALID_SCORE',
        message: `比赛结果 ${row.resultOption} 不符合 ${gameType.toUpperCase()} 规则`,
        messageEn: `Result ${row.resultOption} is invalid for ${gameType.toUpperCase()}`,
        matchId: match.id,
      });
      continue;
    }

    const candidate = createCandidate(
      row,
      context,
      found.player,
      submittedUid,
      profileUid,
      found.groupIndex,
      match,
      score,
      row.evidenceRef || `${sourceFileName}:row-${row.rowNumber}`
    );
    const existing = byMatch.get(match.id);
    if (!existing) {
      byMatch.set(match.id, candidate);
      ready.push(candidate);
      continue;
    }

    if (
      existing.canonicalScore === candidate.canonicalScore
      && existing.result === candidate.result
    ) {
      duplicates.push(candidate);
    } else {
      issues.push({
        rowNumber: row.rowNumber,
        code: 'CONFLICT',
        message: `同一场比赛存在冲突结果：${existing.canonicalScore} 与 ${candidate.canonicalScore}`,
        messageEn: `Conflicting results for one match: ${existing.canonicalScore} and ${candidate.canonicalScore}`,
        matchId: match.id,
      });
      byMatch.delete(match.id);
      const readyIndex = ready.findIndex(item => item.matchId === match.id);
      if (readyIndex >= 0) ready.splice(readyIndex, 1);
    }
  }

  return {
    context,
    sourceFileName,
    rows,
    ready,
    duplicates,
    issues,
  };
}

export async function parseMatchResultsWorkbook(
  file: File,
  competition: TournamentCompetition,
  context: MatchImportContext
): Promise<MatchImportPreview> {
  const sheets = await parseWorkbookFile(file);
  const rows = sheets.flatMap(normalizeSubmissionRows);
  return buildMatchImportPreview(competition, context, rows, file.name);
}

export function generateRoundAnnouncement(
  competition: TournamentCompetition,
  groupIndex: number,
  round: number
): string {
  const group = competition.groups[groupIndex];
  if (!group) return '';
  const players = new Map(group.players.map(player => [player.id, player]));
  const matches = group.matches
    .filter(match => match.round === round && match.result !== 'pending' && !match.isPlayoff)
    .sort((a, b) => a.id.localeCompare(b.id));
  const lines = matches.map(match => {
    const p1 = players.get(match.player1Id);
    const p2 = players.get(match.player2Id);
    const left = p1?.participantCode ?? p1?.name ?? match.player1Id;
    const right = p2?.participantCode ?? p2?.name ?? match.player2Id;
    return `${left} ${match.player1Games ?? 0}-${match.player2Games ?? 0} ${right}`;
  });
  return [
    `【诗意杯S2 ${group.name} 第${round}轮新增结果】`,
    '',
    ...lines,
    '',
    '以上结果已由裁判录入。',
    '如发现明显录入错误，请联系裁判，由裁判直接修正。',
  ].join('\n');
}
