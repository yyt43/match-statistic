import type { TournamentGroup } from '../../types';
import { getEliminationBracketView, getVisibleBracketRounds } from '../../utils/elimination';
import { getPlayerDisplayName } from '../../utils/playerProfiles';

interface BracketImageViewProps {
  group: TournamentGroup;
  isEnglish: boolean;
}

const NODE_WIDTH = 214;
const COLUMN_GAP = 46;
const ROW_HEIGHT = 148;
const HEADER_HEIGHT = 28;
const BODY_GAP = 14;
const MATCH_NODE_HEIGHT = 100;
const CHAMPION_WIDTH = 176;
const CHAMPION_GAP = 40;
const CHAMPION_NODE_HEIGHT = 112;

const COLORS = {
  paper: '#0B1020',
  card: '#111B31',
  cardBorder: '#22304D',
  cardShadow: 'rgba(2, 6, 23, 0.55)',
  winnerRow: 'rgba(52, 211, 153, 0.10)',
  winnerBorder: 'rgba(52, 211, 153, 0.35)',
  winnerText: '#6EE7B7',
  text: '#E2E8F0',
  muted: '#7C8DAE',
  faint: '#4A5A78',
  upper: '#34D399',
  lower: '#F5B731',
  neutral: '#64748B',
  championFill: '#134E3B',
  championBorder: '#1F7A5A',
  championLabel: '#A7F3D0',
  championName: '#F0FDF4',
};

interface RoundColumn {
  round: number;
  nodes: ReturnType<typeof getEliminationBracketView>['rounds'][number]['nodes'];
}

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

function roundLabel(round: RoundColumn['round'], bracketSize: number, isEnglish: boolean): string {
  const matchesInRound = Math.max(1, bracketSize / 2 ** round);
  if (matchesInRound === 1) return isEnglish ? 'Final' : '决赛';
  if (matchesInRound === 2) return isEnglish ? 'Semifinal' : '半决赛';
  if (matchesInRound === 4) return isEnglish ? 'Quarterfinal' : '1/4 决赛';
  const playersInRound = matchesInRound * 2;
  return isEnglish ? `Round of ${playersInRound}` : `1/${matchesInRound} 决赛`;
}

function branchColor(round: number, matchIndex: number, bracketSize: number): string {
  const upperLimit = bracketSize / 2 ** (round + 1);
  if (matchIndex >= upperLimit && matchIndex < upperLimit * 2) {
    // 上半区（绿色）与下半区（金色）；决赛及更后为中性灰。
    return matchIndex < bracketSize / 2 ** round / 2 ? COLORS.upper : COLORS.lower;
  }
  return COLORS.neutral;
}

function formatGameType(value: string | undefined): string {
  return (value || 'bo3').toUpperCase();
}

