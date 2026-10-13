import { describe, expect, it } from 'vitest';
import { createDefaultStageDraft, createPoetryCupS3Competition } from '../store/multiStageFactory';
import { createPoetryCupS3DraftStages, type MultiStageDraftStage } from './multiStage';
import { validateStageDrafts } from './stageDraftValidation';

function errorsOf(stages: MultiStageDraftStage[]): string[] {
  return validateStageDrafts(stages, false)
    .filter(issue => issue.severity === 'error')
    .map(issue => issue.message);
}

function warningsOf(stages: MultiStageDraftStage[]): string[] {
  return validateStageDrafts(stages, false)
    .filter(issue => issue.severity === 'warning')
    .map(issue => issue.message);
}

function groupStage(): MultiStageDraftStage {
  return {
    ...createDefaultStageDraft(1),
    id: 'stage-group',
    name: '小组赛',
    playerCountPerGroup: 8,
    advancementRules: [
      { id: 'r1', fromRank: 1, toRank: 2, targetStageId: 'stage-final' },
    ],
  };
}

function finalStage(): MultiStageDraftStage {
  return {
    id: 'stage-final',
    name: '决赛',
    kind: 'single_elimination',
    groupCount: 1,
    playerCountPerGroup: 8,
    rounds: 3,
    gameType: 'bo5',
    roundGameTypes: ['bo3', 'bo5', 'bo7'],
    sourceStageIds: ['stage-group'],
  };
}

describe('stage draft validation', () => {
  it('accepts the locked Poetry Cup S3 template', () => {
    expect(validateStageDrafts(createPoetryCupS3DraftStages(), false)).toEqual([]);
    expect(createPoetryCupS3Competition().stages).toHaveLength(3);
  });

  it('accepts a single default stage with no downstream', () => {
    expect(validateStageDrafts([createDefaultStageDraft(1)], false)).toEqual([]);
  });

  it('accepts a two-stage event that advances by rank', () => {
    expect(errorsOf([groupStage(), finalStage()])).toEqual([]);
  });

  it('rejects a reversed rank range', () => {
    const stage = groupStage();
    stage.advancementRules = [{ id: 'r1', fromRank: 5, toRank: 2, targetStageId: 'stage-final' }];
    expect(errorsOf([stage, finalStage()]).join(' ')).toContain('起点大于终点');
  });

  it('rejects a rank beyond the group size', () => {
    const stage = groupStage();
    stage.advancementRules = [{ id: 'r1', fromRank: 1, toRank: 12, targetStageId: 'stage-final' }];
    expect(errorsOf([stage, finalStage()]).join(' ')).toContain('每组只有 8 人');
  });

  it('rejects a stage that feeds a downstream stage without any rule', () => {
    const stage = groupStage();
    stage.advancementRules = [];
    expect(errorsOf([stage, finalStage()]).join(' ')).toContain('收不到任何选手');
  });

  it('rejects bracket slots pointing at an unknown group', () => {
    const final = { ...finalStage(), seedRules: [{ sourceGroupName: 'Z组', rank: 1, targetSlot: 0 }] };
    expect(errorsOf([groupStage(), final]).join(' ')).toContain('不存在的来源小组');
  });

  it('rejects bracket slots ranked higher than the upstream group size', () => {
    const final = {
      ...finalStage(),
      seedRules: [{ sourceGroupName: '小组赛', rank: 9, targetSlot: 0 }],
    };
    expect(errorsOf([groupStage(), final]).join(' ')).toContain('取不到第 9 名');
  });

  it('warns when two slots share the same bracket position', () => {
    const final = {
      ...finalStage(),
      seedRules: [
        { sourceGroupName: '小组赛', rank: 1, targetSlot: 0 },
        { sourceGroupName: '小组赛', rank: 2, targetSlot: 0 },
      ],
    };
    expect(warningsOf([groupStage(), final]).join(' ')).toContain('只有第一条生效');
  });

  it('warns when one rank is claimed by rules with different targets', () => {
    const stage = groupStage();
    stage.advancementRules = [
      { id: 'r1', fromRank: 1, toRank: 2, targetStageId: 'stage-final' },
      { id: 'r2', fromRank: 2, toRank: 3, targetStageId: 'stage-other' },
    ];
    const other: MultiStageDraftStage = { ...finalStage(), id: 'stage-other', name: '附加轮' };
    expect(warningsOf([stage, finalStage(), other]).join(' ')).toContain('只按排在前面的规则处理');
  });

  it('warns when the target stage does not list this stage as a roster source', () => {
    const final = { ...finalStage(), sourceStageIds: undefined };
    expect(warningsOf([groupStage(), final]).join(' ')).toContain('名单来源还没有包含本赛段');
  });

  it('rejects stage dependencies that form a loop', () => {
    const first: MultiStageDraftStage = { ...groupStage(), sourceStageIds: ['stage-second'] };
    const second: MultiStageDraftStage = {
      ...finalStage(),
      id: 'stage-second',
      name: '第二轮',
      sourceStageIds: ['stage-group'],
    };
    expect(errorsOf([first, second]).join(' ')).toContain('成环');
  });
});
