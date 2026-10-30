import { useState, useEffect, useRef } from 'react';
import { X, Download, Camera, Trophy, Swords, Users, Calendar, AlertTriangle, GitBranch } from 'lucide-react';
import { RankingImageView } from './RankingImageView';
import { FinalStandingsImageView } from './FinalStandingsImageView';
import { MatchImageView } from '../matches/MatchImageView';
import { EliminationBracketTree } from '../competition/EliminationBracketTree';
import { generateImage } from '../../utils/export/imageExport';
import { useTournamentStore, useCurrentGroup } from '../../store/useTournamentStore';
import { useEscapeClose } from '../../hooks/useEscapeClose';
import type { TournamentGroup } from '../../types';
import { useLanguagePreference } from '../../i18n/context';
import { formatText } from '../../i18n/data';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { isAbortError } from '../../utils/async';
import { getGroupDisplayName } from '../../utils/multiStage';
import { buildFinalStandings } from '../../utils/advancement';
import { clampPreviewRound, resolvePreviewGroup } from './exportPreviewState';

type ExportType = 'ranking' | 'match' | 'bracket' | 'standings';

/** 等两帧，确保本地预览状态已经渲染到 DOM 再截图（不切全局当前组）。 */
function waitForNextFrame(): Promise<void> {
  return new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

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
  const [exportProgress, setExportProgress] = useState(0);
  // 预览小组/轮次只改弹窗本地状态，不再切全局 currentGroupIndex/viewRound（P1-15）。
  // 初始值直接取当前全局组，避免首次渲染闪一下第 1 组。
  const [previewGroupIndex, setPreviewGroupIndex] = useState(
    () => useTournamentStore.getState().competition.currentGroupIndex,
  );
  const [previewRound, setPreviewRound] = useState(() => useTournamentStore.getState().viewRound);
  const currentGroup = useCurrentGroup();
  const { competition } = useTournamentStore();
  const { language, t } = useLanguagePreference();
  const dialogRef = useRef<HTMLDivElement>(null);
  const exportAbortRef = useRef<AbortController | null>(null);

  useEscapeClose(isOpen && !isGenerating, onClose);
  useFocusTrap(isOpen, dialogRef);

  useEffect(() => {
    if (isOpen) {
      const state = useTournamentStore.getState();
      const groups = state.competition.groups;
      const activeGroup = groups[state.competition.currentGroupIndex] ?? groups[0];
      setActiveType(initialType);
      setExportAllGroups(initialExportAll);
      setGeneratingGroupIdx(0);
      setExportProgress(0);
      setPreviewGroupIndex(Math.max(0, groups.findIndex(group => group.id === activeGroup.id)));
      setPreviewRound(clampPreviewRound(activeGroup, state.viewRound));
    }
  }, [isOpen, initialType, initialExportAll]);

  useEffect(() => () => exportAbortRef.current?.abort(), []);

  if (!isOpen) return null;

  const availableGroups = competition.groups.filter(g => g.currentRound > 0);
  const allGroups = competition.groups;
  const previewGroup = resolvePreviewGroup(allGroups, previewGroupIndex, currentGroup);
  const standings = buildFinalStandings(competition);
  const hasStandings = standings.length > 0;
  const hasMultipleGroups = allGroups.length > 1;
  const hasAvailableGroups = availableGroups.length > 1;

  const isGroupRoundComplete = (g: TournamentGroup): boolean => {
    if (g.currentRound === 0) return false;
    const ms = g.matches.filter(m => m.round === g.currentRound);
    return ms.length > 0 && ms.every(m => m.result !== 'pending');
  };
  const allAvailableGroupsRoundComplete = availableGroups.every(isGroupRoundComplete);
  const canExportRanking = exportAllGroups ? allAvailableGroupsRoundComplete : isGroupRoundComplete(previewGroup);
  const rankingBlockedReason = !canExportRanking
    ? (exportAllGroups ? t.blockedReasonAllImage : t.blockedReasonSingleImage)
    : '';

  const groupsToExport: TournamentGroup[] = exportAllGroups
    ? availableGroups
    : [previewGroup];

  const handlePreviewGroup = (idx: number) => {
    const targetGroup = allGroups[idx];
    if (!targetGroup) return;
    if (exportAllGroups) setExportAllGroups(false);
    setPreviewGroupIndex(idx);
    setPreviewRound(Math.max(1, targetGroup.currentRound));
  };

  const handleDownload = async () => {
    const controller = new AbortController();
    exportAbortRef.current = controller;
    setIsGenerating(true);
    setExportProgress(0);

    try {
      if (exportAllGroups) {
        if (activeType === 'standings') {
          await generateImage(
            'standings-image',
            `${competition.name}-${language === 'en' ? 'standings' : '最终名次'}`,
            { signal: controller.signal, onProgress: setExportProgress }
          );
          return;
        }
        for (let i = 0; i < groupsToExport.length; i++) {
          const targetGroup = groupsToExport[i];
          const targetRound = Math.max(1, targetGroup.currentRound);
          setGeneratingGroupIdx(i);
          // 只切弹窗本地预览状态，等目标组的图像渲染完成后再截图。
          setPreviewGroupIndex(Math.max(0, allGroups.indexOf(targetGroup)));
          if (activeType === 'match') setPreviewRound(targetRound);
          await waitForNextFrame();
          const elementId = activeType === 'ranking'
            ? 'ranking-image'
            : activeType === 'match'
              ? 'match-image'
              : 'bracket-image';
          const suffix = activeType === 'ranking'
            ? t.ranking
            : activeType === 'match'
              ? formatText(t.roundN, { round: targetRound })
              : (language === 'en' ? 'Bracket' : '淘汰签表');
          await generateImage(elementId, `${targetGroup.name}-${suffix}`, {
            signal: controller.signal,
            onProgress: percent => {
              setExportProgress(Math.round(((i + percent / 100) / groupsToExport.length) * 100));
            },
          });
        }
      } else {
        if (activeType === 'standings') {
          await generateImage(
            'standings-image',
            `${competition.name}-${language === 'en' ? 'standings' : '最终名次'}`,
            { signal: controller.signal, onProgress: setExportProgress }
          );
          return;
        }
        const elementId = activeType === 'ranking'
          ? 'ranking-image'
          : activeType === 'match'
            ? 'match-image'
            : 'bracket-image';
        const suffix = activeType === 'ranking'
          ? t.ranking
          : activeType === 'match'
            ? formatText(t.roundN, { round: previewRound })
            : (language === 'en' ? 'Bracket' : '淘汰签表');
        await generateImage(elementId, `${previewGroup.name}-${suffix}`, {
          signal: controller.signal,
          onProgress: setExportProgress,
        });
      }
    } catch (error) {
      if (!isAbortError(error)) {
        console.error('Image export failed:', error);
        alert(t.exportFailedAlert);
      }
    } finally {
      if (exportAbortRef.current === controller) {
        exportAbortRef.current = null;
        setIsGenerating(false);
        setExportProgress(0);
      }
    }
  };

  // 预览与截图统一渲染"预览组"；全部导出时只切本地预览状态，全局当前组保持不变（P1-15）。
  const captureView = (
    <div className="flex justify-center min-w-fit">
      {activeType === 'standings' ? (
        <FinalStandingsImageView />
      ) : activeType === 'ranking' ? (
        <RankingImageView group={previewGroup} />
      ) : activeType === 'match' ? (
        <MatchImageView group={previewGroup} viewRound={previewRound} />
      ) : (
        <div
          id="bracket-image"
          className="rounded-xl border border-slate-700/60 bg-slate-900 p-4"
        >
          <div className="mb-3 text-center text-sm font-semibold text-white">
            {previewGroup.name} · {language === 'en' ? 'Bracket' : '淘汰签表'}
          </div>
          {previewGroup.eliminationBracket ? (
            <EliminationBracketTree group={previewGroup} isEnglish={language === 'en'} />
          ) : (
            <div className="py-16 text-center text-sm text-slate-500">
              {language === 'en' ? 'This group has no fixed bracket.' : '该小组暂无固定签表。'}
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div ref={dialogRef} role="dialog" aria-modal="true" tabIndex={-1} className="relative w-full max-w-5xl max-h-[90vh] bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Camera className="w-5 h-5 text-gold-400" />
            {exportAllGroups ? t.imageExportAllTitle : t.imageExportTitle}
          </h3>
          <button
            onClick={onClose}
            disabled={isGenerating}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors disabled:opacity-40"
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
              {t.ranking}
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
              {t.matchTable}
            </button>
            <button
              onClick={() => setActiveType('bracket')}
              disabled={!previewGroup.eliminationBracket}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                activeType === 'bracket'
                  ? 'bg-gold-500/20 text-gold-400 border border-gold-500/30'
                  : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800'
              }`}
            >
              <GitBranch className="w-4 h-4" />
              {language === 'en' ? 'Bracket' : '淘汰签表'}
            </button>
            {hasStandings && (
              <button
                onClick={() => setActiveType('standings')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeType === 'standings'
                    ? 'bg-gold-500/20 text-gold-400 border border-gold-500/30'
                    : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800'
                }`}
              >
                <Trophy className="w-4 h-4" />
                {language === 'en' ? 'Final standings' : '最终名次'}
              </button>
            )}
          </div>

          {hasMultipleGroups && activeType !== 'standings' && (
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
                  {t.allGroups}
                </button>
                {allGroups.map((group, idx) => (
                  <button
                    key={group.id}
                    onClick={() => handlePreviewGroup(idx)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                      !exportAllGroups && idx === previewGroupIndex
                        ? 'bg-gold-500/20 text-gold-400 border border-gold-500/30'
                        : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800 border border-transparent'
                    }`}
                  >
                    {getGroupDisplayName(competition, group)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeType === 'match' && !exportAllGroups && previewGroup.currentRound > 0 && (
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-500 shrink-0" />
              <div className="flex gap-1.5 flex-wrap">
                {Array.from({ length: previewGroup.currentRound }, (_, i) => i + 1).map(round => (
                  <button
                    key={round}
                    onClick={() => setPreviewRound(round)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                      previewRound === round
                        ? 'bg-gold-500/20 text-gold-400 border border-gold-500/30'
                        : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800 border border-transparent'
                    }`}
                  >
                    {formatText(t.roundN, { round })}
                    {round === previewGroup.currentRound && (
                      <span className="ml-1 text-[10px] text-emerald-400">{t.current}</span>
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
          {isGenerating ? (
            captureView
          ) : exportAllGroups ? (
            activeType === 'standings' ? (
              <div className="flex justify-center min-w-fit">
                <FinalStandingsImageView />
              </div>
            ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Users className="w-12 h-12 text-gold-400/50 mb-4" />
              <p className="text-slate-300 font-medium mb-2">
                {activeType === 'ranking'
                  ? formatText(t.exportAllGroupsRankingInfo, { count: availableGroups.length })
                  : activeType === 'match'
                    ? formatText(t.exportAllGroupsMatchInfo, { count: availableGroups.length })
                    : (language === 'en'
                        ? `Will export brackets for all ${availableGroups.length} single-elimination groups`
                        : `将导出全部 ${availableGroups.length} 个单败淘汰小组的签表`)}
              </p>
              <div className="max-w-md space-y-1.5 text-slate-500 text-sm">
                <p>· {t.exportAllGroupsTip1}</p>
                {activeType === 'match' && <p>· {t.exportAllGroupsTip3Match}</p>}
                <p>· {formatText(t.exportAllGroupsTip4, { count: availableGroups.length })}</p>
              </div>
            </div>
            )
          ) : (
            captureView
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-700">
          {isGenerating && (
            <div className="mr-auto flex items-center gap-2" role="status" aria-live="polite">
              <div className="h-1.5 w-32 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-gold-500 transition-[width] duration-200"
                  style={{ width: `${Math.max(4, exportProgress)}%` }}
                />
              </div>
              <span className="min-w-8 text-xs tabular-nums text-slate-400">{exportProgress}%</span>
            </div>
          )}
          <button
            onClick={isGenerating ? () => exportAbortRef.current?.abort() : onClose}
            className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            {isGenerating ? t.cancelExport : t.cancel}
          </button>
          <button
            onClick={handleDownload}
            disabled={isGenerating || (activeType === 'ranking' && !canExportRanking)}
            className="flex items-center gap-2 px-5 py-2 rounded-lg btn-primary text-sm disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {isGenerating
              ? formatText(t.generating, { current: generatingGroupIdx + 1, total: groupsToExport.length })
              : (activeType === 'ranking' && !canExportRanking)
                ? t.roundNotFinished
                : exportAllGroups
                ? formatText(t.downloadAllImages, { count: groupsToExport.length })
                : t.downloadImage}
          </button>
        </div>
      </div>
    </div>
  );
}
