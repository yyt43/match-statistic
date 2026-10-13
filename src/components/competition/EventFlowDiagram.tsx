import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PairingType, StageAdvancementRule } from '../../types';

/** 流程图节点：草稿赛段与已落库赛段都能映射到这一结构。 */
export interface EventFlowStage {
  id: string;
  name: string;
  kind: PairingType;
  sourceStageIds?: string[];
  advancementRules?: StageAdvancementRule[];
  /** 附加说明，例如「4 组」「来自小组赛」。 */
  note?: string;
}

interface FlowEdge {
  from: string;
  to: string;
}

interface FlowPath {
  key: string;
  d: string;
}

function buildEdges(stages: EventFlowStage[]): FlowEdge[] {
  const ids = new Set(stages.map(stage => stage.id));
  const edges = new Map<string, FlowEdge>();
  const add = (from: string, to: string) => {
    if (from === to || !ids.has(from) || !ids.has(to)) return;
    edges.set(`${from}->${to}`, { from, to });
  };
  stages.forEach((stage, index) => {
    (stage.advancementRules ?? []).forEach(rule => {
      if (rule.targetStageId) add(stage.id, rule.targetStageId);
    });
    (stage.sourceStageIds ?? []).forEach(sourceId => add(sourceId, stage.id));
    // 规则还没选去向、但只有一个候选下游时，默认就指向它。
    const fallback = getDefaultTarget(stages, index);
    if (fallback && (stage.advancementRules ?? []).some(rule => !rule.targetStageId)) {
      add(stage.id, fallback.id);
    }
  });
  return Array.from(edges.values());
}

/** 与引擎一致：唯一声明的下游，或唯一靠后的赛段。 */
function getDefaultTarget(
  stages: EventFlowStage[],
  index: number
): EventFlowStage | undefined {
  const stage = stages[index];
  const later = stages.slice(index + 1);
  const declared = later.filter(target => (target.sourceStageIds ?? []).includes(stage.id));
  if (declared.length === 1) return declared[0];
  if (declared.length === 0 && later.length === 1) return later[0];
  return undefined;
}

/** 按最长路径分层，保证箭头一律从左指向右。 */
function buildLevels(stages: EventFlowStage[], edges: FlowEdge[]): Map<string, number> {
  const incoming = new Map<string, string[]>(stages.map(stage => [stage.id, []]));
  edges.forEach(edge => incoming.get(edge.to)?.push(edge.from));
  const levels = new Map<string, number>();
  const resolve = (id: string, guard: Set<string>): number => {
    const cached = levels.get(id);
    if (cached !== undefined) return cached;
    if (guard.has(id)) return 0;
    guard.add(id);
    const predecessors = incoming.get(id) ?? [];
    const level = predecessors.length === 0
      ? 0
      : Math.max(...predecessors.map(predecessor => resolve(predecessor, guard) + 1));
    levels.set(id, level);
    return level;
  };
  stages.forEach(stage => resolve(stage.id, new Set()));
  return levels;
}

function describeStageKind(kind: PairingType, isEnglish: boolean): string {
  return kind === 'single_elimination'
    ? (isEnglish ? 'Single elimination' : '单败淘汰')
    : (isEnglish ? 'Swiss' : '瑞士轮');
}

function describeRule(
  rule: StageAdvancementRule,
  isEnglish: boolean,
  targetName: string | undefined
): string {
  const rankText = rule.toRank > rule.fromRank
    ? `${isEnglish ? 'rank' : '名次'} ${rule.fromRank}-${rule.toRank}`
    : `${isEnglish ? 'rank' : '名次'} ${rule.fromRank}`;
  let winsText = '';
  if (rule.minWins !== undefined && rule.maxWins !== undefined) {
    winsText = rule.minWins === rule.maxWins
      ? ` ${isEnglish ? `${rule.minWins} wins` : `胜场 ${rule.minWins}`}`
      : ` ${isEnglish ? `${rule.minWins}-${rule.maxWins} wins` : `胜场 ${rule.minWins}-${rule.maxWins}`}`;
  } else if (rule.minWins !== undefined) {
    winsText = ` ${isEnglish ? `${rule.minWins}+ wins` : `至少 ${rule.minWins} 胜`}`;
  } else if (rule.maxWins !== undefined) {
    winsText = ` ${isEnglish ? `up to ${rule.maxWins} wins` : `至多 ${rule.maxWins} 胜`}`;
  }
  const target = targetName || (isEnglish ? 'choose a target stage' : '未选择目标赛段');
  return `${rankText}${winsText} → ${target}`;
}

