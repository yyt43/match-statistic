import type { TournamentCompetition, TournamentGroup } from '../types';

export function hasUnresolvedRankingDisputesForGroup(
  group: TournamentGroup
): boolean {
  return group.matches.some(match =>
    match.result !== 'pending'
    && !match.isPlayoff
    && match.publicResultStatus === 'disputed'
  );
}

export function hasUnresolvedRankingDisputes(
  competition: TournamentCompetition
): boolean {
  return competition.groups.some(hasUnresolvedRankingDisputesForGroup);
}
