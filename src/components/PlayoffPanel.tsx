import { useMemo, useState } from 'react';
import { useCurrentGroup, useTournamentStore } from '../store/useTournamentStore';
import { detectTieGroups, getRankedPlayers } from '../utils/swissPairing';
import { formatLabels, getPlayoffOrder, type ThreePlayerFormats } from '../utils/playoffs';
import { ConfirmDialog } from './ConfirmDialog';

export function PlayoffPanel() {
  const group = useCurrentGroup();
  const { generatePlayoff, resetPlayoffs, setViewRound } = useTournamentStore();
  const [formats, setFormats] = useState<ThreePlayerFormats>({});
  const [error, setError] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  const ties = useMemo(() => detectTieGroups(group.players, group.gameType), [group.players, group.gameType]);
  const ranked = getRankedPlayers(group.players.filter(p => !p.dropped && !p.eliminated), group.gameType, group.pairingType);
  const name = (id: string) => group.players.find(p => p.id === id)?.name ?? id;
  const brackets = group.playoffBrackets ?? [];
  const hasMatches = group.matches.some(m => m.isPlayoff);
  const legacy = hasMatches && !brackets.length;
  const ready = brackets.some(b => b.format !== 'two' && !group.matches.some(m => m.playoffBracketId === b.id && m.playoffStage === 2)
    && group.matches.filter(m => m.playoffBracketId === b.id && m.playoffStage === 1).every(m => m.result === 'player1' || m.result === 'player2'));
  const defaultFormat = (id: string): 'three_one' | 'three_two' => ranked.findIndex(p => p.id === id) === 2 ? 'three_two' : 'three_one';
  const advance = () => {
    setError('');
    try {
      const selected = Object.fromEntries(ties.filter(t => t.length === 3).map(t => [t[0].id, formats[t[0].id] ?? defaultFormat(t[0].id)]));
      generatePlayoff(selected);
    } catch (e) { setError(e instanceof Error ? e.message : '生成加赛失败'); }
  };
  return <div className="mt-3 text-left border-t border-slate-700/50 pt-3 space-y-3" aria-label="加赛管理">
    <p className="text-sm font-semibold text-amber-300">加赛管理 · {group.gameType.toUpperCase()}</p>
    <p className="text-xs text-slate-400">各同分组独立抽签，可与常规赛对手再次交手。等候选手不计胜场，加赛不改变常规小分。</p>
    {!hasMatches && ties.map(t => {
      const start = ranked.findIndex(p => p.id === t[0].id) + 1;
      return <div key={t[0].id} className="text-xs space-y-1.5">
        <p className="text-slate-200">第 {start}—{start + t.length - 1} 名：{t.map(p => p.name).join('、')}</p>
        {t.length === 3 ? <label className="block text-slate-400">三人加赛方式
          <select aria-label={`第${start}名同分组加赛方式`} value={formats[t[0].id] ?? defaultFormat(t[0].id)} onChange={e => setFormats({ ...formats, [t[0].id]: e.target.value as 'three_one' | 'three_two' })} className="block w-full mt-1 rounded bg-slate-800 text-slate-100 p-2">
            <option value="three_one">三进一：首场胜者对等候者</option>
            <option value="three_two">三进二：首场败者对等候者</option>
          </select>
        </label> : <p className="text-slate-400">{t.length === 2 ? '两人直接决胜' : t.length === 4 ? '四人名次赛：首轮后继续决出第1—4名' : '超过4人，请裁判另行确认规则'}</p>}
      </div>;
    })}
    {!hasMatches && ties.length === 0 && <p className="text-xs text-slate-400">当前没有需要加赛的同分组。</p>}
    {brackets.map(b => {
      const order = getPlayoffOrder(b, group.matches);
      const stage2 = group.matches.some(m => m.playoffBracketId === b.id && m.playoffStage === 2);
      return <div key={b.id} className="text-xs space-y-1.5">
        <p className="text-slate-200">第 {b.startRank}—{b.startRank + b.playerIds.length - 1} 名 · {formatLabels[b.format]}</p>
        <p className="text-slate-400">{b.playerIds.map(name).join('、')}</p>
        {b.waitingPlayerId && !stage2 && !order && <p className="text-amber-200">{name(b.waitingPlayerId)} 等候第二场（不记轮空胜）</p>}
        {order ? <p className="text-emerald-300">已决出：{order.map((id, i) => `第${b.startRank + i}名 ${name(id)}`).join('；')}</p>
          : <p className="text-amber-300">{stage2 ? '第二阶段待完成' : '第一阶段；录入赛果后可继续生成下一阶段'}</p>}
      </div>;
    })}
    {legacy && <p role="alert" className="text-xs text-amber-300">旧版加赛没有完整赛程信息。请先导出备份，再清除旧加赛、按新规则重新抽签。</p>}
    {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
    <div className="flex flex-wrap gap-2">
      {!legacy && <button disabled={hasMatches ? !ready : ties.length === 0} onClick={advance} className="px-3 py-2 text-xs rounded bg-amber-500/20 text-amber-200 disabled:opacity-40">{hasMatches ? '生成下一阶段加赛' : '抽签生成加赛'}</button>}
      {hasMatches && <button onClick={() => setViewRound(0)} className="px-3 py-2 text-xs rounded bg-slate-700 text-slate-200">查看加赛对阵</button>}
      {hasMatches && <button onClick={() => setResetOpen(true)} className="px-3 py-2 text-xs rounded text-rose-300 border border-rose-500/30">清除加赛</button>}
    </div>
    <ConfirmDialog isOpen={resetOpen} onClose={() => setResetOpen(false)} onConfirm={() => { resetPlayoffs(); setError(''); }} title="清除加赛" message="将清除本组全部加赛对阵、赛果及加赛名次，常规比赛成绩保留。再次生成时会重新抽签。" />
  </div>;
}
