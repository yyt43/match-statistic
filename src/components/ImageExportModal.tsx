import { useState, useEffect } from 'react';
import { X, Download, Camera, Trophy, Swords, Users, Calendar, AlertTriangle } from 'lucide-react';
import { RankingImageView } from './RankingImageView';
import { MatchImageView } from './MatchImageView';
import { generateImage } from '../utils/imageExport';
import { useTournamentStore, useCurrentGroup } from '../store/useTournamentStore';
import { useEscapeClose } from '../hooks/useEscapeClose';
import type { TournamentGroup } from '../types';

type ExportType = 'ranking' | 'match';

interface ImageExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialType?: ExportType;
  exportAllGroups?: boolean;
}

export function ImageExportModal({ isOpen, onClose, initialType = 'ranking', exportAllGroups: initialExportAll = false }: ImageExportModalProps) {
  const [activeType, setActiveType] = useState<ExportType>(initialType);
  const [exportAllGroups, setExportAllGroups] = useState(initialExportAll);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingGroupIdx, setGeneratingGroupIdx] = useState(0);
  const currentGroup = useCurrentGroup();
  const { competition, viewRound, setViewRound } = useTournamentStore();

  // 图片生成中禁用 ESC 关闭，避免中断流程
  useEscapeClose(isOpen && !isGenerating, onClose);

  useEffect(() => {
    if (isOpen) {
      setActiveType(initialType);
      setExportAllGroups(initialExportAll);
      setGeneratingGroupIdx(0);
    }
  }, [isOpen, initialType, initialExportAll]);

  if (!isOpen) return null;

  // 所有有对阵数据的小组（用于"导出全部"）
  const availableGroups = competition.groups.filter(g => g.currentRound > 0);
  // 所有小组（用于预览切换）
  const allGroups = competition.groups;
  const hasMultipleGroups = allGroups.length > 1;
  const hasAvailableGroups = availableGroups.length > 1;

  // 判断指定小组本轮是否全部完赛（无 pending 对局）
  const isGroupRoundComplete = (g: TournamentGroup): boolean => {
    if (g.currentRound === 0) return false;
    const ms = g.matches.filter(m => m.round === g.currentRound);
    return ms.length > 0 && ms.every(m => m.result !== 'pending');
  };
  const currentGroupRoundComplete = isGroupRoundComplete(currentGroup);
  const allAvailableGroupsRoundComplete = availableGroups.every(isGroupRoundComplete);
  // 排行榜导出条件：单小组需本轮完赛；全部小组需每个有进度的小组本轮都完赛
  const canExportRanking = exportAllGroups ? allAvailableGroupsRoundComplete : currentGroupRoundComplete;
  const rankingBlockedReason = !canExportRanking
    ? (exportAllGroups
        ? '部分小组本轮对局尚未全部结束，暂时无法导出"所有小组排行榜"，请等待所有小组本轮完赛后再导出'
        : '本小组本轮对局尚未全部结束，暂时无法导出排行榜，请等待本轮完赛后再导出')
    : '';

  const groupsToExport: TournamentGroup[] = exportAllGroups
    ? availableGroups
    : [currentGroup];

  // 当前预览小组在 allGroups 中的索引
  const currentPreviewIdx = allGroups.findIndex(g => g === currentGroup);

  const handlePreviewGroup = (idx: number) => {
    const targetGroup = allGroups[idx];
    if (!targetGroup) return;
    // 切换到具体小组时自动退出"全部"模式
    if (exportAllGroups) setExportAllGroups(false);
    useTournamentStore.getState().setCurrentGroup(idx);
  };

  const handleDownload = async () => {
    setIsGenerating(true);
    try {
      if (exportAllGroups) {
        // 逐个小组生成图片
        for (let i = 0; i < groupsToExport.length; i++) {
          setGeneratingGroupIdx(i);
          // 切换到对应小组
          const groupIdx = competition.groups.indexOf(groupsToExport[i]);
          useTournamentStore.getState().setCurrentGroup(groupIdx);
          // 等待渲染
          await new Promise(resolve => setTimeout(resolve, 300));
          const elementId = activeType === 'ranking' ? 'ranking-image' : 'match-image';
          const groupViewRound = useTournamentStore.getState().viewRound;
          const fileName = activeType === 'ranking'
            ? `${groupsToExport[i].name}-排行榜`
            : `${groupsToExport[i].name}-第${groupViewRound}轮对阵表`;
          await generateImage(elementId, fileName);
        }
      } else {
        const elementId = activeType === 'ranking' ? 'ranking-image' : 'match-image';
        const fileName = activeType === 'ranking'
          ? `${currentGroup.name}-排行榜`
          : `${currentGroup.name}-第${viewRound}轮对阵表`;
        await generateImage(elementId, fileName);
      }
    } catch (error) {
      console.error('生成图片失败:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-5xl max-h-[90vh] bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Camera className="w-5 h-5 text-gold-400" />
            {exportAllGroups ? '导出所有小组图片' : '导出图片'}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-slate-700 space-y-3">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveType('ranking')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeType === 'ranking'
                  ? 'bg-gold-500/20 text-gold-400 border border-gold-500/30'
                  : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800'
              }`}
            >
              <Trophy className="w-4 h-4" />
              排行榜
            </button>
            <button
              onClick={() => setActiveType('match')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeType === 'match'
                  ? 'bg-gold-500/20 text-gold-400 border border-gold-500/30'
                  : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800'
              }`}
            >
              <Swords className="w-4 h-4" />
              对阵表
            </button>
          </div>

          {hasMultipleGroups && (
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-500 shrink-0" />
              <div className="flex gap-1.5 flex-wrap">
                <button
                  onClick={() => setExportAllGroups(true)}
                  disabled={!hasAvailableGroups}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                    exportAllGroups
                      ? 'bg-gold-500/20 text-gold-400 border border-gold-500/30'
                      : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800 border border-transparent'
                  }`}
                >
                  全部小组
                </button>
                {allGroups.map((group, idx) => (
                  <button
                    key={group.id}
                    onClick={() => handlePreviewGroup(idx)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                      !exportAllGroups && idx === currentPreviewIdx
                        ? 'bg-gold-500/20 text-gold-400 border border-gold-500/30'
                        : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800 border border-transparent'
                    }`}
                  >
                    {group.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeType === 'match' && !exportAllGroups && currentGroup.currentRound > 0 && (
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-500 shrink-0" />
              <div className="flex gap-1.5 flex-wrap">
                {Array.from({ length: currentGroup.currentRound }, (_, i) => i + 1).map(round => (
                  <button
                    key={round}
                    onClick={() => setViewRound(round)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                      viewRound === round
                        ? 'bg-gold-500/20 text-gold-400 border border-gold-500/30'
                        : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800 border border-transparent'
                    }`}
                  >
                    第{round}轮
                    {round === currentGroup.currentRound && (
                      <span className="ml-1 text-[10px] text-emerald-400">当前</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto p-5 bg-slate-950/50">
          {activeType === 'ranking' && !canExportRanking && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-300/90 leading-relaxed">
                {rankingBlockedReason}
              </div>
            </div>
          )}
          {exportAllGroups ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Users className="w-12 h-12 text-gold-400/50 mb-4" />
              <p className="text-slate-300 font-medium mb-2">将导出全部 {availableGroups.length} 个小组的{activeType === 'ranking' ? '排行榜' : '对阵表'}图片</p>
              <div className="max-w-md space-y-1.5 text-slate-500 text-sm">
                <p>· 点击"下载"按钮后，系统将逐个切换小组并生成图片</p>
                <p>· 每张图片会以"小组名-{activeType === 'ranking' ? '排行榜' : '第X轮对阵表'}"命名并保存</p>
                {activeType === 'match' && <p>· 对阵表将导出各小组当前轮次的比赛</p>}
                <p>· 共 {availableGroups.length} 个小组，请耐心等待生成完成</p>
              </div>
            </div>
          ) : (
            <div className="flex justify-center min-w-fit">
              {activeType === 'ranking' ? <RankingImageView /> : <MatchImageView />}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-700">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleDownload}
            disabled={isGenerating || (activeType === 'ranking' && !canExportRanking)}
            className="flex items-center gap-2 px-5 py-2 rounded-lg btn-primary text-sm disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {isGenerating
              ? `生成中... (${generatingGroupIdx + 1}/${groupsToExport.length})`
              : (activeType === 'ranking' && !canExportRanking)
                ? '本轮未完赛，无法导出'
                : exportAllGroups
                ? `下载全部小组图片 (${groupsToExport.length}个)`
                : '下载图片'}
          </button>
        </div>
      </div>
    </div>
  );
}
