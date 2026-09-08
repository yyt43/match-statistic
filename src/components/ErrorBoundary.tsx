import { Component, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * 全局错误边界：捕获子组件渲染异常，防止白屏。
 * 显示错误信息 + 重试按钮 + 导出当前数据按钮（防数据丢失）。
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

  handleExportData = () => {
    try {
      const data = localStorage.getItem('swiss_tournament_data');
      if (data) {
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tournament-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.error('导出数据失败：', e);
      alert('导出数据失败，请手动复制 localStorage 中的 swiss_tournament_data 键。');
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 bg-slate-900/95 flex items-center justify-center p-8 z-50">
          <div className="max-w-md w-full bg-slate-800 border border-rose-500/30 rounded-2xl p-6 text-center">
            <div className="text-5xl mb-4">⚠️</div>
            <h1 className="text-xl font-bold text-rose-400 mb-2">应用遇到异常</h1>
            <p className="text-sm text-slate-400 mb-4">
              页面渲染过程中发生了错误。你的数据可能仍然安全保存在本地存储中。
            </p>
            <details className="mb-4 text-left">
              <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-400">查看错误详情</summary>
              <pre className="mt-2 text-[10px] text-slate-500 bg-slate-900/50 rounded p-2 overflow-x-auto max-h-32">
                {this.state.error?.message ?? '未知错误'}
                {'\n'}
                {this.state.error?.stack ?? ''}
              </pre>
            </details>
            <div className="flex flex-col gap-2">
              <button
                onClick={this.handleReload}
                className="w-full py-2 rounded-lg bg-sky-500/20 border border-sky-500/30 text-sky-400 hover:bg-sky-500/30 transition-colors text-sm font-medium"
              >
                刷新页面重试
              </button>
              <button
                onClick={this.handleExportData}
                className="w-full py-2 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-400 hover:bg-amber-500/30 transition-colors text-sm font-medium"
              >
                导出当前数据（防止丢失）
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
