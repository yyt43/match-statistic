import { describe, expect, it } from 'vitest';
import type {
  SeatingPlan,
  StageAdvancementPlan,
  TournamentCompetition,
  TournamentGroup,
} from '../types';
import { createMultiStageCompetition } from '../store/multiStageFactory';
import type { MultiStageDraftStage } from './multiStage';
import { getStageGroups } from './multiStage';
import { computeStageAdvancement, confirmStageAdvancement } from './advancement';
import { buildRankedGroup } from '../store/competitionState';

function groupStageDraft(plan: StageAdvancementPlan): MultiStageDraftStage {
  return {
    id: 'stage-group',
    name: '小组赛',
    kind: 'swiss',
    groupCount: 2,
    groupNames: ['A组', 'B组'],
    playerCountPerGroup: 8,
    rounds: 5,
    gameType: 'bo3',
    roundGameTypes: ['bo3', 'bo3', 'bo3', 'bo3', 'bo3'],
    advancementPlan: plan,
  };
}

function playoffDraft(seating: SeatingPlan): MultiStageDraftStage {
  return {
    id: 'stage-playoff',
    name: '淘汰赛',
    kind: 'single_elimination',
    groupCount: 1,
    playerCountPerGroup: 8,
    rounds: 3,
    fixedRounds: 3,
    gameType: 'bo5',
    roundGameTypes: ['bo3', 'bo5', 'bo5'],
    sourceStageIds: ['stage-group'],
    seating,
  };
}

function seedGroupResults(group: TournamentGroup): TournamentGroup {
  const targetWins = [5, 4, 4, 4, 4, 3, 2, 1];
  const players = group.players.map((player, index) => ({
    ...player,
    wins: targetWins[index] ?? 0,
    losses: Math.max(0, group.totalRounds - (targetWins[index] ?? 0)),
    points: targetWins[index] ?? 0,
    winRate: 0,
  }));
  return { ...group, players, status: 'completed', currentRound: group.totalRounds };
}

function finishGroupStage(competition: TournamentCompetition): TournamentCompetition {
  return {
    ...competition,
    groups: competition.groups.map(group =>
      group.stageId === 'stage-group' ? seedGroupResults(group) : group
    ),
  };
}

function build(
  plan: StageAdvancementPlan,
  seating: SeatingPlan
): TournamentCompetition {
  return finishGroupStage(
    createMultiStageCompetition('通用晋级测试', [
      groupStageDraft(plan),
      playoffDraft(seating),
    ])
  );
}

function codes(competition: TournamentCompetition, stageId: string): string[][] {
  return getStageGroups(competition, competition.stages!.find(stage => stage.id === stageId)!).map(
    group => buildRankedGroup(group).players.map(player => player.participantCode ?? player.name)
  );
}

const topTwoPlan: StageAdvancementPlan = {
  slots: [
    {
      id: 'slot-top-two',
      targetStageId: 'stage-playoff',
      selectors: [{ fromRank: 1, toRank: 2 }],
    },
  ],
};

