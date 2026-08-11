import { useState, useEffect } from 'react';
import { X, Download, FileSpreadsheet, Trophy, Swords, Users, Calendar, Layers, AlertTriangle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useTournamentStore, useCurrentGroup } from '../store/useTournamentStore';
import { getRankingTableData, getMatchTableData, exportAllGroupsRankingToExcel, exportAllGroupsCurrentRoundMatchesToExcel, exportAllGroupsToExcel, exportGroupSummaryToExcel } from '../utils/excelExport';
import { useEscapeClose } from '../hooks/useEscapeClose';
import type { TournamentGroup } from '../types';

type ExportType = 'ranking' | 'match' | 'summary';

interface ExcelExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialType?: ExportType;
}

export function ExcelExportModal({ isOpen, onClose, initialType = 'ranking' }: ExcelExportModalProps) {
  const [activeType, setActiveType] = useState<ExportType>(initialType);
  const [exportAllGroups, setExportAllGroups] = useState(false);
  const currentGroup = useCurrentGroup();
  const { competition, viewRound, setViewRound } = useTournamentStore();

  useEscapeClose(isOpen, onClose);

  useEffect(() => {
    if (isOpen) {
      setActiveType(initialType);
      setExportAllGroups(false);
    }
  }, [isOpen, initialType]);

  if (!isOpen) return null;

  const allGroups = competition.groups;
  const hasMultipleGroups = allGroups.length > 1;
  const availableGroups = allGroups.filter(g => g.currentRound > 0);
  const hasAvailableGroups = availableGroups.length > 1;

  // 判断指定小组本轮是否全部完赛（无 pending 对局）
  const isGroupRoundComplete = (g: TournamentGroup): boolean => {
    if (g.currentRound === 0) return false;
    const ms = g.matches.filter(m => m.round === g.currentRound);
    return ms.length > 0 && ms.every(m => m.result !== 'pending');
  };
  const currentGroupRoundComplete = isGroupRoundComplete(currentGroup);
  const allAvailableGroupsRoundComplete = availableGroups.every(isGroupRoundComplete);
  // 排行榜/总表导出条件：单小组需本轮完赛；全部小组需每个有进度的小组本轮都完赛
  const canExportRanking = exportAllGroups ? allAvailableGroupsRoundComplete : currentGroupRoundComplete;
  const rankingBlockedReason = !canExportRanking
    ? (exportAllGroups
        ? '部分小组本轮对局尚未全部结束，暂时无法导出"所有小组排行榜/总表"，请等待所有小组本轮完赛后再导出'
        : '本小组本轮对局尚未全部结束，暂时无法导出排行榜/总表，请等待本轮完赛后再导出')
    : '';

  const currentPreviewIdx = allGroups.findIndex(g => g === currentGroup);

  const handlePreviewGroup = (idx: number) => {
    if (exportAllGroups) setExportAllGroups(false);
    useTournamentStore.getState().setCurrentGroup(idx);
  };

  // 生成预览数据
  const previewGroup = currentGroup;
  const isRanking = activeType === 'ranking';
  const isSummary = activeType === 'summary';

  // 总表预览：显示排行榜 + 各轮对阵概览
  const tableData = isRanking
    ? getRankingTableData(previewGroup)
    : isSummary
      ? getRankingTableData(previewGroup)
      : getMatchTableData(previewGroup, viewRound);

  const handleDownload = () => {
    if (isSummary) {
      if (exportAllGroups) {
        exportAllGroupsToExcel(availableGroups, competition.name);
      } else {
        exportGroupSummaryToExcel(previewGroup, competition.name);
      }
      return;
    }

    if (exportAllGroups) {
      if (isRanking) {
        exportAllGroupsRankingToExcel(availableGroups, competition.name);
      } else {
        exportAllGroupsCurrentRoundMatchesToExcel(availableGroups, competition.name);
      }
    } else {
      const { headers, rows } = isRanking
        ? getRankingTableData(previewGroup)
        : getMatchTableData(previewGroup, viewRound);
      const data: (string | number)[][] = [headers, ...rows];
      const ws = XLSX.utils.aoa_to_sheet(data);
      const wb = XLSX.utils.book_new();
      const sheetName = isRanking ? '排行榜' : `第${viewRound}轮`;
      const fileName = isRanking
        ? `${competition.name}-${previewGroup.name}-排行榜.xlsx`
        : `${competition.name}-${previewGroup.name}-第${viewRound}轮对阵表.xlsx`;
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      XLSX.writeFile(wb, fileName);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-5xl max-h-[90vh] bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            导出 Excel
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
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
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
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800'
              }`}
            >
              <Swords className="w-4 h-4" />
              对阵表
            </button>
            <button
              onClick={() => setActiveType('summary')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeType === 'summary'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800'
              }`}
            >
              <Layers className="w-4 h-4" />
              总表
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
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
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
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800 border border-transparent'
                    }`}
                  >
                    {group.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeType === 'match' && !exportAllGroups && currentGroup.currentRound > 0 && !isSummary && (
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-500 shrink-0" />
              <div className="flex gap-1.5 flex-wrap">
                {Array.from({ length: currentGroup.currentRound }, (_, i) => i + 1).map(round => (
                  <button
                    key={round}
                    onClick={() => setViewRound(round)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                      viewRound === round
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
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
          {(isRanking || isSummary) && !canExportRanking && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-300/90 leading-relaxed">
                {rankingBlockedReason}
              </div>
            </div>
          )}
          {exportAllGroups ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Users className="w-12 h-12 text-emerald-400/50 mb-4" />
              <p className="text-slate-300 font-medium mb-2">将导出全部 {availableGroups.length} 个小组的{isRanking ? '排行榜' : isSummary ? '总表（排行榜+对阵）' : '本轮对阵表'}</p>
              <div className="max-w-md space-y-1.5 text-slate-500 text-sm">
                <p>· 所有小组的数据将汇总到一个 Excel 文件中</p>
                <p>· 每个小组的数据位于独立的 Sheet 工作表</p>
                {isSummary && <p>· 总表包含排行榜和各轮对阵，每个小组多个工作表</p>}
                {!isRanking && !isSummary && <p>· 对阵表将导出各小组当前轮次的比赛</p>}
                <p>· 共 {availableGroups.length} 个小组</p>
              </div>
            </div>
          ) : currentGroup.currentRound === 0 ? (
            <div className="text-center text-slate-500 py-20">暂无{isRanking ? '排行' : '对阵'}数据</div>
          ) : (
            <div className="flex justify-center">
              <div className="inline-block">
                <div className="mb-3 text-sm text-slate-400">
                  {previewGroup.name}
                  {isRanking && ' · 排行榜'}
                  {isSummary && ' · 总表（排行榜+全部对阵）'}
                  {!isRanking && !isSummary && ` · 第 ${viewRound} 轮`}
                </div>
                <table className="border-collapse bg-slate-800/60 rounded-lg overflow-hidden">
                  <thead>
                    <tr>
                      {tableData.headers.map((h, i) => (
                        <th
                          key={i}
                          className="px-4 py-2.5 text-left text-xs font-semibold text-slate-300 bg-slate-700/50 border-b border-slate-700 whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tableData.rows.length === 0 ? (
                      <tr>
                        <td colSpan={tableData.headers.length} className="px-4 py-8 text-center text-slate-500 text-sm">
                          暂无数据
                        </td>
                      </tr>
                    ) : (
                      tableData.rows.map((row, ri) => (
                        <tr key={ri} className="border-b border-slate-700/40 last:border-0">
                          {row.map((cell, ci) => (
                            <td
                              key={ci}
                              className={`px-4 py-2 text-sm text-slate-200 whitespace-nowrap ${
                                ci === 0 ? 'text-slate-400 font-medium' : ''
                              }`}
                            >
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
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
            disabled={(isRanking || isSummary) && !canExportRanking}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            {(isRanking || isSummary) && !canExportRanking ? '本轮未完赛，无法导出' : '下载 Excel'}
          </button>
        </div>
      </div>
    </div>
  );
}
