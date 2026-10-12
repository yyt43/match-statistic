import { describe, expect, it } from 'vitest';
import {
  createDefaultStageDraft,
  createMultiStageCompetition,
  createPoetryCupS3Competition,
} from './multiStageFactory';
import { getCompetitionKind, getOrderedStages, getStageGroups } from '../utils/multiStage';
import { validateRoster } from '../utils/playerProfiles';
import type { MultiStageDraftStage } from '../utils/multiStage';

describe('multi-stage factory', () => {
  it('builds the locked Poetry Cup S3 template', () => {
    const competition = createPoetryCupS3Competition();

    expect(competition.name).toBe('诗意杯S3');
    expect(competition.format).toBe('multi_stage');
    expect(getCompetitionKind(competition)).toBe('poetry_cup_s3');

    const stages = getOrderedStages(competition);
    expect(stages.map(stage => stage.name)).toEqual(['小组赛', '突围赛', '淘汰赛']);
    expect(stages.map(stage => stage.locked)).toEqual([true, true, true]);
    expect(stages[1].sourceStageIds).toEqual(['s3-group']);
    expect(stages[2].sourceStageIds).toEqual(['s3-group', 's3-breakout']);

    const groupStage = getStageGroups(competition, stages[0]);
    expect(groupStage.map(group => group.name)).toEqual(['A组', 'B组', 'C组', 'D组']);
    expect(groupStage.map(group => group.players.length)).toEqual([32, 32, 32, 32]);
    expect(groupStage.map(group => group.totalRounds)).toEqual([5, 5, 5, 5]);
    expect(groupStage.every(group => group.gameType === 'bo3')).toBe(true);

    const breakout = getStageGroups(competition, stages[1]);
    expect(breakout).toHaveLength(1);
    expect(breakout[0].name).toBe('突围赛');
    expect(breakout[0].pairingType).toBe('single_elimination');
    expect(breakout[0].players).toHaveLength(0);
    expect(breakout[0].plannedPlayerCount).toBe(16);
    expect(breakout[0].totalRounds).toBe(1);
    expect(breakout[0].roundsLocked).toBe(true);
    expect(breakout[0].gameType).toBe('bo3');

    const playoff = getStageGroups(competition, stages[2])[0];
    expect(playoff.players).toHaveLength(0);
    expect(playoff.totalRounds).toBe(4);
    expect(playoff.roundGameTypes).toEqual(['bo3', 'bo5', 'bo5', 'bo7']);
  });

  it('keeps participant codes unique across every stage of the template', () => {
    const competition = createPoetryCupS3Competition();
    const codes = competition.groups.flatMap(group =>
      group.players.map(player => player.participantCode)
    );

    expect(codes.every(code => Boolean(code))).toBe(true);
    expect(new Set(codes).size).toBe(codes.length);
    expect(
      validateRoster(competition).issues.some(
        issue => issue.code === 'DUPLICATE_PARTICIPANT_CODE'
      )
    ).toBe(false);
  });

  it('builds a generic multi-stage event from stage drafts', () => {
    const first = createDefaultStageDraft(1);
    first.name = '小组赛';
    first.groupCount = 2;
    const second: MultiStageDraftStage = {
      ...createDefaultStageDraft(2),
      name: '淘汰赛',
      kind: 'single_elimination',
      playerCountPerGroup: 16,
      sourceStageIds: [first.id],
    };

    const competition = createMultiStageCompetition('自定义多阶段', [first, second]);
    const stages = getOrderedStages(competition);

    expect(getCompetitionKind(competition)).toBe('multi_stage');
    expect(competition.workflow).toBe('standard');
    expect(stages.map(stage => stage.name)).toEqual(['小组赛', '淘汰赛']);
    expect(stages[0].groupIds).toHaveLength(2);
    expect(getStageGroups(competition, stages[0]).map(group => group.name)).toEqual([
      '小组赛A组',
      '小组赛B组',
    ]);
    expect(stages[1].sourceStageIds).toEqual([first.id]);
    expect(getStageGroups(competition, stages[1])[0].totalRounds).toBe(4);
  });
});
