import type {
  EvidenceVerificationStatus,
  Match,
  MatchResult,
  MatchResultOverride,
  TournamentCompetition,
  TournamentGroup,
} from '../../types';
import type { CompetitionState } from '../useTournamentStore';
import type { StoreGet, StoreSet } from './actionTypes';
import { applyMatchResultFast, recalculateRanking } from '../gameFlow';
import { logAudit } from '../../utils/auditLog';
import {
  hasPlayedDownstreamBracketMatches,
  rebuildEliminationMatchesAfterResult,
} from '../../utils/elimination';

type ImportActionKey =
  | 'applyImportedMatchResults'
  | 'verifyMatchEvidence'
  | 'overrideMatchResult';

export interface ImportedMatchResultCandidate {
  matchId: string;
  groupIndex: number;
  result: Exclude<MatchResult, 'pending'>;
  identityVerified?: boolean;
  player1Games?: number;
  player2Games?: number;
  evidenceRefs?: string[];
  evidenceHash?: string;
  sourceSubmissionId?: string;
  sourceSubmittedAt?: string;
  evidenceVerificationStatus?: EvidenceVerificationStatus;
}

function cloneGroups(competition: TournamentCompetition): TournamentGroup[] {
  return competition.groups.map(group => ({
    ...group,
    players: group.players.map(player => ({
      ...player,
      profile: player.profile ? { ...player.profile } : undefined,
      playedAgainst: [...player.playedAgainst],
    })),
    matches: group.matches.map(match => ({
      ...match,
      evidenceRefs: match.evidenceRefs ? [...match.evidenceRefs] : undefined,
      resultOverrides: match.resultOverrides ? [...match.resultOverrides] : undefined,
    })),
    playoffBrackets: group.playoffBrackets?.map(bracket => ({
      ...bracket,
      playerIds: [...bracket.playerIds],
    })),
  }));
}

function hasPlayedMatchesAfter(group: TournamentGroup, round: number): boolean {
  return group.matches.some(match => match.round > round && match.result !== 'pending');
}

function clearUnplayedRoundsAfter(
  group: TournamentGroup,
  round: number
): TournamentGroup {
  return {
    ...group,
    currentRound: round,
    status: 'in_progress',
    matches: group.matches.filter(match => match.round <= round || match.result !== 'pending' || match.isPlayoff),
  };
}

