import type { TournamentGroup } from '../../types';
import {
  getEliminationBracketRounds,
  getEliminationBracketView,
  getVisibleBracketRounds,
} from '../../utils/elimination';

interface BracketImageViewProps {
  group: TournamentGroup;
  isEnglish: boolean;
}

const NODE_WIDTH = 404;
const COLUMN_GAP = 188;
const ROW_HEIGHT = 190;
const HEADER_HEIGHT = 42;
const BODY_GAP = 20;
const MATCH_NODE_HEIGHT = 140;
const CHAMPION_WIDTH = 300;
const CHAMPION_GAP = 80;
const CHAMPION_NODE_HEIGHT = 156;

// 导出图会压成一张图发到群里，屏幕上的低对比配色在小尺寸下糊成一片，
// 所以这里整体提亮：正文接近纯白，次要信息（编号/待定/页脚）也保持在可读灰阶。
const COLORS = {
  paper: '#080E1D',
  card: '#16203A',
  cardBorder: '#2E3F63',
  cardShadow: 'rgba(1, 4, 12, 0.6)',
  divider: 'rgba(86, 108, 150, 0.45)',
  winnerRow: 'rgba(52, 211, 153, 0.16)',
  winnerBorder: 'rgba(52, 211, 153, 0.75)',
  winnerText: '#7CF3C0',
  text: '#EEF3FB',
  muted: '#9DB0CE',
  faint: '#8296BA',
  upper: '#3FE0A6',
  lower: '#F7C142',
  neutral: '#8CA0C0',
  championFill: '#14523E',
  championBorder: '#2A9C74',
  championLabel: '#B4F5D8',
  championName: '#FFFFFF',
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

/**
 * 连接线配色：同一个节点覆盖的首轮签位整体落在上半区就是绿色、下半区就是金色，
 * 决赛（只剩一个节点）用中性灰。
 *
 * 旧实现用 round 反推「节点相对本轮的偏移」，从 1/4 决赛开始就判错，
 * 结果上半区整片是灰线、只有下半区有金色，和图例对不上。
 */
function branchColor(round: number, matchIndex: number, bracketSize: number): string {
  const nodeCount = bracketSize / 2 ** round;
  if (nodeCount <= 1) return COLORS.neutral;
  return matchIndex < nodeCount / 2 ? COLORS.upper : COLORS.lower;
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
  // 只有「实际会决出冠军」的单败赛段才显示冠军块：
  // 突围赛这类只打部分轮次（totalRounds 小于签表深度）的赛段不显示冠军，
  // 按实际轮数判断，而不是按当前进行到第几轮。
  const bracketDepth = getEliminationBracketRounds(bracket.size);
  const actualRounds = group.totalRounds || bracketDepth;
  const decidesChampion = actualRounds >= bracketDepth;
  const showChampion = Boolean(view.championId) || decidesChampion;
  const championWidth = showChampion ? CHAMPION_GAP + CHAMPION_WIDTH : 0;
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
    // 有结果就显示局分；没有局分但比赛已经结束的弃权场次用文字标注，
    // 否则那一列空着会让人以为「打完了却没有比分」。
    // 轮空场次没有真实局分（记录里的胜局数是按赛制补的），两边都留空更不容易误读。
    const scoreText = isPending || score === undefined || node.match?.isBye
      // 赛前弃赛是「输的一边没打」，只在负方那一行标注，胜方照样是空列。
      ? (!isPending && node.match?.preDrop && !winner ? (isEnglish ? 'W/O' : '弃权') : '')
      : String(score);
    // 轮空场次的空签位直接写「轮空」，比一个「待定」更能说明这里不会有人来。
    const nameLabel = !playerId && node.match?.isBye
      ? (isEnglish ? 'BYE' : '轮空')
      : displayName(playerId);
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
            left: 18,
            top: 24,
            width: 74,
            fontSize: 16,
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
            left: 100,
            right: 74,
            top: 18,
            whiteSpace: 'nowrap',
            fontSize: 24,
            lineHeight: '33px',
            // 只有真正还空着的签位才压暗；已经确定对阵的选手一律用正文色，
            // 否则整张图在群里缩到手机宽度就成了灰糊。
            fontWeight: winner ? 700 : 600,
            color: !playerId ? COLORS.muted : winner ? COLORS.winnerText : COLORS.text,
          }}
        >
          {truncateLabel(nameLabel, 9)}
        </span>
        <span
          style={{
            position: 'absolute',
            right: 20,
            top: 18,
            fontSize: scoreText.length > 2 ? 15 : 22,
            lineHeight: '33px',
            letterSpacing: scoreText.length > 2 ? '0.04em' : '0.02em',
            fontWeight: winner ? 800 : 600,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            color: winner ? COLORS.winnerText : COLORS.text,
            opacity: scoreText ? 1 : 0,
          }}
        >
          {scoreText}
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
        padding: '30px 34px 26px',
        background: COLORS.paper,
        color: COLORS.text,
        fontFamily: '"Inter", "Noto Sans SC", system-ui, -apple-system, "Segoe UI", sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 360px', minWidth: 0 }}>
          <div style={{ fontSize: 13, letterSpacing: '0.32em', color: COLORS.muted, whiteSpace: 'nowrap' }}>
            MATCH STATISTIC · {isEnglish ? 'SINGLE ELIMINATION' : '单败淘汰'}
          </div>
          <div style={{ marginTop: 10, fontSize: 34, fontWeight: 800, letterSpacing: '0.02em' }}>
            {group.name} · {isEnglish ? 'Bracket' : '淘汰签表'}
          </div>
          <div style={{ marginTop: 8, fontSize: 15, color: COLORS.muted }}>
            {bracketSize} {isEnglish ? 'players' : '强'} · {rounds.length} {isEnglish ? 'rounds' : '轮'}
            {gameTypes.length > 0 ? ` · ${gameTypes.join(' / ')}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingTop: 6, fontSize: 14, color: COLORS.muted, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
            <span style={{ width: 18, height: 2, background: COLORS.upper, borderRadius: 2 }} />
            {isEnglish ? 'Upper half' : '上半区'}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
            <span style={{ width: 18, height: 2, background: COLORS.lower, borderRadius: 2 }} />
            {isEnglish ? 'Lower half' : '下半区'}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
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
                fontSize: 18,
                fontWeight: 600,
                letterSpacing: '0.12em',
                color: COLORS.muted,
              }}
            >
              {roundLabel(round.round, bracketSize, isEnglish)}
            </div>
          ))}
          {showChampion && (
            <div
              style={{
                position: 'absolute',
                left: championX,
                top: 0,
                width: CHAMPION_WIDTH,
                fontSize: 18,
                fontWeight: 600,
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
                    strokeWidth={3}
                    strokeOpacity={1}
                    strokeLinejoin="round"
                  />,
                  <path
                    key={`${node.id}-b`}
                    d={`M ${childX} ${secondChildY} H ${connectorX} V ${parentY}`}
                    fill="none"
                    stroke={color}
                    strokeWidth={3}
                    strokeOpacity={1}
                    strokeLinejoin="round"
                  />,
                  <path
                    key={`${node.id}-c`}
                    d={`M ${connectorX} ${parentY} H ${parentX}`}
                    fill="none"
                    stroke={color}
                    strokeWidth={3}
                    strokeOpacity={1}
                    strokeLinejoin="round"
                  />,
                ];
              })
            )}
            {showChampion && (
              <path
                d={`M ${getColumnX(finalRound.round) + NODE_WIDTH} ${finalCenterY} H ${championX}`}
                fill="none"
                stroke={COLORS.championBorder}
                strokeWidth={3}
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
                  borderRadius: 12,
                  border: `2px solid ${COLORS.cardBorder}`,
                  background: COLORS.card,
                  boxShadow: `0 8px 22px ${COLORS.cardShadow}`,
                  overflow: 'hidden',
                }}
              >
                {renderRow(node, node.player1Id, node.match?.player1Games, 1)}
                <div style={{ position: 'absolute', top: MATCH_NODE_HEIGHT / 2, left: 0, right: 0, height: 1, background: COLORS.divider }} />
                {renderRow(node, node.player2Id, node.match?.player2Games, 2)}
              </div>
            ))
          )}

          {showChampion && (
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
              {champion && (
                <div style={{ fontSize: 14, letterSpacing: '0.24em', color: COLORS.championLabel }}>
                  {isEnglish ? 'CHAMPION' : '冠军'}
                </div>
              )}
              <div
                style={{
                  maxWidth: CHAMPION_WIDTH - 24,
                  whiteSpace: 'nowrap',
                  fontSize: 30,
                  fontWeight: 800,
                  color: COLORS.championName,
                }}
              >
                {champion ? truncateLabel(champion.name, 8) : isEnglish ? 'Champion' : '冠军'}
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 32, display: 'flex', justifyContent: 'space-between', fontSize: 13, letterSpacing: '0.14em', color: COLORS.faint }}>
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
