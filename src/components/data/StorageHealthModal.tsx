import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Database, RefreshCw, ShieldCheck, Wrench, X } from 'lucide-react';
import { useEscapeClose } from '../../hooks/useEscapeClose';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useLanguagePreference } from '../../i18n/context';
import { useTournamentStore } from '../../store/useTournamentStore';
import {
  inspectStorageHealth,
  repairStorageHealth,
  type StorageHealthLevel,
  type StorageHealthReport,
} from '../../utils/storage/health';

interface StorageHealthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function StorageHealthModal({ isOpen, onClose }: StorageHealthModalProps) {
  const { language } = useLanguagePreference();
  const isEnglish = language === 'en';
  const [report, setReport] = useState<StorageHealthReport | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEscapeClose(isOpen && !isRepairing, onClose);
  useFocusTrap(isOpen, dialogRef);

  const runInspection = async () => {
    setIsChecking(true);
    try {
      setReport(await inspectStorageHealth(useTournamentStore.getState().competition));
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    if (isOpen) void runInspection();
  }, [isOpen]);

  if (!isOpen) return null;

  const levelText: Record<StorageHealthLevel, string> = {
    ok: isEnglish ? 'Healthy' : '正常',
    warning: isEnglish ? 'Needs attention' : '需要关注',
    error: isEnglish ? 'Problem found' : '发现异常',
  };
  const levelStyle: Record<StorageHealthLevel, string> = {
    ok: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    warning: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    error: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

  const formatTime = (value: string | null) => {
    if (!value) return isEnglish ? 'Unknown' : '未知';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString(isEnglish ? 'en-US' : 'zh-CN');
  };

  const repair = async () => {
    setIsRepairing(true);
    try {
      setReport(await repairStorageHealth(
        useTournamentStore.getState().competition,
        isEnglish ? 'Before storage repair' : '存储体检修复前'
      ));
    } finally {
      setIsRepairing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        onClick={event => event.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-700/60 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-sky-500/15 p-2 text-sky-300">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-white">{isEnglish ? 'Storage health' : '存储体检'}</h3>
              <p className="text-[11px] text-slate-500">
                {isEnglish
                  ? 'Check schema, mirrors, snapshots, audit log, and persistence status.'
                  : '检查数据结构、双存储、快照、审计记录和最近保存状态。'}
              </p>
            </div>
          </div>
          <button onClick={onClose} disabled={isRepairing} className="text-slate-500 hover:text-white disabled:opacity-40">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {report ? (
            <div className="space-y-4">
              <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${levelStyle[report.level]}`}>
                {report.level === 'ok'
                  ? <CheckCircle2 className="h-5 w-5 shrink-0" />
                  : <AlertTriangle className="h-5 w-5 shrink-0" />}
                <div className="flex-1">
                  <div className="text-sm font-semibold">{levelText[report.level]}</div>
                  <div className="text-[11px] opacity-80">
                    {isEnglish ? 'Checked at ' : '检查时间：'}{formatTime(report.checkedAt)}
                  </div>
                </div>
                <button
                  onClick={() => void runInspection()}
                  disabled={isChecking || isRepairing}
                  className="rounded-lg border border-current/30 p-2 hover:bg-white/5 disabled:opacity-40"
                  title={isEnglish ? 'Check again' : '重新检查'}
                >
                  <RefreshCw className={`h-4 w-4 ${isChecking ? 'animate-spin' : ''}`} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <div className="rounded-lg border border-slate-700/50 bg-slate-800/40 p-3">
                  <div className="text-[10px] text-slate-500">IndexedDB</div>
                  <div className={`mt-1 text-sm font-semibold ${report.stats.indexedDbAvailable ? 'text-emerald-300' : 'text-amber-300'}`}>
                    {report.stats.indexedDbAvailable ? (isEnglish ? 'Available' : '可用') : (isEnglish ? 'Fallback' : '回退模式')}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-700/50 bg-slate-800/40 p-3">
                  <div className="text-[10px] text-slate-500">{isEnglish ? 'Current data' : '当前数据'}</div>
                  <div className="mt-1 text-sm font-semibold text-slate-200">{formatBytes(report.stats.currentBytes)}</div>
                </div>
                <div className="rounded-lg border border-slate-700/50 bg-slate-800/40 p-3">
                  <div className="text-[10px] text-slate-500">{isEnglish ? 'Snapshots' : '快照'}</div>
                  <div className="mt-1 text-sm font-semibold text-slate-200">{report.stats.snapshotCount}</div>
                </div>
                <div className="rounded-lg border border-slate-700/50 bg-slate-800/40 p-3">
                  <div className="text-[10px] text-slate-500">{isEnglish ? 'Audit entries' : '审计记录'}</div>
                  <div className="mt-1 text-sm font-semibold text-slate-200">{report.stats.auditCount}</div>
                </div>
              </div>

              <div className="space-y-2">
                {report.checks.map(check => (
                  <div key={check.id} className="flex items-start gap-3 rounded-lg border border-slate-700/50 bg-slate-800/35 px-3 py-2.5">
                    <div className={`mt-0.5 rounded-full p-1 ${levelStyle[check.level]}`}>
                      {check.level === 'ok'
                        ? <CheckCircle2 className="h-3.5 w-3.5" />
                        : <AlertTriangle className="h-3.5 w-3.5" />}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-slate-200">{check.title[language]}</div>
                      <div className="mt-0.5 break-words text-[11px] text-slate-500">{check.detail[language]}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="py-16 text-center text-sm text-slate-500">
              <Database className="mx-auto mb-3 h-8 w-8 opacity-30" />
              {isEnglish ? 'Checking storage...' : '正在检查存储...'}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-700/60 px-5 py-4">
          <div className="text-[10px] text-slate-600">
            {isEnglish ? 'Last saved: ' : '最近保存：'}{formatTime(report?.stats.lastSavedAt ?? null)}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={isRepairing}
              className="rounded-lg px-4 py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-40"
            >
              {isEnglish ? 'Close' : '关闭'}
            </button>
            <button
              onClick={() => void repair()}
              disabled={isChecking || isRepairing || !report}
              className="flex items-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/15 px-4 py-2 text-sm font-medium text-sky-300 hover:bg-sky-500/25 disabled:opacity-40"
            >
              <Wrench className={`h-4 w-4 ${isRepairing ? 'animate-pulse' : ''}`} />
              {isRepairing
                ? (isEnglish ? 'Repairing...' : '修复中...')
                : (isEnglish ? 'Rewrite storage' : '重写存储')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
