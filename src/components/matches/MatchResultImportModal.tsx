import {
  Check,
  Clipboard,
  Download,
  FileSpreadsheet,
  Image as ImageIcon,
  ShieldAlert,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLanguagePreference } from '../../i18n/context';
import { useTournamentStore } from '../../store/useTournamentStore';
import { useShallow } from 'zustand/react/shallow';
import type { EvidencePolicy, EvidenceVerificationStatus } from '../../types';
import {
  EVIDENCE_POLICY_LABELS,
  EVIDENCE_POLICY_VALUES,
  coerceEvidenceStatus,
  defaultEvidenceStatus,
  isEvidenceBlocked,
  normalizeEvidencePolicy,
  summarizeEvidence,
} from '../../utils/import/evidencePolicy';
import {
  generateRoundAnnouncement,
  parseMatchResultsWorkbook,
  type MatchImportPreview,
} from '../../utils/import/matchResultImport';
import { getRoundGameType } from '../../utils/swissPairing';
import { downloadMatchResultTemplate } from '../../utils/import/importTemplates';

interface MatchResultImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type EvidenceFilter = 'all' | 'pending' | 'verified' | 'blocked';

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
    setEvidencePolicy,
  } = useTournamentStore(useShallow(state => ({
    competition: state.competition,
    applyImportedMatchResults: state.applyImportedMatchResults,
    setEvidencePolicy: state.setEvidencePolicy,
  })));
  const policy = normalizeEvidencePolicy(competition.evidencePolicy);
  const [preview, setPreview] = useState<MatchImportPreview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [verification, setVerification] = useState<Record<number, EvidenceVerificationStatus>>({});
  const [evidenceUrls, setEvidenceUrls] = useState<Record<string, string>>({});
  const [announcement, setAnnouncement] = useState('');
  const [filter, setFilter] = useState<EvidenceFilter>('all');
  const workbookInputRef = useRef<HTMLInputElement>(null);
  const evidenceInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    Object.values(evidenceUrls).forEach(url => URL.revokeObjectURL(url));
  }, [evidenceUrls]);

  if (!isOpen) return null;

  const statusOf = (rowNumber: number): EvidenceVerificationStatus =>
    coerceEvidenceStatus(
      verification[rowNumber] ?? defaultEvidenceStatus(policy),
      policy
    );

  const handleWorkbook = async (file?: File) => {
    if (!file) return;
    try {
      const next = await parseMatchResultsWorkbook(file, competition);
      setPreview(next);
      setFilter('all');
      setVerification(Object.fromEntries(next.ready.map(candidate => [
        candidate.rowNumber,
        coerceEvidenceStatus(
          candidate.evidenceVerificationStatus ?? defaultEvidenceStatus(policy),
          policy
        ),
      ])));
      setAnnouncement('');
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

  const changePolicy = (nextPolicy: EvidencePolicy) => {
    if (nextPolicy === policy) return;
    setEvidencePolicy(nextPolicy);
    if (!preview) return;
    setVerification(previous => Object.fromEntries(
      preview.ready.map(candidate => {
        const current = previous[candidate.rowNumber]
          ?? candidate.evidenceVerificationStatus
          ?? defaultEvidenceStatus(policy);
        return [
          candidate.rowNumber,
          coerceEvidenceStatus(
            current === 'not_required' && nextPolicy !== 'off'
              ? defaultEvidenceStatus(nextPolicy)
              : current,
            nextPolicy
          ),
        ];
      })
    ));
  };

  const readyCandidates = preview?.ready ?? [];
  const statusList = readyCandidates.map(candidate => statusOf(candidate.rowNumber));
  const summary = summarizeEvidence(statusList, policy);

  const matchesFilter = (status: EvidenceVerificationStatus): boolean => {
    if (filter === 'all') return true;
    const blocked = isEvidenceBlocked(status, policy);
    if (filter === 'blocked') return blocked;
    if (blocked) return false;
    return status === filter;
  };

  const visibleCandidates = readyCandidates.filter(candidate =>
    matchesFilter(statusOf(candidate.rowNumber))
  );

  const appliableCandidates = readyCandidates.filter(
    candidate => !isEvidenceBlocked(statusOf(candidate.rowNumber), policy)
  );

  const markAllVerified = () => {
    setVerification(previous => {
      const next = { ...previous };
      visibleCandidates.forEach(candidate => {
        next[candidate.rowNumber] = 'verified';
      });
      return next;
    });
  };

  const policyCopy = EVIDENCE_POLICY_LABELS[policy];

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
        evidenceVerificationStatus: statusOf(candidate.rowNumber),
        sourceSubmissionId: candidate.sourceSubmissionId,
        sourceSubmittedAt: candidate.sourceSubmittedAt,
      })),
      isEnglish ? 'Import verified match results' : '导入已核验比赛结果'
    );
    const nextCompetition = useTournamentStore.getState().competition;
    const affectedRounds = Array.from(new Set(
      appliableCandidates.map(candidate => `${candidate.groupIndex}:${candidate.round}`)
    )).map(value => {
      const [affectedGroupIndex, affectedRound] = value.split(':').map(Number);
      return { groupIndex: affectedGroupIndex, round: affectedRound };
    });
    setAnnouncement(
      affectedRounds
        .map(({ groupIndex: affectedGroupIndex, round: affectedRound }) =>
          generateRoundAnnouncement(nextCompetition, affectedGroupIndex, affectedRound)
        )
        .filter(Boolean)
        .join('\n\n')
    );
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
    const group = competition.groups[competition.currentGroupIndex];
    const currentRound = Math.max(1, group.currentRound);
    await downloadMatchResultTemplate(getRoundGameType(group, currentRound));
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
                ? 'Choose the screenshot policy, review each row, then write the results you trust.'
                : '先选截图核验策略、逐行核验，再写入你确认的结果。'}
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

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-700/60 px-5 py-2.5">
          <span className="text-[11px] text-slate-400">
            {isEnglish ? 'Screenshot policy' : '截图核验策略'}
          </span>
          <div className="flex flex-wrap gap-1">
            {EVIDENCE_POLICY_VALUES.map(value => (
              <button
                key={value}
                onClick={() => changePolicy(value)}
                aria-pressed={value === policy}
                className={`rounded border px-2 py-1 text-[10px] ${
                  value === policy
                    ? 'border-gold-500/50 bg-gold-500/15 text-gold-300'
                    : 'border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {isEnglish ? EVIDENCE_POLICY_LABELS[value].en : EVIDENCE_POLICY_LABELS[value].zh}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-slate-500">
            {isEnglish ? policyCopy.description.en : policyCopy.description.zh}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/60 px-5 py-3">
          <div className="text-[11px] text-slate-400">
            {isEnglish
              ? 'Results are matched automatically across all groups by participant code, using each group’s current round.'
              : '系统会按选手编号跨全部小组自动匹配，并优先使用各小组当前轮次。'}
          </div>
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
          <button
            onClick={() => void downloadTemplate()}
            className="rounded-lg border border-slate-600 bg-slate-800/70 px-3 py-2 text-xs text-slate-300"
          >
            <Download className="mr-1 inline h-3.5 w-3.5" />
            {isEnglish ? 'Download template' : '下载模板'}
          </button>
        </div>

        <div className="grid min-h-0 flex-1 md:grid-cols-[1fr_330px]">
          <div className="min-h-0 overflow-y-auto border-r border-slate-700/50 p-4">
            {!preview ? (
              <div className="flex h-56 items-center justify-center text-sm text-slate-500">
                {isEnglish ? 'Select a result workbook to start.' : '请选择腾讯文档导出的 XLSX。'}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-center text-[11px] sm:grid-cols-5">
                  <div className="rounded bg-emerald-500/10 px-2 py-2 text-emerald-300">
                    {isEnglish ? 'Ready' : '可处理'} {preview.ready.length}
                  </div>
                  <div className="rounded bg-sky-500/10 px-2 py-2 text-sky-300">
                    {isEnglish ? 'Verified' : '核验通过'} {summary.verified}
                  </div>
                  <div className="rounded bg-amber-500/10 px-2 py-2 text-amber-300">
                    {isEnglish ? 'Pending' : '待核验'} {summary.pending}
                  </div>
                  <div className="rounded bg-rose-500/10 px-2 py-2 text-rose-300">
                    {isEnglish ? 'Held' : '将被拦住'} {summary.blocked}
                  </div>
                  <div className="rounded bg-slate-800/70 px-2 py-2 text-slate-300">
                    {isEnglish ? 'Issues' : '异常'} {preview.issues.length}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1">
                    {([
                      ['all', isEnglish ? 'All' : '全部'],
                      ['pending', isEnglish ? 'Pending' : '待核验'],
                      ['verified', isEnglish ? 'Verified' : '核验通过'],
                      ['blocked', isEnglish ? 'Held' : '被拦住'],
                    ] as Array<[EvidenceFilter, string]>).map(([value, label]) => (
                      <button
                        key={value}
                        onClick={() => setFilter(value)}
                        aria-pressed={filter === value}
                        className={`rounded border px-2 py-1 text-[10px] ${
                          filter === value
                            ? 'border-gold-500/50 bg-gold-500/15 text-gold-300'
                            : 'border-slate-700 bg-slate-800 text-slate-400'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={markAllVerified}
                    disabled={visibleCandidates.length === 0}
                    className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-300 disabled:opacity-40"
                  >
                    {isEnglish ? 'Mark visible rows as verified' : '把当前筛选项标为核验通过'}
                  </button>
                </div>

                <div className="space-y-2">
                  {visibleCandidates.map(candidate => {
                    const status = statusOf(candidate.rowNumber);
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
                                policy === 'off'
                                  ? ['not_required', isEnglish ? 'Optional' : '无需核验']
                                  : ['pending', isEnglish ? 'Pending' : '待核验'],
                                ['verified', isEnglish ? 'Verified' : '核验通过'],
                                ['mismatch', isEnglish ? 'Mismatch' : '证据不符'],
                                ['unreadable', isEnglish ? 'Unreadable' : '图片不清'],
                              ] as Array<[EvidenceVerificationStatus, string]>).map(([value, label]) => (
                                <button
                                  key={value}
                                  onClick={() => setVerificationStatus(candidate.rowNumber, value)}
                                  className={`rounded border px-2 py-1 text-[10px] ${
                                    status === value
                                      ? value === 'verified' || value === 'not_required' || value === 'pending'
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

              {announcement && (
                <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-700 bg-slate-950/60 p-3 text-[11px] text-slate-300">
                  {announcement}
                </pre>
              )}

              <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-[10px] text-amber-300">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  {policy === 'off'
                    ? (isEnglish
                      ? 'Off: mismatched or unreadable evidence is held; missing screenshots do not block a result.'
                      : '关闭：证据不符或图片不清的行会被拦住；缺少截图本身不阻止结果写入。')
                    : policy === 'required'
                      ? (isEnglish
                        ? 'Required: rows without an evidence reference are reported as issues; unverified rows are written as pending.'
                        : '要求提供：缺少截图引用的行会作为异常拦住；未核验的行按「待核验」写入成绩。')
                      : (isEnglish
                        ? `Strict: only rows marked verified are written. ${summary.blocked} row(s) would be held right now.`
                        : `严格：只有标记「核验通过」的行才会写入。当前会被拦住 ${summary.blocked} 行。`)}
                </span>
              </div>

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