export function BracketImageView({ group, isEnglish }: BracketImageViewProps) {
  const view = getEliminationBracketView(group);
  const playerMap = new Map(group.players.map(player => [player.id, player]));
  const bracket = group.eliminationBracket;

  if (!bracket || view.rounds.length === 0) {
    return (
      <div style={{ padding: '48px 32px', textAlign: 'center', color: COLORS.muted, fontSize: 14 }}>
        {isEnglish ? 'This group has no fixed bracket.' : '该小组暂无固定签表。'}
      </div>
    );
  }

  const rounds = getVisibleBracketRounds(group, view.rounds);
  const bracketSize = bracket.size;
  const firstRoundCount = rounds[0].nodes.length;
  const bodyHeight = Math.max(1, firstRoundCount) * ROW_HEIGHT;
  const bracketWidth = rounds.length * NODE_WIDTH + Math.max(0, rounds.length - 1) * COLUMN_GAP;
  const championWidth = CHAMPION_GAP + CHAMPION_WIDTH;
  const totalWidth = bracketWidth + championWidth;
  const finalRound = rounds[rounds.length - 1];
  const finalCenterY = getNodeCenterY(finalRound.round, 0);
  const championX = getColumnX(finalRound.round) + NODE_WIDTH + CHAMPION_GAP;
  const champion = view.championId ? playerMap.get(view.championId) : undefined;
  const gameTypes = rounds
    .map(round => formatGameType(group.roundGameTypes?.[round.round - 1] ?? group.gameType))
    .filter((value, index, list) => list.indexOf(value) === index);
  const completed = group.status === 'completed' || Boolean(view.championId);
  const today = new Date();
  const dateLabel = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`;

  // html2canvas 会把带 text-overflow: ellipsis 的文字裁掉下半截，
  // 所以导出图里改为按字符数确定性截断，不再依赖 CSS 省略号。
  const truncateLabel = (text: string, maxChars: number): string => {
    const chars = Array.from(text);
    return chars.length > maxChars ? `${chars.slice(0, maxChars).join('')}…` : text;
  };

  const displayName = (playerId: string | null): string => {
    if (!playerId) return isEnglish ? 'TBD' : '待定';
    const player = playerMap.get(playerId);
    return player ? player.name : isEnglish ? 'Unknown' : '未知';
  };

  const playerMeta = (playerId: string | null): string => {
    if (!playerId) return '';
    const player = playerMap.get(playerId);
    if (!player) return '';
    const code = player.participantCode?.trim();
    if (code) return code;
    const uid = player.profile?.uid?.trim();
    return uid ? `UID ${uid}` : '';
  };

  const isWinner = (match: TournamentGroup['matches'][number] | undefined, playerId: string | null): boolean => {
    if (!match || !playerId || match.result === 'pending') return false;
    if (match.isBye) return match.player1Id === playerId;
    return (match.result === 'player1' && match.player1Id === playerId)
      || (match.result === 'player2' && match.player2Id === playerId);
  };

  const renderRow = (node: RoundColumn['nodes'][number], playerId: string | null, score: number | undefined, side: 1 | 2) => {
    const winner = isWinner(node.match, playerId);
    const isPending = !node.match || node.match.result === 'pending';
    // 用绝对定位排三列，而不是 flex：html2canvas 对 flex 行的文字测量不稳定，
    // 导出时会按错误的行高裁剪中文字形（上半截可见、下半截丢失）。
    return (
      <div
        key={`${node.id}-${side}`}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: side === 1 ? 0 : MATCH_NODE_HEIGHT / 2,
          height: MATCH_NODE_HEIGHT / 2,
          background: winner ? COLORS.winnerRow : 'transparent',
          borderLeft: winner ? `2px solid ${COLORS.winnerBorder}` : '2px solid transparent',
        }}
      >
        <span
          style={{
            position: 'absolute',
            left: 12,
            top: 18,
            width: 40,
            fontSize: 10,
            letterSpacing: '0.04em',
            color: COLORS.faint,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          }}
        >
          {playerMeta(playerId)}
        </span>
          <span
          style={{
            position: 'absolute',
            left: 62,
            right: 34,
            top: 14,
            whiteSpace: 'nowrap',
            fontSize: 14,
            lineHeight: '21px',
            fontWeight: winner ? 700 : 500,
            color: isPending ? COLORS.muted : winner ? COLORS.winnerText : COLORS.text,
          }}
        >
          {truncateLabel(displayName(playerId), 10)}
        </span>
        <span
          style={{
            position: 'absolute',
            right: 12,
            top: 14,
            fontSize: 13,
            lineHeight: '21px',
            fontWeight: 600,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            color: winner ? COLORS.winnerText : COLORS.muted,
          }}
        >
          {!isPending && score !== undefined ? score : ''}
        </span>
      </div>
    );
  };

  return (
    <div
      style={{
        position: 'relative',
        boxSizing: 'content-box',
        width: totalWidth,
        padding: '26px 28px 22px',
        background: COLORS.paper,
        color: COLORS.text,
        fontFamily: '"Inter", "Noto Sans SC", system-ui, -apple-system, "Segoe UI", sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24 }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: '0.32em', color: COLORS.muted }}>
            MATCH STATISTIC · {isEnglish ? 'SINGLE ELIMINATION' : '单败淘汰'}
          </div>
          <div style={{ marginTop: 8, fontSize: 26, fontWeight: 800, letterSpacing: '0.02em' }}>
            {group.name} · {isEnglish ? 'Bracket' : '淘汰签表'}
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: COLORS.muted }}>
            {bracketSize} {isEnglish ? 'players' : '强'} · {rounds.length} {isEnglish ? 'rounds' : '轮'}
            {gameTypes.length > 0 ? ` · ${gameTypes.join(' / ')}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, paddingTop: 6, fontSize: 11, color: COLORS.muted }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 18, height: 2, background: COLORS.upper, borderRadius: 2 }} />
            {isEnglish ? 'Upper half' : '上半区'}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 18, height: 2, background: COLORS.lower, borderRadius: 2 }} />
            {isEnglish ? 'Lower half' : '下半区'}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 18, height: 2, background: COLORS.neutral, borderRadius: 2 }} />
            {isEnglish ? 'Final' : '决赛'}
          </span>
        </div>
      </div>

      <div style={{ position: 'relative', marginTop: 22 }}>
        <div style={{ position: 'relative', height: HEADER_HEIGHT }}>
          {rounds.map(round => (
            <div
              key={`label-${round.round}`}
              style={{
                position: 'absolute',
                left: getColumnX(round.round),
                top: 0,
                width: NODE_WIDTH,
                fontSize: 12,
                letterSpacing: '0.12em',
                color: COLORS.muted,
              }}
            >
              {roundLabel(round.round, bracketSize, isEnglish)}
            </div>
          ))}
          {rounds.length > 0 && (
            <div
              style={{
                position: 'absolute',
                left: championX,
                top: 0,
                width: CHAMPION_WIDTH,
                fontSize: 12,
                letterSpacing: '0.12em',
                color: COLORS.muted,
              }}
            >
              {isEnglish ? 'Champion' : '冠军'}
            </div>
          )}
        </div>

        <div style={{ position: 'relative', height: bodyHeight, marginTop: BODY_GAP }}>
          <svg
            aria-hidden="true"
            style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}
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
                const color = branchColor(round.round, node.matchIndex, bracketSize);
                return [
                  <path
                    key={`${node.id}-a`}
                    d={`M ${childX} ${firstChildY} H ${connectorX} V ${parentY}`}
                    fill="none"
                    stroke={color}
                    strokeWidth={1.6}
                    strokeOpacity={0.8}
                  />,
                  <path
                    key={`${node.id}-b`}
                    d={`M ${childX} ${secondChildY} H ${connectorX} V ${parentY}`}
                    fill="none"
                    stroke={color}
                    strokeWidth={1.6}
                    strokeOpacity={0.8}
                  />,
                  <path
                    key={`${node.id}-c`}
                    d={`M ${connectorX} ${parentY} H ${parentX}`}
                    fill="none"
                    stroke={color}
                    strokeWidth={1.6}
                    strokeOpacity={0.8}
                  />,
                ];
              })
            )}
            {rounds.length > 0 && (
              <path
                d={`M ${getColumnX(finalRound.round) + NODE_WIDTH} ${finalCenterY} H ${championX}`}
                fill="none"
                stroke={COLORS.championBorder}
                strokeWidth={1.8}
              />
            )}
          </svg>

          {rounds.flatMap(round =>
            round.nodes.map(node => (
              <div
                key={node.id}
                data-bracket-round={round.round}
                style={{
                  position: 'absolute',
                  left: getColumnX(round.round),
                  top: getNodeTop(round.round, node.matchIndex, MATCH_NODE_HEIGHT),
                  width: NODE_WIDTH,
                  height: MATCH_NODE_HEIGHT,
                  borderRadius: 10,
                  border: `1px solid ${COLORS.cardBorder}`,
                  background: COLORS.card,
                  boxShadow: `0 6px 18px ${COLORS.cardShadow}`,
                  overflow: 'hidden',
                }}
              >
                {renderRow(node, node.player1Id, node.match?.player1Games, 1)}
                <div style={{ position: 'absolute', top: MATCH_NODE_HEIGHT / 2, left: 0, right: 0, height: 1, background: COLORS.cardBorder, opacity: 0.7 }} />
                {renderRow(node, node.player2Id, node.match?.player2Games, 2)}
              </div>
            ))
          )}

          {rounds.length > 0 && (
            <div
              style={{
                position: 'absolute',
                left: championX,
                top: finalCenterY - CHAMPION_NODE_HEIGHT / 2,
                width: CHAMPION_WIDTH,
                height: CHAMPION_NODE_HEIGHT,
                borderRadius: 14,
                background: COLORS.championFill,
                border: `1px solid ${COLORS.championBorder}`,
                boxShadow: `0 10px 24px ${COLORS.cardShadow}`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <div style={{ fontSize: 11, letterSpacing: '0.24em', color: COLORS.championLabel }}>
                {isEnglish ? 'CHAMPION' : '冠军'}
              </div>
              <div
                style={{
                  maxWidth: CHAMPION_WIDTH - 24,
                  whiteSpace: 'nowrap',
                  fontSize: 20,
                  fontWeight: 800,
                  color: COLORS.championName,
                }}
              >
                {champion ? truncateLabel(getPlayerDisplayName(champion), 8) : isEnglish ? 'TBD' : '待定'}
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 26, display: 'flex', justifyContent: 'space-between', fontSize: 10, letterSpacing: '0.14em', color: COLORS.faint }}>
        <span>MATCH STATISTIC</span>
        <span>
          {isEnglish ? 'Data as of ' : '数据截至 '}
          {dateLabel}
          {completed ? '' : isEnglish ? ' · in progress' : ' · 进行中'}
        </span>
      </div>
    </div>
  );
}
