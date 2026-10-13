import { describe, expect, it } from 'vitest';
import type { TournamentCompetition, TournamentGroup } from '../types';
import { createMultiStageCompetition } from '../store/multiStageFactory';
import type { MultiStageDraftStage } from './multiStage';
import { S3_SEED_RULES, getOrderedStages, getStageGroups } from './multiStage';
import {
  buildFinalStandings,
  computeStageAdvancement,
  confirmStageAdvancement,
  hasDownstreamResults,
  isStageResultLocked,
  revertStageAdvancement,
} from './advancement';
import { buildRankedGroup } from '../store/competitionState';
import { validateRoster } from './playerProfiles';
import { validateCompetitionData } from './schema';

function groupStageDraft(rules: MultiStageDraftStage['advancementRules']): MultiStageDraftStage {
  return {
    id: 'stage-group',
    name: '小组赛',
    kind: 'swiss',
    groupCount: 4,
    groupNames: ['A组', 'B组', 'C组', 'D组'],
    playerCountPerGroup: 8,
    rounds: 5,
    gameType: 'bo3',
    roundGameTypes: ['bo3', 'bo3', 'bo3', 'bo3', 'bo3'],
    advancementRules: rules,
  };
}

function buildCompetition(rules: MultiStageDraftStage['advancementRules']): TournamentCompetition {
  const breakout: MultiStageDraftStage = {
    id: 'stage-breakout',
    name: '突围赛',
    kind: 'single_elimination',
    groupCount: 1,
    playerCountPerGroup: 16,
    rounds: 1,
    fixedRounds: 1,
    gameType: 'bo3',
    roundGameTypes: ['bo3'],
    sourceStageIds: ['stage-group'],
    breakout: { pairings: [[3, 6], [4, 5]] },
  };
  const playoff: MultiStageDraftStage = {
    id: 'stage-playoff',
    name: '淘汰赛',
    kind: 'single_elimination',
    groupCount: 1,
    playerCountPerGroup: 16,
    rounds: 4,
    gameType: 'bo5',
    roundGameTypes: ['bo3', 'bo5', 'bo5', 'bo7'],
    sourceStageIds: ['stage-group', 'stage-breakout'],
    seedRules: S3_SEED_RULES,
  };
  return createMultiStageCompetition('晋级测试', [groupStageDraft(rules), breakout, playoff]);
}

/** 直接写入每名选手的最终战绩，模拟小组赛打完后的排名。 */
function seedGroupResults(group: TournamentGroup, targetWins: number[]): TournamentGroup {
  const players = group.players.map((player, index) => {
    const wins = targetWins[index] ?? 0;
    return {
      ...player,
      wins,
      losses: Math.max(0, group.totalRounds - wins),
      points: wins,
      winRate: 0,
    };
  });
  return { ...group, players, status: 'completed', currentRound: group.totalRounds };
}

function finishGroupStage(competition: TournamentCompetition): TournamentCompetition {
  return {
    ...competition,
    groups: competition.groups.map(group =>
      group.stageId === 'stage-group'
        ? seedGroupResults(group, [5, 4, 4, 4, 4, 3, 2, 1])
        : group
    ),
  };
}

function rankingNames(group: TournamentGroup): string[] {
  return buildRankedGroup(group).players.map(player => player.participantCode ?? player.name);
}

