import { getDraftGroupNames, type MultiStageDraftStage } from './multiStage';
import { getSameGroupMode, normalizeAdvancementPlan, normalizeSeatingPlan } from './advancementPlan';

export type StageDraftIssueSeverity = 'error' | 'warning';

export interface StageDraftIssue {
  severity: StageDraftIssueSeverity;
  stageId?: string;
  stageName?: string;
  message: string;
}

function stageLabel(stage: MultiStageDraftStage | undefined, isEnglish: boolean): string {
  const name = stage?.name?.trim();
  if (name) return name;
  return isEnglish ? 'Untitled stage' : '未命名赛段';
}

/** 每个赛段的下游赛段 id：规则里去向 + 下游声明的名单来源。 */
function downstreamIds(
  stages: MultiStageDraftStage[],
  stage: MultiStageDraftStage,
  index: number
): string[] {
  const ids = new Set<string>();
  (normalizeAdvancementPlan(stage)?.slots ?? []).forEach(slot => {
    if (slot.targetStageId) ids.add(slot.targetStageId);
  });
  stages.forEach(target => {
    if (target.id !== stage.id && (target.sourceStageIds ?? []).includes(stage.id)) {
      ids.add(target.id);
    }
  });
  if (ids.size === 0) {
    const later = stages.slice(index + 1);
    const declared = later.filter(target => (target.sourceStageIds ?? []).includes(stage.id));
    if (declared.length === 1) ids.add(declared[0].id);
    else if (later.length === 1) ids.add(later[0].id);
  }
  return Array.from(ids).filter(id => stages.some(target => target.id === id));
}

/** 上游赛段里各小组的已知人数；名单由晋级产生时返回 undefined。 */
function knownGroupSize(stage: MultiStageDraftStage): number | undefined {
  if (stage.sourceStageIds?.length) return undefined;
  return Math.max(2, Math.floor(stage.playerCountPerGroup) || 2);
}

/**
 * 开赛前的规则体检：结构、赛段内规则、晋级规则、赛段关系一起查。
 * error 会阻止开赛，warning 只提示（引擎仍能算，但结果可能不是裁判想要的）。
 */
