import type { TournamentCompetition, TournamentGroup } from '../types';

export function updateCompetitionGroup(
  competition: TournamentCompetition,
  groupIndex: number,
  updater: (group: TournamentGroup) => TournamentGroup
): TournamentCompetition {
  const targetIndex = Math.max(0, Math.min(groupIndex, competition.groups.length - 1));
  const groups = [...competition.groups];
  groups[targetIndex] = updater(groups[targetIndex]);
  return { ...competition, groups };
}

export function updateCurrentGroup(
  competition: TournamentCompetition,
  updater: (group: TournamentGroup) => TournamentGroup
): TournamentCompetition {
  return updateCompetitionGroup(competition, competition.currentGroupIndex, updater);
}
