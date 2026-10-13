import { CircleDot, Trophy } from 'lucide-react';
import type { TournamentGroup } from '../../types';
import { getEliminationBracketView, getVisibleBracketRounds } from '../../utils/elimination';
import { getPlayerDisplayName } from '../../utils/playerProfiles';

interface EliminationBracketTreeProps {
  group: TournamentGroup;
  isEnglish: boolean;
  editable?: boolean;
  selectedSlotIndex?: number | null;
  onSelectSlot?: (slotIndex: number) => void;
}

const NODE_WIDTH = 180;
const COLUMN_GAP = 28;
const ROW_HEIGHT = 136;
const HEADER_HEIGHT = 32;
const BODY_GAP = 10;
const CHAMPION_WIDTH = 148;
const CHAMPION_GAP = 28;
const MATCH_NODE_HEIGHT = 128;
const CHAMPION_NODE_HEIGHT = 96;

function getColumnX(round: number): number {
  return (round - 1) * (NODE_WIDTH + COLUMN_GAP);
}

function getNodeSpan(round: number): number {
  return 2 ** (round - 1);
}

function getNodeCenterY(round: number, matchIndex: number): number {
  const span = getNodeSpan(round);
  return matchIndex * span * ROW_HEIGHT + (span * ROW_HEIGHT) / 2;
}

function getNodeTop(round: number, matchIndex: number, height: number): number {
  return getNodeCenterY(round, matchIndex) - height / 2;
}