export function validateStageDrafts(
  stages: MultiStageDraftStage[],
  isEnglish: boolean
): StageDraftIssue[] {
  const issues: StageDraftIssue[] = [];
  const nameOf = (id: string) => {
    const stage = stages.find(item => item.id === id);
    return stageLabel(stage, isEnglish);
  };

  if (stages.length === 0) {
    return [{ severity: 'error', message: isEnglish ? 'No stage configured.' : '还没有配置任何赛段。' }];
  }

  stages.forEach((stage, index) => {
    const label = stageLabel(stage, isEnglish);
    const push = (severity: StageDraftIssueSeverity, message: string) =>
      issues.push({ severity, stageId: stage.id, stageName: label, message });

    if (!stage.name.trim()) {
      push('error', isEnglish ? 'Stage name is required.' : '赛段名称不能为空。');
    }
    if (!stage.sourceStageIds?.length && stage.playerCountPerGroup < 2) {
      push('error', isEnglish ? 'Each group needs at least two players.' : '每组至少需要两名选手。');
    }

    const downstream = downstreamIds(stages, stage, index);
    // 新模型按「去向 → 选人条件」展开，旧规则已经归一化成同样结构。
    const rules = (normalizeAdvancementPlan(stage)?.slots ?? []).flatMap(slot =>
      slot.selectors.map(selector => ({ ...selector, targetStageId: slot.targetStageId }))
    );
    if (downstream.length > 0 && rules.length === 0 && !stage.breakout && !stage.seating) {
      push(
        'error',
        isEnglish
          ? 'No advancement rule, so the downstream stage receives nobody.'
          : '没有配置晋级条件，下游赛段收不到任何选手。'
      );
    }

    const groupSize = knownGroupSize(stage);
    const claimedRanks = new Map<number, string[]>();
    rules.forEach(rule => {
      const winsMode = rule.mode === 'wins';
      const from = Math.max(1, Math.floor(rule.fromRank) || 1);
      const to = Math.max(1, Math.floor(rule.toRank) || 1);
      const resolvedTargetId = rule.targetStageId
        || (downstream.length === 1 ? downstream[0] : '');
      if (winsMode) {
        if (rule.minWins === undefined && rule.maxWins === undefined) {
          push(
            'warning',
            isEnglish
              ? 'No wins limit means every player advances from this source group.'
              : '没有填写胜场等于全部晋级；如果只想取部分选手，请填写胜场区间。'
          );
        }
        const maxRoundWins = stage.fixedRounds ?? stage.rounds;
        if (rule.minWins !== undefined && rule.minWins > maxRoundWins) {
          push(
            'error',
            isEnglish
              ? `Asks for at least ${rule.minWins} wins, but this stage only has ${maxRoundWins} rounds.`
              : `要求至少 ${rule.minWins} 胜，但本赛段只有 ${maxRoundWins} 轮，没人能达到。`
          );
        }
        if (rule.maxWins !== undefined && rule.maxWins > maxRoundWins) {
          push(
            'warning',
            isEnglish
              ? `The wins cap ${rule.maxWins} is above the ${maxRoundWins} rounds of this stage; the cap never filters anyone.`
              : `胜场上限 ${rule.maxWins} 超过本赛段轮数 ${maxRoundWins}，这个上限不会筛掉任何人。`
          );
        }
      } else {
        if (from > to) {
          push(
            'error',
            isEnglish
              ? `Rank range ${from}-${to} is reversed.`
              : `名次区间 ${from}-${to} 起点大于终点。`
          );
        }
        if (groupSize !== undefined && to > groupSize) {
          push(
            'error',
            isEnglish
              ? `Asks for rank ${to} but each group only has ${groupSize} players.`
              : `要求取到第 ${to} 名，但每组只有 ${groupSize} 人。`
          );
        }
        if (downstream.length > 0 && stage.kind === 'single_elimination') {
          push(
            'warning',
            isEnglish
              ? 'Single-elimination ranks tie players knocked out in the same round, so a rank range may pick an arbitrary subset. Prefer a wins (round) condition.'
              : '单败淘汰赛段里同一轮出局的选手名次并列，按名次区间取人可能只取到并列者的一部分；建议改用「淘汰轮次 / 胜场」条件。'
          );
        }
      }
      if (rule.minWins !== undefined && rule.maxWins !== undefined && rule.minWins > rule.maxWins) {
        push(
          'error',
          isEnglish
            ? `Wins range ${rule.minWins}-${rule.maxWins} is reversed.`
            : `胜场区间 ${rule.minWins}-${rule.maxWins} 下限大于上限。`
        );
      }
      if (!resolvedTargetId && downstream.length > 1) {
        push(
          'error',
          isEnglish
            ? 'This rule has no target stage, and there is more than one candidate.'
            : '这条晋级条件没有选择目标赛段，而候选赛段不止一个。'
        );
      }
      if (rule.targetStageId && !stages.some(target => target.id === rule.targetStageId)) {
        push(
          'error',
          isEnglish
            ? `The target stage of rank ${from}-${to} no longer exists.`
            : `名次 ${from}-${to} 的目标赛段已不存在，请重新选择。`
        );
      }
      const targetStage = stages.find(target => target.id === resolvedTargetId);
      if (targetStage && !(targetStage.sourceStageIds ?? []).includes(stage.id)) {
        push(
          'warning',
          isEnglish
            ? `${stageLabel(targetStage, isEnglish)} does not list this stage as a roster source, so confirming the advancement will overwrite its roster.`
            : `${stageLabel(targetStage, isEnglish)}的名单来源还没有包含本赛段，确认晋级后会按结果覆盖它的名单。`
        );
      }
      if (winsMode) return;
      for (let rank = from; rank <= to; rank += 1) {
        const owners = claimedRanks.get(rank) ?? [];
        owners.push(resolvedTargetId);
        claimedRanks.set(rank, owners);
      }
    });

    // 同名次被多条规则指向不同赛段：引擎只认第一条。
    const conflictRanks: number[] = [];
    claimedRanks.forEach((targets, rank) => {
      if (new Set(targets).size > 1) conflictRanks.push(rank);
    });
    if (conflictRanks.length > 0) {
      conflictRanks.sort((a, b) => a - b);
      push(
        'warning',
        isEnglish
          ? `Ranks ${conflictRanks.join(', ')} match several rules with different targets; only the first rule wins.`
          : `第 ${conflictRanks.join('、')} 名同时命中多条去向不同的规则，系统只按排在前面的规则处理。`
      );
    }

    // 接收方的落位设置：固定签位 / 名次配对两类需要校验来源与名次。
    const seating = normalizeSeatingPlan(stage);
    if (seating.mode === 'fixedSlots') {
      const configuredSlots = seating.slots ?? [];
      const upstreamStages = (stage.sourceStageIds ?? [])
        .map(id => stages.find(item => item.id === id))
        .filter((item): item is MultiStageDraftStage => Boolean(item));
      if (configuredSlots.length > 0 && upstreamStages.length === 0) {
        push(
          'warning',
          isEnglish
            ? 'Bracket slots only apply to stages fed by an upstream stage.'
            : '签表对位只在名单来自上游赛段时生效，本赛段目前是自行导入名单。'
        );
      }
      const groupOwner = new Map<string, MultiStageDraftStage>();
      upstreamStages.forEach(upstream => {
        getDraftGroupNames(upstream).forEach(name => groupOwner.set(name, upstream));
      });
      const slots = new Map<number, number>();
      configuredSlots.forEach(seed => {
        const owner = groupOwner.get(seed.sourceGroupName);
        if (configuredSlots.length > 0 && !owner) {
          push(
            'error',
            isEnglish
              ? `Bracket slot refers to unknown group "${seed.sourceGroupName}".`
              : `签表对位引用了不存在的来源小组「${seed.sourceGroupName}」。`
          );
        } else if (owner) {
          const size = knownGroupSize(owner);
          if (seed.rank < 1) {
            push('error', isEnglish ? 'Bracket slot rank must be at least 1.' : '签表对位的名次至少为 1。');
          } else if (size !== undefined && seed.rank > size) {
            push(
              'error',
              isEnglish
                ? `${owner.name} only has ${size} players, so rank ${seed.rank} cannot exist.`
                : `${stageLabel(owner, isEnglish)}只有 ${size} 名选手，取不到第 ${seed.rank} 名。`
            );
          }
        }
        if (seed.slot < 0) {
          push('error', isEnglish ? 'Bracket slot index must start at 1.' : '签表位置从第 1 位开始。');
        } else if (slots.has(seed.slot)) {
          push(
            'warning',
            isEnglish
              ? `Bracket slot ${seed.slot + 1} is set twice; only the first entry is used.`
              : `签表第 ${seed.slot + 1} 位被设置了两遍，只有第一条生效。`
          );
        } else {
          slots.set(seed.slot, 1);
        }
      });
    } else if (getSameGroupMode(seating) === 'rankPairs') {
      const pairs = seating.pairs ?? [];
      if (pairs.length === 0) {
        push(
          'warning',
          isEnglish
            ? 'Rank-pair seating is enabled but no pair is configured; nothing will be paired.'
            : '已选择名次配对落位，但还没有配置任何对阵组合。'
        );
      }
      const seen = new Set<string>();
      pairs.forEach(([first, second]) => {
        if (first < 1 || second < 1) {
          push('error', isEnglish ? 'Rank pairs must start at rank 1.' : '名次配对的名次至少为 1。');
          return;
        }
        if (first === second) {
          push(
            'error',
            isEnglish
              ? `Rank ${first} is paired with itself.`
              : `第 ${first} 名和自己配对，请调整名次组合。`
          );
        }
        const key = [first, second].sort((a, b) => a - b).join('-');
        if (seen.has(key)) {
          push(
            'warning',
            isEnglish
              ? `Rank pair ${first} vs ${second} is configured twice.`
              : `名次配对 ${first} 对 ${second} 配置了两遍。`
          );
        }
        seen.add(key);
      });
    } else if (getSameGroupMode(seating) === 'avoid' && stage.kind !== 'single_elimination') {
      push(
        'warning',
        isEnglish
          ? 'First-round same-group avoidance only applies to single-elimination stages; this stage ignores it.'
          : '「首轮回避同组」只对单败淘汰赛段有意义，当前赛段不是单败淘汰，这项设置不会生效。'
      );
    }
  });

  // 赛段依赖成环（例如导入的数据里 A 依赖 B、B 又依赖 A）。
  const edges = new Map<string, string[]>(stages.map(stage => [stage.id, []]));
  stages.forEach((stage, index) => {
    downstreamIds(stages, stage, index).forEach(target => {
      edges.set(stage.id, [...(edges.get(stage.id) ?? []), target]);
    });
  });
  const state = new Map<string, 1 | 2>();
  const stack: string[] = [];
  const findCycle = (id: string): string[] | null => {
    if (state.get(id) === 2) return null;
    if (state.get(id) === 1) {
      return [...stack.slice(stack.indexOf(id)), id];
    }
    state.set(id, 1);
    stack.push(id);
    for (const next of edges.get(id) ?? []) {
      const found = findCycle(next);
      if (found) return found;
    }
    stack.pop();
    state.set(id, 2);
    return null;
  };
  let cycle: string[] | null = null;
  for (const stage of stages) {
    cycle = findCycle(stage.id);
    if (cycle) break;
  }
  if (cycle) {
    const path = cycle.map(nameOf).join(isEnglish ? ' -> ' : ' → ');
    issues.push({
      severity: 'error',
      message: isEnglish
        ? `Stage dependencies form a loop (${path}); the advancement order cannot be computed.`
        : `赛段依赖成环（${path}），无法确定晋级顺序。`,
    });
  }

  return issues;
}