export function createImportActions(
  set: StoreSet,
  get: StoreGet
): Pick<CompetitionState, ImportActionKey> {
  return {
    applyImportedMatchResults: (candidates, label = '导入比赛结果') => {
      if (candidates.length === 0) return;
      const { competition } = get();
      const groups = cloneGroups(competition);
      let changed = false;

      for (const candidate of candidates) {
        if (candidate.identityVerified === false) continue;
        if (candidate.evidenceVerificationStatus === 'mismatch'
          || candidate.evidenceVerificationStatus === 'unreadable') {
          continue;
        }
        const group = groups[candidate.groupIndex];
        if (!group) continue;
        const matchIndex = group.matches.findIndex(match => match.id === candidate.matchId);
        if (matchIndex < 0) continue;
        const match = group.matches[matchIndex];
        if (match.isBye) continue;
        if (group.eliminationBracket && match.bracketNodeId && candidate.result === 'draw') {
          continue;
        }
        const sameResult = match.result === candidate.result
          && match.player1Games === candidate.player1Games
          && match.player2Games === candidate.player2Games;
        if (
          group.eliminationBracket
          && match.bracketNodeId
          && !sameResult
          && hasPlayedDownstreamBracketMatches(group, match.round)
        ) {
          continue;
        }
        if (
          group.eliminationBracket
          && match.bracketNodeId
          && match.result !== 'pending'
          && !hasPlayedDownstreamBracketMatches(group, match.round)
        ) {
          const applied = applyMatchResultFast(
            group,
            candidate.matchId,
            candidate.result,
            candidate.player1Games,
            candidate.player2Games
          );
          if (sameResult) {
            const nextMatch = applied.matches.find(matchItem => matchItem.id === candidate.matchId);
            if (nextMatch) {
              group.matches[matchIndex] = {
                ...nextMatch,
                sourceSubmissionId: match.sourceSubmissionId ?? candidate.sourceSubmissionId,
                sourceSubmittedAt: match.sourceSubmittedAt ?? candidate.sourceSubmittedAt,
                evidenceRefs: match.evidenceRefs?.length
                  ? match.evidenceRefs
                  : candidate.evidenceRefs,
                evidenceHash: match.evidenceHash ?? candidate.evidenceHash,
                evidenceVerificationStatus: candidate.evidenceVerificationStatus
                  ?? match.evidenceVerificationStatus
                  ?? 'not_required',
              };
            }
            changed = changed || JSON.stringify(group.matches[matchIndex]) !== JSON.stringify(match);
            continue;
          }
          let updatedMatches = [...applied.matches];
          updatedMatches = rebuildEliminationMatchesAfterResult(
            { ...applied, matches: updatedMatches },
            match.round
          );
          groups[candidate.groupIndex] = recalculateRanking({
            ...applied,
            matches: updatedMatches,
          });
          changed = true;
          continue;
        }
        if (sameResult) {
          const nextMatch: Match = {
            ...match,
            sourceSubmissionId: match.sourceSubmissionId ?? candidate.sourceSubmissionId,
            sourceSubmittedAt: match.sourceSubmittedAt ?? candidate.sourceSubmittedAt,
            evidenceRefs: match.evidenceRefs?.length
              ? match.evidenceRefs
              : candidate.evidenceRefs,
            evidenceHash: match.evidenceHash ?? candidate.evidenceHash,
            evidenceVerificationStatus: candidate.evidenceVerificationStatus
              ?? match.evidenceVerificationStatus
              ?? 'not_required',
          };
          if (JSON.stringify(nextMatch) !== JSON.stringify(match)) {
            group.matches[matchIndex] = nextMatch;
            changed = true;
          }
          continue;
        }

        const updatedGroup = applyMatchResultFast(
          group,
          candidate.matchId,
          candidate.result,
          candidate.player1Games,
          candidate.player2Games
        );
        const updatedMatch = updatedGroup.matches.find(matchItem => matchItem.id === candidate.matchId);
        if (!updatedMatch) continue;
        let updatedMatches: Match[] = updatedGroup.matches.map(matchItem => matchItem.id === candidate.matchId
          ? {
              ...updatedMatch,
              resultSource: 'import' as const,
              sourceSubmissionId: candidate.sourceSubmissionId,
              sourceSubmittedAt: candidate.sourceSubmittedAt,
              evidenceRefs: candidate.evidenceRefs,
              evidenceHash: candidate.evidenceHash,
              evidenceVerificationStatus: candidate.evidenceVerificationStatus ?? 'not_required',
            }
          : matchItem);
        if (updatedGroup.eliminationBracket && updatedMatch.bracketNodeId && match.result !== candidate.result) {
          updatedMatches = rebuildEliminationMatchesAfterResult(
            { ...updatedGroup, matches: updatedMatches },
            updatedMatch.round
          );
        }
        groups[candidate.groupIndex] = recalculateRanking({
          ...updatedGroup,
          matches: updatedMatches,
        });
        changed = true;
      }

      if (!changed) return;
      set({ competition: { ...competition, groups } }, { label });
      void logAudit('match-result-import', `Imported ${candidates.length} result(s)`, {
        count: candidates.length,
      });
    },

    verifyMatchEvidence: (matchId, status, note) => {
      const { competition } = get();
      const groups = cloneGroups(competition);
      let changed = false;
      const verifiedAt = new Date().toISOString();
      for (const group of groups) {
        const matchIndex = group.matches.findIndex(match => match.id === matchId);
        if (matchIndex < 0) continue;
        const match = group.matches[matchIndex];
        group.matches[matchIndex] = {
          ...match,
          evidenceVerificationStatus: status,
          evidenceVerifiedAt: verifiedAt,
          evidenceVerifiedBy: 'referee',
          resultOverrides: note
            ? [
                ...(match.resultOverrides ?? []),
                {
                  previousResult: match.result,
                  previousPlayer1Games: match.player1Games,
                  previousPlayer2Games: match.player2Games,
                  newResult: match.result,
                  newPlayer1Games: match.player1Games,
                  newPlayer2Games: match.player2Games,
                  reason: `证据核验：${note}`,
                  evidenceRefs: match.evidenceRefs ?? [],
                  changedAt: verifiedAt,
                },
              ]
            : match.resultOverrides,
        };
        changed = true;
        break;
      }
      if (!changed) return false;
      set({ competition: { ...competition, groups } }, { label: '核验比赛证据' });
      void logAudit('evidence-verification', `${matchId} -> ${status}`, { matchId, status, note });
      return true;
    },

    overrideMatchResult: (matchId, result, player1Games, player2Games, reason, evidenceRefs) => {
      const trimmedReason = reason.trim();
      if (!trimmedReason) return false;
      const { competition } = get();
      const groups = cloneGroups(competition);
      let targetGroupIndex = -1;
      let targetRound = -1;
      let previous: Match | null = null;

      for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
        const group = groups[groupIndex];
        const index = group.matches.findIndex(match => match.id === matchId);
        if (index >= 0) {
          targetGroupIndex = groupIndex;
          targetRound = group.matches[index].round;
          previous = group.matches[index];
          break;
        }
      }

      if (!previous || targetGroupIndex < 0) return false;
      const targetGroup = groups[targetGroupIndex];
      if (targetGroup.eliminationBracket && previous.bracketNodeId && result === 'draw') {
        return false;
      }
      if (hasPlayedMatchesAfter(targetGroup, targetRound)) {
        return false;
      }

      const clearedGroup = clearUnplayedRoundsAfter(targetGroup, targetRound);
      const applied = applyMatchResultFast(
        clearedGroup,
        matchId,
        result,
        player1Games,
        player2Games
      );
      let appliedMatches = applied.matches;
      if (applied.eliminationBracket && previous.bracketNodeId) {
        appliedMatches = rebuildEliminationMatchesAfterResult(
          { ...applied, matches: appliedMatches },
          targetRound
        );
      }
      const changedAt = new Date().toISOString();
      const override: MatchResultOverride = {
        previousResult: previous.result,
        previousPlayer1Games: previous.player1Games,
        previousPlayer2Games: previous.player2Games,
        newResult: result,
        newPlayer1Games: player1Games,
        newPlayer2Games: player2Games,
        reason: trimmedReason,
        evidenceRefs: evidenceRefs ?? previous.evidenceRefs ?? [],
        changedBy: 'referee',
        changedAt,
      };
      appliedMatches = appliedMatches.map(match => match.id === matchId
        ? {
            ...match,
            resultSource: 'referee_override',
            resultOverrides: [...(match.resultOverrides ?? []), override],
            evidenceVerificationStatus: 'not_required',
          }
        : match);
      groups[targetGroupIndex] = recalculateRanking({
        ...applied,
        matches: appliedMatches,
      });
      set({ competition: { ...competition, groups } }, { label: '裁判改判' });
      void logAudit('match-result-override', matchId, {
        matchId,
        result,
        player1Games,
        player2Games,
        reason: trimmedReason,
      });
      return true;
    },
  };
}