describe('stage advancement', () => {
  it('pairs ranks 3-6 as 3v6 and 4v5 for every source group', () => {
    const competition = finishGroupStage(buildCompetition([
      { id: 'top-two', fromRank: 1, toRank: 2, destination: 'main' },
      { id: 'breakout', fromRank: 3, toRank: 6, destination: 'breakout' },
    ]));

    const preview = computeStageAdvancement(competition, 'stage-group');
    const groupA = competition.groups.find(group => group.name === 'A组')!;
    const codes = rankingNames(groupA);

    const pairing = preview.breakoutPairings.find(item => item.sourceGroupId === groupA.id);
    expect(pairing).toBeDefined();
    const pairCodes = preview.breakoutPairings
      .filter(item => item.sourceGroupId === groupA.id)
      .map(item => [
        groupA.players.find(player => player.id === item.player1Id)?.participantCode,
        groupA.players.find(player => player.id === item.player2Id)?.participantCode,
      ]);

    expect(pairCodes).toEqual([
      [codes[2], codes[5]],
      [codes[3], codes[4]],
    ]);
    expect(preview.seats.filter(seat => seat.route === 'direct')).toHaveLength(8);
    expect(preview.seats.filter(seat => seat.route === 'breakout')).toHaveLength(16);
  });

  it('keeps only the 4-1 players of ranks 3-6 for the breakout stage', () => {
    const competition = finishGroupStage(buildCompetition([
      { id: 'top-two', fromRank: 1, toRank: 2, destination: 'main' },
      {
        id: 'breakout-4-1',
        fromRank: 3,
        toRank: 6,
        minWins: 4,
        maxWins: 4,
        destination: 'breakout',
      },
    ]));

    const preview = computeStageAdvancement(competition, 'stage-group');

    const breakoutSeats = preview.seats.filter(seat => seat.route !== 'direct');
    expect(breakoutSeats.length).toBeGreaterThan(0);
    for (const seat of breakoutSeats) {
      const group = competition.groups.find(item => item.id === seat.sourceGroupId)!;
      const ranked = buildRankedGroup(group).players;
      const index = ranked.findIndex(item => item.participantCode === seat.participantCode);
      expect(ranked[index].wins).toBe(4);
      expect(index + 1).toBeGreaterThanOrEqual(3);
      expect(index + 1).toBeLessThanOrEqual(6);
    }
    const expectedPairings = competition.groups
      .filter(group => group.stageId === 'stage-group')
      .reduce((sum, group) => {
        const eligible = buildRankedGroup(group).players
          .slice(2, 6)
          .filter(player => player.wins === 4).length;
        return sum + (eligible >= 4 ? 2 : eligible === 3 ? 1 : 0);
      }, 0);
    expect(preview.breakoutPairings).toHaveLength(expectedPairings);
    expect(expectedPairings).toBeGreaterThan(0);
  });

  it('sends everyone through when fewer than four players qualify in a group', () => {
    const competition = finishGroupStage(buildCompetition([
      { id: 'top-two', fromRank: 1, toRank: 2, destination: 'main' },
      { id: 'breakout', fromRank: 3, toRank: 4, destination: 'breakout' },
    ]));

    const preview = computeStageAdvancement(competition, 'stage-group');

    expect(preview.breakoutPairings).toHaveLength(0);
    expect(preview.seats.filter(seat => seat.route === 'breakout_direct')).toHaveLength(8);
  });

  it('writes the breakout roster and playoff seeding when confirmed', () => {
    const competition = finishGroupStage(buildCompetition([
      { id: 'top-two', fromRank: 1, toRank: 2, destination: 'main' },
      { id: 'breakout', fromRank: 3, toRank: 6, destination: 'breakout' },
    ]));
    const preview = computeStageAdvancement(competition, 'stage-group');
    const updated = confirmStageAdvancement(competition, preview);

    const stages = getOrderedStages(updated);
    const breakoutGroup = getStageGroups(updated, stages[1])[0];
    const playoffGroup = getStageGroups(updated, stages[2])[0];

    expect(breakoutGroup.players).toHaveLength(16);
    expect(breakoutGroup.eliminationBracket?.slots).toHaveLength(16);
    expect(breakoutGroup.eliminationBracket?.lockedAt).toBeTruthy();
    expect(playoffGroup.players).toHaveLength(8);
    expect(playoffGroup.eliminationBracket?.size).toBe(16);

    const stageGroupCodes = new Map(
      competition.groups
        .filter(group => group.stageId === 'stage-group')
        .flatMap(group => group.players.map(player => [player.participantCode ?? '', group.name]))
    );
    for (const seat of updated.stageAdvancements?.[0].seats ?? []) {
      expect(stageGroupCodes.get(seat.participantCode ?? '')).toBe(seat.originGroupName);
    }
  });

  it('adds the breakout winners to the playoff with the fixed seed order', () => {
    const competition = finishGroupStage(buildCompetition([
      { id: 'top-two', fromRank: 1, toRank: 2, destination: 'main' },
      { id: 'breakout', fromRank: 3, toRank: 6, destination: 'breakout' },
    ]));
    const withGroupStage = confirmStageAdvancement(
      competition,
      computeStageAdvancement(competition, 'stage-group')
    );
    const stages = getOrderedStages(withGroupStage);
    const breakoutGroup = getStageGroups(withGroupStage, stages[1])[0];
    const decided = {
      ...withGroupStage,
      groups: withGroupStage.groups.map(group =>
        group.id === breakoutGroup.id
          ? {
              ...group,
              status: 'completed' as const,
              currentRound: 1,
              matches: group.matches.map(match => ({
                ...match,
                result: 'player1' as const,
                player1Games: 2,
                player2Games: 0,
              })),
            }
          : group
      ),
    };

    const preview = computeStageAdvancement(decided, stages[1].id);
    expect(preview.seats).toHaveLength(8);
    expect(preview.seats.map(seat => seat.targetSlot)).toEqual([1, 3, 5, 7, 9, 11, 13, 15]);

    const updated = confirmStageAdvancement(decided, preview);
    const playoffGroup = getStageGroups(updated, stages[2])[0];
    expect(playoffGroup.players).toHaveLength(16);
    expect(playoffGroup.eliminationBracket?.slots.filter(Boolean)).toHaveLength(16);
    expect(playoffGroup.eliminationBracket?.source).toBe('custom');
  });

  it('keeps every breakout winner even when a lower seed wins', () => {
    const competition = finishGroupStage(buildCompetition([
      { id: 'top-two', fromRank: 1, toRank: 2, destination: 'main' },
      { id: 'breakout', fromRank: 3, toRank: 6, destination: 'breakout' },
    ]));
    const withGroupStage = confirmStageAdvancement(
      competition,
      computeStageAdvancement(competition, 'stage-group')
    );
    const stages = getOrderedStages(withGroupStage);
    const breakoutGroup = getStageGroups(withGroupStage, stages[1])[0];
    const decided = {
      ...withGroupStage,
      groups: withGroupStage.groups.map(group =>
        group.id === breakoutGroup.id
          ? {
              ...group,
              status: 'completed' as const,
              currentRound: 1,
              // 让每个对阵里的“低名次”一方获胜（player2 胜）。
              matches: group.matches.map(match => ({
                ...match,
                result: 'player2' as const,
                player1Games: 0,
                player2Games: 2,
              })),
            }
          : group
      ),
    };

    const preview = computeStageAdvancement(decided, stages[1].id);

    expect(preview.seats).toHaveLength(8);
    expect(preview.seats.map(seat => seat.targetSlot).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([
      1, 3, 5, 7, 9, 11, 13, 15,
    ]);
  });

  it('clears downstream stages when the advancement is reverted', () => {
    const competition = finishGroupStage(buildCompetition([
      { id: 'top-two', fromRank: 1, toRank: 2, destination: 'main' },
      { id: 'breakout', fromRank: 3, toRank: 6, destination: 'breakout' },
    ]));
    const confirmed = confirmStageAdvancement(
      competition,
      computeStageAdvancement(competition, 'stage-group')
    );

    const reverted = revertStageAdvancement(confirmed, 'stage-group');
    const stages = getOrderedStages(reverted);

    expect(reverted.stageAdvancements ?? []).toHaveLength(0);
    expect(getStageGroups(reverted, stages[1])[0].players).toHaveLength(0);
    expect(getStageGroups(reverted, stages[1])[0].eliminationBracket).toBeUndefined();
    expect(getStageGroups(reverted, stages[2])[0].players).toHaveLength(0);
  });

  it('only locks upstream results once the downstream stage has results', () => {
    const competition = finishGroupStage(buildCompetition([
      { id: 'top-two', fromRank: 1, toRank: 2, destination: 'main' },
      { id: 'breakout', fromRank: 3, toRank: 6, destination: 'breakout' },
    ]));
    const confirmed = confirmStageAdvancement(
      competition,
      computeStageAdvancement(competition, 'stage-group')
    );
    const stages = getOrderedStages(confirmed);

    // 刚确认时下游只有名单，不算"已开赛"，仍可回退。
    expect(hasDownstreamResults(confirmed, stages[0])).toBe(false);
    expect(isStageResultLocked(confirmed, stages[0].id)).toBe(false);
    expect(revertStageAdvancement(confirmed, 'stage-group').stageAdvancements ?? []).toHaveLength(0);

    const breakoutIndex = confirmed.groups.findIndex(
      group => group.stageId === 'stage-breakout'
    );
    const started = {
      ...confirmed,
      groups: confirmed.groups.map((group, index) =>
        index === breakoutIndex
          ? {
              ...group,
              status: 'in_progress' as const,
              currentRound: 1,
              matches: [
                {
                  id: 'breakout-1',
                  round: 1,
                  player1Id: group.players[0].id,
                  player2Id: group.players[1].id,
                  result: 'player1' as const,
                },
              ],
            }
          : group
      ),
    };

    expect(hasDownstreamResults(started, stages[0])).toBe(true);
    expect(isStageResultLocked(started, stages[0].id)).toBe(true);
  });

  it('keeps the roster valid when the same participant appears in several stages', () => {
    const competition = finishGroupStage(buildCompetition([
      { id: 'top-two', fromRank: 1, toRank: 2, destination: 'main' },
      { id: 'breakout', fromRank: 3, toRank: 6, destination: 'breakout' },
    ]));
    const updated = confirmStageAdvancement(
      competition,
      computeStageAdvancement(competition, 'stage-group')
    );
    const breakoutGroup = updated.groups.find(group => group.stageId === 'stage-breakout')!;
    const groupStageCodes = new Set(
      competition.groups
        .filter(group => group.stageId === 'stage-group')
        .flatMap(group => group.players.map(player => player.participantCode))
    );
    expect(breakoutGroup.players.some(player => groupStageCodes.has(player.participantCode))).toBe(true);

    const summary = validateRoster(updated);
    expect(summary.issues.filter(issue =>
      issue.code === 'DUPLICATE_PARTICIPANT_CODE' || issue.code === 'DUPLICATE_UID'
    )).toEqual([]);

    const roundTrip = validateCompetitionData(JSON.parse(JSON.stringify(updated)));
    expect(roundTrip.success).toBe(true);
  });

  it('derives the final standings from the playoff results', () => {
    const competition = finishGroupStage(buildCompetition([
      { id: 'top-two', fromRank: 1, toRank: 2, destination: 'main' },
      { id: 'breakout', fromRank: 3, toRank: 6, destination: 'breakout' },
    ]));
    const playoffIndex = competition.groups.findIndex(group => group.stageId === 'stage-playoff');
    const withResults = {
      ...competition,
      groups: competition.groups.map((group, index) =>
        index === playoffIndex
          ? {
              ...group,
              status: 'completed' as const,
              currentRound: 3,
              eliminationBracket: {
                id: 'bracket',
                size: 8,
                slots: [],
                source: 'roster_order' as const,
              },
              matches: [1, 2, 3].map(round => ({
                id: `playoff-r${round}`,
                round,
                player1Id: `r${round}-p1`,
                player2Id: `r${round}-p2`,
                result: 'player1' as const,
              })),
              players: [
                ...[1, 2, 3].flatMap(round => [
                  { id: `r${round}-p1`, name: `先手${round}`, participantCode: `P${round}1`, profile: {} },
                  { id: `r${round}-p2`, name: `后手${round}`, participantCode: `P${round}2`, profile: {} },
                ]),
              ],
            }
          : group
      ),
    };

    const standings = buildFinalStandings(withResults as typeof competition);

    expect(standings[0].place).toBe('1');
    expect(standings[0].players[0].name).toBe('先手3');
    expect(standings.map(item => item.place)).toEqual(['1', '2', '3-4', '5-8']);
    expect(standings[3].players).toHaveLength(1);
  });

  it('keeps the final standings empty until the playoff bracket is decided', () => {
    const competition = finishGroupStage(buildCompetition([
      { id: 'top-two', fromRank: 1, toRank: 2, destination: 'main' },
      { id: 'breakout', fromRank: 3, toRank: 6, destination: 'breakout' },
    ]));

    // 只有小组赛有比赛记录时不应产生名次
    expect(buildFinalStandings(competition)).toEqual([]);

    // 刚确认晋级、淘汰赛签表还没开打时同样不显示名次
    const confirmed = confirmStageAdvancement(
      competition,
      computeStageAdvancement(competition, 'stage-group')
    );
    const playoffGroup = confirmed.groups.find(group => group.stageId === 'stage-playoff')!;
    expect(playoffGroup.players.length).toBeGreaterThan(0);
    expect(buildFinalStandings(confirmed)).toEqual([]);
  });
});
