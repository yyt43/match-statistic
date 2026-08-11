import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw, Download } from 'lucide-react';
import { exportCompetitionToFile } from '../utils/fileStorage';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  showResetConfirm: boolean;
}

/**
 * 全局错误边界：捕获子树渲染异常，避免整页白屏。
 * 提供「导出当前数据备份」与「重置并重新开始」两个出口。
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, showResetConfirm: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error, showResetConfirm: false };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary] 捕获到未处理异常:', error, errorInfo);
  }

  handleExport = (): void => {
    try {
      const raw = localStorage.getItem('swiss_tournament_data');
      if (!raw) {
        alert('当前本地无可用备份数据');
        return;
      }
      const data = JSON.parse(raw);
      exportCompetitionToFile(data);
    } catch (e) {
      console.error('导出失败:', e);
      alert('导出失败，请手动复制 localStorage 中的 swiss_tournament_data 字段');
    }
  };

  handleReset = (): void => {
    // 改为显示自定义确认弹窗，替代 window.confirm
    this.setState({ showResetConfirm: true });
  };

  confirmReset = (): void => {
    try {
      localStorage.removeItem('swiss_tournament_data');
    } catch (e) {
      console.error('清理 localStorage 失败:', e);
    }
    this.setState({ hasError: false, error: null, showResetConfirm: false }, () => {
      window.location.reload();
    });
  };

  cancelReset = (): void => {
    this.setState({ showResetConfirm: false });
  };

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null, showResetConfirm: false });
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    const errMsg = this.state.error?.message || '未知错误';
    const stack = this.state.error?.stack;

    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-xl w-full bg-slate-800/50 border border-rose-500/30 rounded-2xl p-8 shadow-2xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-rose-500/20 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-rose-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white">页面出现异常</h1>
              <p className="text-xs text-slate-400 mt-0.5">已捕获错误以防白屏，可选择以下操作</p>
            </div>
          </div>

          <div className="mb-5 p-3 bg-slate-900/60 border border-slate-700/50 rounded-lg">
            <p className="text-xs font-mono text-rose-300 break-all">{errMsg}</p>
            {stack && (
              <details className="mt-2">
                <summary className="text-[11px] text-slate-500 cursor-pointer hover:text-slate-400">
                  查看堆栈
                </summary>
                <pre className="mt-2 text-[10px] text-slate-500 whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {stack}
                </pre>
              </details>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <button
              onClick={this.handleRetry}
              className="w-full py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium transition-colors"
            >
              重试（保留数据）
            </button>
            <button
              onClick={this.handleExport}
              className="w-full py-2.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 text-sm font-medium transition-colors border border-emerald-500/30 flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              导出当前数据备份
            </button>
            <button
              onClick={this.handleReset}
              className="w-full py-2.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 text-sm font-medium transition-colors border border-rose-500/30 flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              清空数据并重新开始
            </button>
          </div>

          <p className="mt-4 text-[11px] text-slate-500 text-center">
            若问题反复出现，请将上述错误信息反馈给开发者
          </p>
        </div>

        {/* 重置确认弹窗（替代 window.confirm，类组件无法使用 ConfirmDialog hook） */}
        {this.state.showResetConfirm && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={this.cancelReset}
          >
            <div
              className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl max-w-md w-full p-6"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-start gap-3 mb-4">
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-white">确认清空数据</h3>
                  <p className="text-sm text-slate-400 mt-1">
                    确定要清空所有数据并重新开始吗？此操作不可恢复。
                  </p>
                </div>
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={this.cancelReset}
                  className="px-4 py-2 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors text-sm"
                >
                  取消
                </button>
                <button
                  onClick={this.confirmReset}
                  className="px-4 py-2 rounded-lg bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 border border-rose-500/30 transition-colors text-sm font-medium"
                >
                  确认清空
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
}