export function EliminationBracketTree({
  group,
  isEnglish,
  editable = false,
  selectedSlotIndex = null,
  onSelectSlot,
}: EliminationBracketTreeProps) {
  const view = getEliminationBracketView(group);
  const playerMap = new Map(group.players.map(player => [player.id, player]));

  const playerLabel = (playerId: string | null, round: number) => {
    if (!playerId) {
      if (editable && round === 1) return isEnglish ? 'Bye' : '轮空';
      return isEnglish ? 'TBD' : '待定';
    }
    const player = playerMap.get(playerId);
    if (!player) return isEnglish ? 'Unknown' : '未知';
    return getPlayerDisplayName(player);
  };

  const playerMeta = (playerId: string | null) => {
    if (!playerId) return '';
    const player = playerMap.get(playerId);
    if (!player) return '';
    const code = player.participantCode?.trim();
    const uid = player.profile?.uid?.trim();
    if (code) return `${isEnglish ? 'No.' : '编号'} ${code}`;
    return uid ? `UID ${uid}` : '';
  };

  const isWinner = (match: TournamentGroup['matches'][number] | undefined, playerId: string | null) => {
    if (!match || !playerId || match.result === 'pending') return false;
    if (match.isBye) return match.player1Id === playerId;
    return (match.result === 'player1' && match.player1Id === playerId)
      || (match.result === 'player2' && match.player2Id === playerId);
  };

  if (view.rounds.length === 0) {
    return (
      <div className="flex min-h-48 w-full items-center justify-center gap-2 py-12 text-sm text-slate-500">
        <CircleDot className="h-4 w-4" />
        {isEnglish ? 'No bracket yet' : '暂无签表'}
      </div>
    );
  }

  const firstRoundCount = view.rounds[0].nodes.length;
  const bodyHeight = Math.max(firstRoundCount * ROW_HEIGHT, ROW_HEIGHT);
  // 只画已经生成的轮次：开赛前只有首轮，逐轮推进后再补下一轮，不预画到冠军。
  // 显示轮数按赛段设置，并与导出共用同一口径。
  const rounds = getVisibleBracketRounds(group, view.rounds);
  const bracketWidth = rounds.length * NODE_WIDTH
    + Math.max(0, rounds.length - 1) * COLUMN_GAP;
  const championWidth = view.championId ? CHAMPION_GAP + CHAMPION_WIDTH : 0;
  const totalWidth = bracketWidth + championWidth;
  const finalRound = rounds[rounds.length - 1];
  const finalCenterY = getNodeCenterY(finalRound.round, 0);
  const championX = getColumnX(finalRound.round) + NODE_WIDTH + CHAMPION_GAP;
  const champion = view.championId ? playerMap.get(view.championId) : undefined;

  return (
    <div className="overflow-x-auto pb-2" data-testid="elimination-bracket-tree">
      <div className="relative" style={{ width: totalWidth }}>
        <div className="relative" style={{ height: HEADER_HEIGHT }}>
          {rounds.map(round => (
            <div
              key={round.round}
              className="absolute top-0 flex h-8 items-center justify-center rounded-md border border-slate-700/60 bg-slate-900/95 px-2 text-xs font-medium text-slate-300"
              style={{ left: getColumnX(round.round), width: NODE_WIDTH }}
            >
              {isEnglish ? `Round ${round.round}` : `第 ${round.round} 轮`}
            </div>
          ))}
          {view.championId && (
            <div
              className="absolute top-0 flex h-8 items-center justify-center rounded-md border border-gold-500/35 bg-gold-500/10 px-2 text-xs font-medium text-gold-300"
              style={{ left: championX, width: CHAMPION_WIDTH }}
            >
              {isEnglish ? 'Champion' : '冠军'}
            </div>
          )}
        </div>

        <div className="relative" style={{ height: bodyHeight, marginTop: BODY_GAP }}>
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-0"
            width={totalWidth}
            height={bodyHeight}
          >
            {rounds.slice(1).flatMap(round =>
              round.nodes.map(node => {
                const parentX = getColumnX(round.round);
                const parentY = getNodeCenterY(round.round, node.matchIndex);
                const childRound = round.round - 1;
                const childX = getColumnX(childRound) + NODE_WIDTH;
                const connectorX = childX + COLUMN_GAP / 2;
                const firstChildY = getNodeCenterY(childRound, node.matchIndex * 2);
                const secondChildY = getNodeCenterY(childRound, node.matchIndex * 2 + 1);
                const path = [
                  `M ${childX} ${firstChildY} H ${connectorX} V ${parentY} H ${parentX}`,
                  `M ${childX} ${secondChildY} H ${connectorX} V ${parentY} H ${parentX}`,
                ].join(' ');

                return (
                  <path
                    key={node.id}
                    d={path}
                    fill="none"
                    stroke="rgb(71 85 105 / 0.8)"
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })
            )}
            {view.championId && (
              <path
                d={`M ${getColumnX(finalRound.round) + NODE_WIDTH} ${finalCenterY} H ${championX}`}
                fill="none"
                stroke="rgb(245 183 49 / 0.65)"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>

          {rounds.flatMap(round =>
            round.nodes.map(node => {
              const match = node.match;
              const firstSlot = round.round === 1 ? node.matchIndex * 2 : -1;
              const secondSlot = round.round === 1 ? node.matchIndex * 2 + 1 : -1;

              const renderSide = (playerId: string | null, side: 1 | 2) => {
                const slotIndex = side === 1 ? firstSlot : secondSlot;
                const selectable = editable && slotIndex >= 0;
                const selected = selectable && selectedSlotIndex === slotIndex;
                const winner = isWinner(match, playerId);
                const score = side === 1 ? match?.player1Games : match?.player2Games;

                return (
                  <button
                    key={`${node.id}-${side}`}
                    type="button"
                    disabled={!selectable}
                    onClick={() => selectable && onSelectSlot?.(slotIndex)}
                    className={`w-full rounded-md border px-2 py-1.5 text-left transition-colors ${
                      selected
                        ? 'border-gold-500/70 bg-gold-500/15'
                        : winner
                          ? 'border-emerald-500/40 bg-emerald-500/10'
                          : 'border-slate-700/50 bg-slate-800/40'
                    } ${selectable ? 'hover:border-gold-500/50 hover:bg-slate-700/50' : 'cursor-default'}`}
                  >
                    <div className={`truncate text-xs font-medium ${winner ? 'text-emerald-300' : 'text-slate-200'}`}>
                      {playerLabel(playerId, round.round)}
                    </div>
                    <div className="flex min-h-[14px] items-center justify-between gap-2">
                      <span className="truncate font-mono text-[9px] text-slate-500">{playerMeta(playerId)}</span>
                      {match && match.result !== 'pending' && score !== undefined && (
                        <span className="font-mono text-[10px] text-slate-400">{score}</span>
                      )}
                    </div>
                  </button>
                );
              };

              return (
                <div
                  key={node.id}
                  data-bracket-round={round.round}
                  data-bracket-match-index={node.matchIndex}
                  className="absolute z-10 h-32 rounded-lg border border-slate-700/60 bg-slate-900/95 p-2 shadow-sm"
                  style={{
                    left: getColumnX(round.round),
                    top: getNodeTop(round.round, node.matchIndex, MATCH_NODE_HEIGHT),
                    width: NODE_WIDTH,
                  }}
                >
                  <div className="mb-1.5 flex items-center justify-between px-0.5 text-[9px] text-slate-500">
                    <span>{isEnglish ? `Match ${node.matchIndex + 1}` : `第 ${node.matchIndex + 1} 场`}</span>
                    {match?.isBye && <span className="text-amber-400">{isEnglish ? 'Bye' : '轮空'}</span>}
                    {match?.preDrop && <span className="text-rose-400">{isEnglish ? 'Forfeit' : '弃权'}</span>}
                  </div>
                  <div className="space-y-1">
                    {renderSide(node.player1Id, 1)}
                    {renderSide(node.player2Id, 2)}
                  </div>
                </div>
              );
            })
          )}

          {view.championId && (
            <div
              className="absolute z-10 h-24 rounded-xl border border-gold-500/35 bg-slate-900/95 p-3 text-center shadow-lg"
              style={{ left: championX, top: finalCenterY - CHAMPION_NODE_HEIGHT / 2, width: CHAMPION_WIDTH }}
            >
              <Trophy className="mx-auto mb-1.5 h-5 w-5 text-gold-400" />
              <div className="text-[10px] uppercase text-gold-500">
                {isEnglish ? 'Champion' : '冠军'}
              </div>
              <div className="mt-1 truncate text-sm font-semibold text-gold-300">
                {champion ? getPlayerDisplayName(champion) : playerLabel(view.championId, 0)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
