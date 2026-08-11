import { useState, useMemo } from 'react';
import { X, Users, Search, Copy, Check, AlertCircle } from 'lucide-react';
import { useTournamentStore } from '../store/useTournamentStore';
import { useEscapeClose } from '../hooks/useEscapeClose';

interface PlayerPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PlayerPreviewModal({ isOpen, onClose }: PlayerPreviewModalProps) {
  const { competition } = useTournamentStore();
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState(false);

  useEscapeClose(isOpen, onClose);

  const totalPlayers = useMemo(
    () => competition.groups.reduce((sum, g) => sum + g.players.length, 0),
    [competition.groups]
  );

  const filteredGroups = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return competition.groups;
    return competition.groups.map(g => ({
      ...g,
      players: g.players.filter(p => p.name.toLowerCase().includes(keyword)),
    })).filter(g => g.players.length > 0);
  }, [competition.groups, search]);

  const duplicateNames = useMemo(() => {
    const map = new Map<string, number>();
    for (const g of competition.groups) {
      for (const p of g.players) {
        const key = p.name.trim().toLowerCase();
        map.set(key, (map.get(key) || 0) + 1);
      }
    }
    return new Set(
      Array.from(map.entries()).filter(([, c]) => c > 1).map(([k]) => k)
    );
  }, [competition.groups]);

  const emptyGroups = useMemo(
    () => competition.groups.filter(g => g.players.length === 0).map(g => g.name),
    [competition.groups]
  );

  const handleCopyAll = async () => {
    const lines: string[] = [];
    for (const g of competition.groups) {
      lines.push(`【${g.name}】(${g.players.length}人)`);
      g.players.forEach((p, i) => lines.push(`${String(i + 1).padStart(3, '0')}. ${p.name}`));
      lines.push('');
    }
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  if (!isOpen) return null;

  const hasProgress = competition.groups.some(g => g.status !== 'setup');

  return (
    <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-sm z-50 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* 顶部栏 */}
        <div className="flex items-center justify-between mb-6 sticky top-0 bg-slate-900/80 backdrop-blur-sm py-3 -mx-6 px-6 z-10 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <Users className="w-6 h-6 text-gold-400" />
            <div>
              <h2 className="text-xl font-bold text-white">选手整体预览</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {competition.name} · 共 {competition.groups.length} 个小组 · {totalPlayers} 名选手
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyAll}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors text-sm border border-slate-700"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              {copied ? '已复制' : '复制全部'}
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 搜索 */}
        <div className="mb-4 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜索选手名称..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-gold-500/30"
          />
        </div>

        {/* 警告信息 */}
        {duplicateNames.size > 0 && (
          <div className="mb-4 px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-amber-300">
              <div className="font-medium mb-1">检测到重名选手（共 {duplicateNames.size} 个）</div>
              <div className="text-amber-400/80">
                {Array.from(duplicateNames).slice(0, 10).join('、')}
                {duplicateNames.size > 10 && ' 等'}
              </div>
            </div>
          </div>
        )}

        {emptyGroups.length > 0 && (
          <div className="mb-4 px-4 py-3 bg-rose-500/10 border border-rose-500/20 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-rose-300">
              <div className="font-medium mb-1">存在空小组</div>
              <div className="text-rose-400/80">{emptyGroups.join('、')}</div>
            </div>
          </div>
        )}

        {/* 小组选手网格 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredGroups.map(group => (
            <div
              key={group.id}
              className="bg-slate-800/40 border border-slate-700/50 rounded-xl overflow-hidden flex flex-col"
            >
              <div className="px-4 py-3 bg-slate-800/60 border-b border-slate-700/50 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white truncate">{group.name}</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  group.status === 'setup'
                    ? 'bg-slate-700/50 text-slate-400'
                    : group.status === 'in_progress'
                      ? 'bg-gold-500/15 text-gold-400'
                      : 'bg-emerald-500/15 text-emerald-400'
                }`}>
                  {group.players.length}人
                </span>
              </div>
              <div className="max-h-72 overflow-y-auto p-2">
                {group.players.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-600">暂无选手</div>
                ) : (
                  <ol className="space-y-0.5">
                    {group.players.map((player, idx) => {
                      const isDup = duplicateNames.has(player.name.trim().toLowerCase());
                      return (
                        <li
                          key={player.id}
                          className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-800/50 text-sm"
                        >
                          <span className="text-slate-500 font-mono text-xs w-8 text-right">
                            {String(idx + 1).padStart(2, '0')}.
                          </span>
                          <span className={`flex-1 truncate ${isDup ? 'text-amber-400 font-medium' : 'text-slate-300'}`}>
                            {player.name}
                          </span>
                          {isDup && (
                            <span className="text-[10px] text-amber-500/80 bg-amber-500/10 px-1.5 py-0.5 rounded">重名</span>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            </div>
          ))}
        </div>

        {filteredGroups.length === 0 && (
          <div className="py-12 text-center text-slate-500">
            <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">未找到匹配的选手</p>
          </div>
        )}

        {/* 底部提示 */}
        <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-500">
          <span>
            {hasProgress
              ? '部分小组已开始比赛，仅展示当前选手名单'
              : '比赛尚未开始，可在「选手管理」中修改选手名称'}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
