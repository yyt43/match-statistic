import {
  Check,
  Clipboard,
  FileSpreadsheet,
  Image as ImageIcon,
  ShieldAlert,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLanguagePreference } from '../../i18n/context';
import { useTournamentStore } from '../../store/useTournamentStore';
import type { EvidenceVerificationStatus } from '../../types';
import {
  generateRoundAnnouncement,
  parseMatchResultsWorkbook,
  type MatchImportContext,
  type MatchImportPreview,
} from '../../utils/import/matchResultImport';
import { getRoundGameType } from '../../utils/swissPairing';
import { writeExcelWorkbook } from '../../utils/export/excelWorkbook';

interface MatchResultImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function fileNameFromRef(value: string): string {
  return value.split(/[\\/]/).pop()?.trim().toLowerCase() ?? '';
}

function sanitizeEvidenceUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, window.location.href);
    if (url.protocol !== 'blob:' || url.origin !== window.location.origin) {
      return undefined;
    }
    return url.href;
  } catch {
    return undefined;
  }
}

export function MatchResultImportModal({ isOpen, onClose }: MatchResultImportModalProps) {
  const { language } = useLanguagePreference();
  const isEnglish = language === 'en';
  const {
    competition,
    applyImportedMatchResults,
    markResultDisputed,
    announceRoundResults,
    finalizeDefaultConfirmations,
  } = useTournamentStore();
  const [phase, setPhase] = useState<MatchImportContext['phase']>('group');
  const [groupIndex, setGroupIndex] = useState(competition.currentGroupIndex);
  const [round, setRound] = useState(
    Math.max(1, competition.groups[competition.currentGroupIndex]?.currentRound ?? 1)
  );
  const [preview, setPreview] = useState<MatchImportPreview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [verification, setVerification] = useState<Record<number, EvidenceVerificationStatus>>({});
  const [evidenceUrls, setEvidenceUrls] = useState<Record<string, string>>({});
  const [announcement, setAnnouncement] = useState('');
  const [lastApplied, setLastApplied] = useState<Array<{ matchId: string; label: string }>>([]);
  const workbookInputRef = useRef<HTMLInputElement>(null);
  const evidenceInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setGroupIndex(competition.currentGroupIndex);
    setRound(Math.max(1, competition.groups[competition.currentGroupIndex]?.currentRound ?? 1));
  }, [competition.currentGroupIndex, competition.groups, isOpen]);

  useEffect(() => () => {
    Object.values(evidenceUrls).forEach(url => URL.revokeObjectURL(url));
  }, [evidenceUrls]);

  if (!isOpen) return null;

  const context: MatchImportContext = {
    phase,
    groupIndex: phase === 'group' ? groupIndex : undefined,
    round: phase === 'group' ? round : undefined,
  };

  const handleWorkbook = async (file?: File) => {
    if (!file) return;
    try {
      const next = await parseMatchResultsWorkbook(file, competition, context);
      setPreview(next);
      setVerification(Object.fromEntries(next.ready.map(candidate => [
        candidate.rowNumber,
        candidate.evidenceVerificationStatus ?? 'not_required',
      ])));
      setAnnouncement('');
      setLastApplied([]);
      setMessage(isEnglish
        ? `Parsed ${next.rows.length} row(s).`
        : `已解析 ${next.rows.length} 行。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const handleEvidenceFiles = (files: FileList | null) => {
    if (!files) return;
    Object.values(evidenceUrls).forEach(url => URL.revokeObjectURL(url));
    const next: Record<string, string> = {};
    Array.from(files).forEach(file => {
      next[file.name.toLowerCase()] = URL.createObjectURL(file);
    });
    setEvidenceUrls(next);
  };

  const getEvidenceUrl = (ref: string): string | undefined => {
    const name = fileNameFromRef(ref);
    return evidenceUrls[name];
  };

  const setVerificationStatus = (rowNumber: number, status: EvidenceVerificationStatus) => {
    setVerification(previous => ({ ...previous, [rowNumber]: status }));
  };

  const appliableCandidates = preview?.ready.filter(candidate => {
    const status = verification[candidate.rowNumber] ?? 'not_required';
    return status !== 'mismatch' && status !== 'unreadable';
  }) ?? [];

  const handleApply = () => {
    if (!preview || appliableCandidates.length === 0) return;
    applyImportedMatchResults(
      appliableCandidates.map(candidate => ({
        matchId: candidate.matchId,
        groupIndex: candidate.groupIndex,
        result: candidate.result,
        identityVerified: candidate.identityVerified,
        player1Games: candidate.player1Games,
        player2Games: candidate.player2Games,
        evidenceRefs: candidate.evidenceRef ? [candidate.evidenceRef] : undefined,
        evidenceHash: candidate.evidenceHash,
        evidenceVerificationStatus: verification[candidate.rowNumber] ?? 'not_required',
        sourceSubmissionId: candidate.sourceSubmissionId,
        sourceSubmittedAt: candidate.sourceSubmittedAt,
      })),
      isEnglish ? 'Import verified match results' : '导入已核验比赛结果'
    );
    const nextCompetition = useTournamentStore.getState().competition;
    setAnnouncement(
      phase === 'group'
        ? generateRoundAnnouncement(nextCompetition, groupIndex, round)
        : generateRoundAnnouncement(nextCompetition, groupIndex, round)
    );
    setLastApplied(appliableCandidates.map(candidate => ({
      matchId: candidate.matchId,
      label: `${candidate.participantCode} ${candidate.canonicalScore}`,
    })));
    setMessage(isEnglish
      ? `Applied ${appliableCandidates.length} result(s).`
      : `已写入 ${appliableCandidates.length} 场结果。`);
  };

  const copyAnnouncement = async () => {
    if (!announcement) return;
    await navigator.clipboard.writeText(announcement);
    setMessage(isEnglish ? 'Announcement copied.' : '公示文本已复制。');
  };

  const downloadTemplate = async () => {
    const group = competition.groups[groupIndex];
    const gameType = phase === 'group'
      ? getRoundGameType(group, round)
      : phase === 'r16'
        ? 'bo3'
        : phase === 'final'
          ? 'bo7'
          : 'bo5';
    const options = gameType === 'bo3'
      ? ['我以 2-0 获胜', '我以 2-1 获胜']
      : gameType === 'bo5'
        ? ['我以 3-0 获胜', '我以 3-1 获胜', '我以 3-2 获胜']
        : gameType === 'bo7'
          ? ['我以 4-0 获胜', '我以 4-1 获胜', '我以 4-2 获胜', '我以 4-3 获胜']
          : ['我以 1-0 获胜'];
    await writeExcelWorkbook([{
      name: '赛果导入',
      rows: [
        ['我的选手编号', '你的原神UID', '比赛结果', '结算截图', '提交者', '提交时间', '备注'],
        ['A01', '180748058', options[1] ?? options[0], 'A-R1-01_01.png', '示例提交者', '2026-09-25 20:30', ''],
        ['A02', '338916899', options[0], 'A-R1-02_01.png', '示例提交者', '2026-09-25 20:45', ''],
      ],
    }], `诗意杯-${gameType.toUpperCase()}-赛果导入模板.xlsx`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-700/60 px-5 py-3">
          <div>
            <h3 className="text-sm font-semibold text-white">
              {isEnglish ? 'Import and verify match results' : '导入并核验比赛结果'}
            </h3>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {isEnglish
                ? 'Screenshots are optional. Conflicts and missing submissions remain review items.'
                : '截图核验可选，系统只阻塞矛盾结果和未填写内容。'}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label={isEnglish ? 'Close' : '关闭'}
            title={isEnglish ? 'Close' : '关闭'}
            className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-2 border-b border-slate-700/60 px-5 py-3 md:grid-cols-[140px_1fr_140px_auto]">
          <label className="text-[11px] text-slate-500">
            <span className="mb-1 block">{isEnglish ? 'Phase' : '阶段'}</span>
            <select
              value={phase}
              onChange={event => setPhase(event.target.value as MatchImportContext['phase'])}
              className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200"
            >
              <option value="group">{isEnglish ? 'Group stage' : '小组赛'}</option>
              <option value="r16">{isEnglish ? 'Round of 16' : '16进8'}</option>
              <option value="quarterfinal">{isEnglish ? 'Quarterfinal' : '8进4'}</option>
              <option value="semifinal">{isEnglish ? 'Semifinal' : '半决赛'}</option>
              <option value="final">{isEnglish ? 'Final' : '决赛'}</option>
            </select>
          </label>

          {phase === 'group' && (
            <>
              <label className="text-[11px] text-slate-500">
                <span className="mb-1 block">{isEnglish ? 'Group' : '小组'}</span>
                <select
                  value={groupIndex}
                  onChange={event => {
                    const nextIndex = Number(event.target.value);
                    setGroupIndex(nextIndex);
                    setRound(Math.max(1, competition.groups[nextIndex]?.currentRound ?? 1));
                  }}
                  className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200"
                >
                  {competition.groups.map((group, index) => (
                    <option key={group.id} value={index}>{group.name}</option>
                  ))}
                </select>
              </label>
              <label className="text-[11px] text-slate-500">
                <span className="mb-1 block">{isEnglish ? 'Round' : '轮次'}</span>
                <select
                  value={round}
                  onChange={event => setRound(Number(event.target.value))}
                  className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200"
                >
                  {Array.from({ length: competition.groups[groupIndex]?.totalRounds ?? 5 }, (_, index) => index + 1)
                    .map(value => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
            </>
          )}

          <div className="flex items-end">
            <input
              ref={workbookInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={event => void handleWorkbook(event.target.files?.[0])}
            />
            <button
              onClick={() => workbookInputRef.current?.click()}
              className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300"
            >
              <FileSpreadsheet className="mr-1 inline h-3.5 w-3.5" />
              {isEnglish ? 'Select XLSX' : '选择 XLSX'}
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 md:grid-cols-[1fr_330px]">
          <div className="min-h-0 overflow-y-auto border-r border-slate-700/50 p-4">
            {!preview ? (
              <div className="flex h-56 items-center justify-center text-sm text-slate-500">
                {isEnglish ? 'Select a result workbook to start.' : '请选择腾讯文档导出的 XLSX。'}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-4 gap-2 text-center text-[11px]">
                  <div className="rounded bg-emerald-500/10 px-2 py-2 text-emerald-300">
                    {isEnglish ? 'Ready' : '可处理'} {preview.ready.length}
                  </div>
                  <div className="rounded bg-sky-500/10 px-2 py-2 text-sky-300">
                    {isEnglish ? 'Appliable' : '可写入'} {appliableCandidates.length}
                  </div>
                  <div className="rounded bg-slate-800/70 px-2 py-2 text-slate-300">
                    {isEnglish ? 'Duplicates' : '重复'} {preview.duplicates.length}
                  </div>
                  <div className="rounded bg-rose-500/10 px-2 py-2 text-rose-300">
                    {isEnglish ? 'Issues' : '异常'} {preview.issues.length}
                  </div>
                </div>

                <div className="space-y-2">
                  {preview.ready.map(candidate => {
                    const status = verification[candidate.rowNumber] ?? 'not_required';
                    const evidenceUrl = getEvidenceUrl(candidate.evidenceRef);
                    const safeEvidenceUrl = sanitizeEvidenceUrl(evidenceUrl);
                    return (
                      <div key={`${candidate.matchId}-${candidate.rowNumber}`} className="rounded-lg border border-slate-700/60 bg-slate-800/35 p-3">
                        <div className="flex items-start gap-3">
                          <div className="flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded border border-slate-700 bg-slate-950/50">
                            {safeEvidenceUrl ? (
                              <img
                                src={safeEvidenceUrl}
                                alt="evidence"
                                referrerPolicy="no-referrer"
                                className="h-full w-full object-contain"
                              />
                            ) : (
                              <ImageIcon className="h-7 w-7 text-slate-700" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="font-mono text-gold-300">{candidate.participantCode}</span>
                              <span className="text-slate-200">{candidate.canonicalScore}</span>
                              <span className="rounded border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] text-emerald-300">
                                {isEnglish ? 'Code + UID verified' : '编号 + UID 双重确认'}
                              </span>
                              <span className="font-mono text-slate-500">#{candidate.matchId.slice(0, 8)}</span>
                              <span className="text-slate-500">{candidate.evidenceRef}</span>
                            </div>
                            <div className="mt-1 font-mono text-[10px] text-slate-500">
                              UID {candidate.submittedUid} / {candidate.profileUid}
                            </div>
                            {candidate.note && <div className="mt-1 text-[11px] text-amber-300">{candidate.note}</div>}
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {([
                                ['not_required', isEnglish ? 'Optional' : '无需核验'],
                                ['verified', isEnglish ? 'Verified' : '核验通过'],
                                ['mismatch', isEnglish ? 'Mismatch' : '证据不符'],
                                ['unreadable', isEnglish ? 'Unreadable' : '图片不清'],
                              ] as Array<[EvidenceVerificationStatus, string]>).map(([value, label]) => (
                                <button
                                  key={value}
                                  onClick={() => setVerificationStatus(candidate.rowNumber, value)}
                                  className={`rounded border px-2 py-1 text-[10px] ${
                                    status === value
                                      ? value === 'verified' || value === 'not_required'
                                        ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                                        : 'border-rose-500/40 bg-rose-500/15 text-rose-300'
                                      : 'border-slate-700 bg-slate-800 text-slate-400'
                                  }`}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {preview.issues.length > 0 && (
                  <div className="space-y-1 rounded-lg border border-rose-500/25 bg-rose-500/5 p-3 text-[11px] text-rose-300">
                    {preview.issues.map((issue, index) => (
                      <div key={`${issue.code}-${issue.rowNumber}-${index}`}>
                        {isEnglish
                          ? `Row ${issue.rowNumber} · ${issue.messageEn ?? issue.message}`
                          : `第 ${issue.rowNumber} 行 · ${issue.message}`}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="min-h-0 overflow-y-auto p-4">
            <div className="space-y-3">
              <input
                ref={evidenceInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={event => handleEvidenceFiles(event.target.files)}
              />
              <button
                onClick={() => evidenceInputRef.current?.click()}
                className="w-full rounded-lg border border-sky-500/25 bg-sky-500/10 px-3 py-2 text-xs text-sky-300"
              >
                <Upload className="mr-1 inline h-3.5 w-3.5" />
                {isEnglish ? 'Load screenshot files for preview' : '载入截图文件用于核验'}
              </button>

              <button
                onClick={() => void downloadTemplate()}
                className="w-full rounded-lg border border-slate-600 bg-slate-800/70 px-3 py-2 text-xs text-slate-300"
              >
                <FileSpreadsheet className="mr-1 inline h-3.5 w-3.5" />
                {isEnglish ? 'Download import template' : '下载赛果导入模板'}
              </button>

              <div className="rounded-lg border border-slate-700 bg-slate-950/35 p-2 text-[10px] leading-5 text-slate-400">
                {isEnglish ? 'Recognized columns' : '可自动识别列'}
                <br />
                {isEnglish ? 'Participant: ' : '选手编号：'}我的选手编号 / 选手编号 / 参赛编号 / 编号
                <br />
                {isEnglish ? 'UID: ' : 'UID：'}你的原神UID / 游戏UID / 玩家UID / UID
                <br />
                {isEnglish ? 'Result: ' : '比赛结果：'}比赛结果 / 结果 / 胜方比分
                <br />
                {isEnglish ? 'Evidence: ' : '截图：'}结算截图 / 截图编号或链接 / 截图 / 证据引用
                <br />
                {isEnglish ? 'Optional: ' : '选填：'}提交者、提交时间、备注
              </div>

              <button
                onClick={handleApply}
                disabled={appliableCandidates.length === 0}
                className="w-full rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-3 py-2 text-xs text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Check className="mr-1 inline h-3.5 w-3.5" />
                {isEnglish
                  ? `Apply ${appliableCandidates.length} result(s)`
                  : `写入 ${appliableCandidates.length} 场结果`}
              </button>

              <button
                onClick={() => void copyAnnouncement()}
                disabled={!announcement}
                className="w-full rounded-lg border border-gold-500/30 bg-gold-500/10 px-3 py-2 text-xs text-gold-400 disabled:opacity-40"
              >
                <Clipboard className="mr-1 inline h-3.5 w-3.5" />
                {isEnglish ? 'Copy announcement' : '复制公示文本'}
              </button>

              <button
                onClick={() => {
                  const deadline = new Date(Date.now() + 10 * 60 * 1000).toISOString();
                  const count = announceRoundResults(groupIndex, round, deadline);
                  setMessage(isEnglish
                    ? `Announced ${count} verified result(s).`
                    : `已公示 ${count} 场已核验结果。`);
                }}
                disabled={phase !== 'group'}
                className="w-full rounded-lg border border-sky-500/25 bg-sky-500/10 px-3 py-2 text-xs text-sky-300 disabled:opacity-40"
              >
                <Check className="mr-1 inline h-3.5 w-3.5" />
                {isEnglish ? 'Mark round as announced' : '标记本轮已公示'}
              </button>

              <button
                onClick={() => {
                  const count = finalizeDefaultConfirmations(groupIndex, round);
                  setMessage(isEnglish
                    ? `Default-confirmed ${count} result(s).`
                    : `已将 ${count} 场无异议结果标记为默认确认。`);
                }}
                disabled={phase !== 'group'}
                className="w-full rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300 disabled:opacity-40"
              >
                <Check className="mr-1 inline h-3.5 w-3.5" />
                {isEnglish ? 'Finalize non-disputed results' : '完成无异议结果确认'}
              </button>

              {announcement && (
                <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-700 bg-slate-950/60 p-3 text-[11px] text-slate-300">
                  {announcement}
                </pre>
              )}

              <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-[10px] text-amber-300">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  {isEnglish
                    ? 'Mismatched or unreadable evidence is held for review. Missing screenshots do not block a result.'
                    : '证据不符或图片不清时暂停；缺少截图本身不阻止结果写入。'}
                </span>
              </div>

              {lastApplied.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] text-slate-500">
                    {isEnglish ? 'Applied matches' : '已写入比赛'}
                  </div>
                  {lastApplied.map(item => (
                    <button
                      key={item.matchId}
                      onClick={() => {
                        markResultDisputed(item.matchId, 'Manual review required');
                        setMessage(isEnglish
                          ? `${item.label} marked as disputed.`
                          : `${item.label} 已标记为有异议。`);
                      }}
                      className="flex w-full items-center justify-between rounded border border-rose-500/15 bg-rose-500/5 px-2 py-1 text-[10px] text-rose-300"
                    >
                      <span>{item.label}</span>
                      <span>{isEnglish ? 'Dispute' : '标记异议'}</span>
                    </button>
                  ))}
                </div>
              )}

              {message && (
                <div className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-[11px] text-slate-300">
                  {message}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
