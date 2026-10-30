import { Component, type ReactNode } from 'react';
import { getStoredLanguage, translations } from '../../i18n/data';
import { downloadBlob } from '../../utils/export/download';
import { idbGet } from '../../utils/storage/indexedDb';
import { BACKUP_KEY, STORAGE_KEY } from '../../utils/storage/storage';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

const RECOVERY_KEYS = [STORAGE_KEY, BACKUP_KEY] as const;

/**
 * 把存储里的记录（信封 {version, savedAt, data} 或裸赛事对象）解出可重新导入的赛事 JSON。
 * 解析失败但内容非空的，原样返回，至少让用户能手工抢救。
 */
function extractCompetitionPayload(raw: unknown): string | null {
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      return extractCompetitionPayload(parsed) ?? trimmed;
    } catch {
      return trimmed;
    }
  }
  if (raw && typeof raw === 'object') {
    const record = raw as Record<string, unknown>;
    if (record.data && typeof record.data === 'object') return JSON.stringify(record.data);
    if (record.groups) return JSON.stringify(record);
  }
  return null;
}

/**
 * 全局错误边界：捕获子组件渲染异常，防止白屏。
 * 显示错误信息 + 重试按钮 + 导出当前数据按钮（防数据丢失）。
 *
 * 导出按钮要覆盖三种存储状态：localStorage 主镜像、备份镜像、以及数据 >2MB 后
 * 只存在于 IndexedDB 的情况，任一存在都要能导出；全都没有时明确提示，避免静默无反应。
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('ErrorBoundary 捕获到异常：', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  collectRecoveryPayload = async (): Promise<string | null> => {
    for (const key of RECOVERY_KEYS) {
      try {
        const localValue = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
        const payload = extractCompetitionPayload(localValue);
        if (payload) return payload;
      } catch {
        /* 单个来源读取失败不影响其它来源 */
      }
    }
    for (const key of RECOVERY_KEYS) {
      try {
        const payload = extractCompetitionPayload(await idbGet<unknown>(key));
        if (payload) return payload;
      } catch {
        /* 同上，IndexedDB 不可用时直接跳过 */
      }
    }
    return null;
  };

  handleExportData = async (): Promise<void> => {
    const t = translations[getStoredLanguage()];
    try {
      const payload = await this.collectRecoveryPayload();
      if (!payload) {
        alert(t.errorBoundaryExportNoData);
        return;
      }
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      const blob = new Blob([payload], { type: 'application/json' });
      downloadBlob(blob, `tournament-recovery-${stamp}.json`);
    } catch (e) {
      console.error('导出数据失败：', e);
      alert(t.errorBoundaryExportFailed);
    }
  };

  render() {
    if (this.state.hasError) {
      const t = translations[getStoredLanguage()];
      return (
        <div className="fixed inset-0 bg-slate-900/95 flex items-center justify-center p-8 z-50">
          <div className="max-w-md w-full bg-slate-800 border border-rose-500/30 rounded-2xl p-6 text-center">
            <div className="text-5xl mb-4">⚠️</div>
            <h1 className="text-xl font-bold text-rose-400 mb-2">{t.errorBoundaryTitle}</h1>
            <p className="text-sm text-slate-400 mb-4">
              {t.errorBoundaryDescription}
            </p>
            <details className="mb-4 text-left">
              <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-400">{t.errorBoundaryDetails}</summary>
              <pre className="mt-2 text-[10px] text-slate-500 bg-slate-900/50 rounded p-2 overflow-x-auto max-h-32">
                {this.state.error?.message ?? t.errorBoundaryUnknown}
                {'\n'}
                {this.state.error?.stack ?? ''}
              </pre>
            </details>
            <div className="flex flex-col gap-2">
              <button
                onClick={this.handleReload}
                className="w-full py-2 rounded-lg bg-sky-500/20 border border-sky-500/30 text-sky-400 hover:bg-sky-500/30 transition-colors text-sm font-medium"
              >
                {t.errorBoundaryReload}
              </button>
              <button
                onClick={this.handleExportData}
                className="w-full py-2 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-400 hover:bg-amber-500/30 transition-colors text-sm font-medium"
              >
                {t.errorBoundaryExport}
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