describe('general advancement plan', () => {
  it('sends every group top two to the target in group order when seating is ordered', () => {
    const competition = build(topTwoPlan, { mode: 'ordered' });
    const preview = computeStageAdvancement(competition, 'stage-group');
    expect(preview.errors).toEqual([]);
    expect(preview.seats).toHaveLength(4);

    const rankedCodes = codes(competition, 'stage-group');
    expect(preview.seats.map(seat => seat.participantCode)).toEqual([
      rankedCodes[0][0],
      rankedCodes[0][1],
      rankedCodes[1][0],
      rankedCodes[1][1],
    ]);
    expect(preview.seats.map(seat => seat.targetSlot)).toEqual([0, 1, 2, 3]);
    preview.seats.forEach(seat => {
      expect(seat.targetStageId).toBe('stage-playoff');
      expect(seat.route).toBe('direct');
    });
  });

  it('lays ordered seeds into standard bracket positions when seating is snake', () => {
    const competition = build(topTwoPlan, { mode: 'snake' });
    const preview = computeStageAdvancement(competition, 'stage-group');
    expect(preview.errors).toEqual([]);
    expect(preview.seats.map(seat => seat.targetSlot)).toEqual([0, 2, 3, 1]);
  });

  it('pairs same-group ranks when sameGroup is rankPairs', () => {
    const plan: StageAdvancementPlan = {
      slots: [
        {
          id: 'slot-playoff',
          targetStageId: 'stage-playoff',
          selectors: [{ fromRank: 1, toRank: 2 }],
        },
      ],
    };
    const competition = build(plan, { mode: 'ordered', sameGroup: 'rankPairs', pairs: [[1, 2]] });
    const preview = computeStageAdvancement(competition, 'stage-group');
    expect(preview.errors).toEqual([]);
    expect(preview.breakoutPairings).toHaveLength(2);
    expect(preview.seats.map(seat => seat.route)).toEqual([
      'breakout',
      'breakout',
      'breakout',
      'breakout',
    ]);
    expect(preview.seats.map(seat => seat.targetSlot)).toEqual([0, 1, 2, 3]);
  });

  it('still reads legacy mode rankPairs from old data', () => {
    const competition = build(topTwoPlan, { mode: 'rankPairs', pairs: [[1, 2]] });
    const preview = computeStageAdvancement(competition, 'stage-group');
    expect(preview.errors).toEqual([]);
    expect(preview.breakoutPairings).toHaveLength(2);
  });

  it('swaps slots so round 1 avoids same-group meetings when sameGroup is avoid', () => {
    const competition = build(topTwoPlan, { mode: 'ordered', sameGroup: 'avoid' });
    const preview = computeStageAdvancement(competition, 'stage-group');
    expect(preview.errors).toEqual([]);
    const bySlot = [...preview.seats].sort((a, b) => (a.targetSlot ?? 0) - (b.targetSlot ?? 0));
    const roundOneGroups = [bySlot[0]?.sourceGroupId, bySlot[1]?.sourceGroupId];
    expect(roundOneGroups[0]).not.toBe(roundOneGroups[1]);
  });

  it('honours fixed slot rules and reports unresolved slots as a warning', () => {
    const competition = build(topTwoPlan, {
      mode: 'fixedSlots',
      slots: [
        { sourceGroupName: 'A组', rank: 1, slot: 2 },
        { sourceGroupName: 'B组', rank: 1, slot: 0 },
        { sourceGroupName: 'C组', rank: 1, slot: 1 },
      ],
    });
    const preview = computeStageAdvancement(competition, 'stage-group');
    expect(preview.errors).toEqual([]);

    const slotsByCode = new Map(preview.seats.map(seat => [seat.participantCode, seat.targetSlot]));
    const rankedCodes = codes(competition, 'stage-group');
    expect(slotsByCode.get(rankedCodes[0][0])).toBe(2);
    expect(slotsByCode.get(rankedCodes[1][0])).toBe(0);
    expect(preview.warnings.some(text => text.includes('固定签位'))).toBe(true);
  });

  it('takes the best N candidates across groups when a selector uses take', () => {
    const plan: StageAdvancementPlan = {
      slots: [
        {
          id: 'slot-wildcards',
          targetStageId: 'stage-playoff',
          selectors: [{ fromRank: 3, toRank: 3, take: 1 }],
        },
      ],
    };
    const competition = build(plan, { mode: 'ordered' });
    const preview = computeStageAdvancement(competition, 'stage-group');
    expect(preview.errors).toEqual([]);
    expect(preview.seats).toHaveLength(1);
    const rankedCodes = codes(competition, 'stage-group');
    // 两边第 3 名胜场相同，按姓名兜底排序，取到其中一个即可。
    expect([rankedCodes[0][2], rankedCodes[1][2]]).toContain(preview.seats[0].participantCode);
  });

  it('materializes fixed slots into the target group in slot order', () => {
    const competition = build(topTwoPlan, {
      mode: 'fixedSlots',
      slots: [
        { sourceGroupName: 'A组', rank: 1, slot: 1 },
        { sourceGroupName: 'A组', rank: 2, slot: 0 },
        { sourceGroupName: 'B组', rank: 1, slot: 3 },
        { sourceGroupName: 'B组', rank: 2, slot: 2 },
      ],
    });
    const preview = computeStageAdvancement(competition, 'stage-group');
    const updated = confirmStageAdvancement(competition, preview);

    const rankedCodes = codes(competition, 'stage-group');
    const playoffGroup = getStageGroups(
      updated,
      updated.stages!.find(stage => stage.id === 'stage-playoff')!
    )[0];
    const order = playoffGroup.players
      .slice()
      .sort((a, b) => (a.participantCode ?? '').localeCompare(b.participantCode ?? ''))
      .map(player => player.participantCode);
    expect(playoffGroup.players).toHaveLength(4);
    expect(order.sort()).toEqual(
      [rankedCodes[0][0], rankedCodes[0][1], rankedCodes[1][0], rankedCodes[1][1]].sort()
    );
  });

  it('selects single-elimination advancers by wins instead of tied ranks', () => {
    const source: MultiStageDraftStage = {
      id: 'stage-elim',
      name: '淘汰赛',
      kind: 'single_elimination',
      groupCount: 1,
      playerCountPerGroup: 8,
      rounds: 3,
      fixedRounds: 3,
      gameType: 'bo5',
      roundGameTypes: ['bo3', 'bo5', 'bo5'],
      advancementPlan: {
        slots: [
          {
            id: 'slot-final',
            targetStageId: 'stage-final',
            selectors: [{ fromRank: 1, toRank: 64, mode: 'wins', minWins: 2 }],
          },
        ],
      },
    };
    const final: MultiStageDraftStage = {
      id: 'stage-final',
      name: '决赛',
      kind: 'single_elimination',
      groupCount: 1,
      playerCountPerGroup: 8,
      rounds: 3,
      fixedRounds: 3,
      gameType: 'bo5',
      roundGameTypes: ['bo3', 'bo5', 'bo5'],
      sourceStageIds: ['stage-elim'],
    };
    const base = createMultiStageCompetition('胜场晋级测试', [source, final]);
    // 单败淘汰里同轮出局名次并列：3 胜、3 个 2 胜、2 个 1 胜、2 个 0 胜。
    const targetWins = [3, 2, 2, 2, 1, 1, 0, 0];
    const competition: TournamentCompetition = {
      ...base,
      groups: base.groups.map(group =>
        group.stageId === 'stage-elim'
          ? {
              ...group,
              status: 'completed',
              currentRound: group.totalRounds,
              players: group.players.map((player, index) => ({
                ...player,
                wins: targetWins[index] ?? 0,
                losses: Math.max(0, (targetWins[index] ?? 0) - 1),
                points: targetWins[index] ?? 0,
              })),
            }
          : group
      ),
    };
    const preview = computeStageAdvancement(competition, 'stage-elim');
    expect(preview.errors).toEqual([]);
    expect(preview.seats).toHaveLength(4);
    const winsById = new Map<string, number>();
    base.groups
      .filter(group => group.stageId === 'stage-elim')
      .forEach(group => group.players.forEach((player, index) => winsById.set(player.id, targetWins[index] ?? 0)));
    preview.seats.forEach(seat => expect(winsById.get(seat.playerId)).toBeGreaterThanOrEqual(2));
    // 胜场最高的先排，不依赖名次并列时的任意顺序。
    expect(winsById.get(preview.seats[0].playerId)).toBe(3);
  });
});