/**
 * 赛事流程图：赛段按依赖分层，箭头严格按选手的晋级方向绘制。
 * 一个赛段可以同时指向多个下游（例如小组赛既进突围赛又进淘汰赛）。
 */
export function EventFlowDiagram({
  stages,
  isEnglish,
  className,
  direction = 'horizontal',
}: {
  stages: EventFlowStage[];
  isEnglish: boolean;
  className?: string;
  /** 宽面板用横向，窄栏（如运行页左栏）用纵向。 */
  direction?: 'horizontal' | 'vertical';
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const nodeRefs = useRef(new Map<string, HTMLDivElement>());
  const [paths, setPaths] = useState<FlowPath[]>([]);

  const edges = useMemo(() => buildEdges(stages), [stages]);
  const columns = useMemo(() => {
    const levels = buildLevels(stages, edges);
    const byLevel = new Map<number, EventFlowStage[]>();
    stages.forEach(stage => {
      const level = levels.get(stage.id) ?? 0;
      byLevel.set(level, [...(byLevel.get(level) ?? []), stage]);
    });
    return Array.from(byLevel.keys())
      .sort((a, b) => a - b)
      .map(level => byLevel.get(level) ?? []);
  }, [stages, edges]);
  const nameById = useMemo(
    () => new Map(stages.map(stage => [stage.id, stage.name])),
    [stages]
  );
  /** 纵向布局：按依赖层级从上到下排列，同层保持设置顺序。 */
  const orderedStages = useMemo(() => {
    const levels = buildLevels(stages, edges);
    return stages
      .map((stage, index) => ({ stage, index, level: levels.get(stage.id) ?? 0 }))
      .sort((a, b) => a.level - b.level || a.index - b.index)
      .map(item => item.stage);
  }, [stages, edges]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measure = () => {
      const base = container.getBoundingClientRect();
      const boxes = new Map<string, {
        left: number;
        right: number;
        top: number;
        bottom: number;
        centerX: number;
        middle: number;
      }>();
      nodeRefs.current.forEach((element, id) => {
        const rect = element.getBoundingClientRect();
        boxes.set(id, {
          left: rect.left - base.left,
          right: rect.right - base.left,
          top: rect.top - base.top,
          bottom: rect.bottom - base.top,
          centerX: rect.left - base.left + rect.width / 2,
          middle: rect.top - base.top + rect.height / 2,
        });
      });
      const next: FlowPath[] = [];
      const allBoxes = Array.from(boxes.entries());
      const laneY = Math.max(...allBoxes.map(([, box]) => box.bottom)) + 14;
      const laneX = Math.max(...allBoxes.map(([, box]) => box.right)) + 12;
      edges.forEach(edge => {
        const from = boxes.get(edge.from);
        const to = boxes.get(edge.to);
        if (!from || !to) return;
        const others = allBoxes.filter(([id]) => id !== edge.from && id !== edge.to);
        let d: string;
        if (direction === 'vertical') {
          const startX = from.centerX;
          const endX = to.centerX;
          const startY = from.bottom;
          const endY = to.top;
          // 跨层箭头绕开中间的方框（例如小组赛直达淘汰赛）
          const crosses = others.some(([, box]) => box.top < endY - 2 && box.bottom > startY + 2);
          if (!crosses && Math.abs(startX - endX) < 1) {
            d = `M ${startX} ${startY} L ${endX} ${endY}`;
          } else if (crosses) {
            d = `M ${startX} ${startY} L ${laneX} ${startY} L ${laneX} ${endY} L ${endX} ${endY}`;
          } else {
            const bulge = Math.max(startX, endX) + 18;
            d = `M ${startX} ${startY} C ${bulge} ${startY}, ${bulge} ${endY}, ${endX} ${endY}`;
          }
        } else {
          const startX = from.right;
          const endX = to.left;
          const startY = from.middle;
          const endY = to.middle;
          const crosses = others.some(([, box]) => box.left < endX - 2 && box.right > startX + 2);
          if (crosses) {
            d = `M ${startX} ${startY} L ${startX} ${laneY} L ${endX} ${laneY} L ${endX} ${endY}`;
          } else {
            const bend = Math.max(20, Math.abs(endX - startX) / 2);
            d = `M ${startX} ${startY} C ${startX + bend} ${startY}, ${endX - bend} ${endY}, ${endX} ${endY}`;
          }
        }
        next.push({ key: `${edge.from}->${edge.to}`, d });
      });
      setPaths(current => (
        JSON.stringify(current) === JSON.stringify(next) ? current : next
      ));
    };

    measure();
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure);
      observer.observe(container);
    }
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [direction, edges, stages]);

  if (stages.length === 0) return null;

  const renderCard = (stage: EventFlowStage) => {
    const rules = stage.advancementRules ?? [];
    const index = stages.findIndex(item => item.id === stage.id);
    // 最后一个赛段的规则不会流向任何地方，没有填去向时不必显示。
    const showRules = rules.length > 0
      && (index < stages.length - 1 || rules.some(rule => rule.targetStageId));
    const fallback = getDefaultTarget(
      stages,
      index
    );
    return (
      <div
        key={stage.id}
        ref={element => {
          if (element) nodeRefs.current.set(stage.id, element);
          else nodeRefs.current.delete(stage.id);
        }}
        className="w-full rounded-lg border border-slate-700/60 bg-slate-900/50 px-3 py-2 text-[11px] text-slate-300"
      >
        <div className="font-medium text-slate-100">
          {stage.name || (isEnglish ? 'Untitled stage' : '未命名赛段')}
        </div>
        <div className="text-[10px] text-slate-500">
          {describeStageKind(stage.kind, isEnglish)}
          {stage.note ? ` · ${stage.note}` : ''}
        </div>
        {showRules && (
          <div className="mt-0.5 space-y-0.5 text-[10px] text-gold-400/80">
            {rules.map(rule => (
              <div key={rule.id}>
                {describeRule(rule, isEnglish, nameById.get(rule.targetStageId || fallback?.id || ''))}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={className}>
      {direction === 'vertical' ? (
        <div ref={containerRef} className="relative flex flex-col gap-4 pr-5">
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full text-slate-600"
            aria-hidden="true"
          >
            <defs>
              <marker
                id="event-flow-arrow-vertical"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
              </marker>
            </defs>
            {paths.map(path => (
              <path
                key={path.key}
                d={path.d}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
                markerEnd="url(#event-flow-arrow-vertical)"
              />
            ))}
          </svg>
          {orderedStages.map(stage => renderCard(stage))}
        </div>
      ) : (
      <div className="overflow-x-auto pb-1">
        <div
          ref={containerRef}
          className="relative inline-flex min-w-full items-stretch gap-10 px-1 pb-8 pt-1"
        >
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full text-slate-600"
            aria-hidden="true"
          >
            <defs>
              <marker
                id="event-flow-arrow"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
              </marker>
            </defs>
            {paths.map(path => (
              <path
                key={path.key}
                d={path.d}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
                markerEnd="url(#event-flow-arrow)"
              />
            ))}
          </svg>
          {columns.map((column, columnIndex) => (
            <div key={`column-${columnIndex}`} className="flex w-44 flex-col justify-center gap-3">
              {column.map(stage => renderCard(stage))}
            </div>
          ))}
        </div>
      </div>
      )}
    </div>
  );
}
