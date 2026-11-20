import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode; onReset?: () => void },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode; onReset?: () => void }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, errorMessage: error.message || 'Unexpected error' };
  }

  componentDidCatch(error: Error) {
    console.error('App ErrorBoundary caught:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-dvh bg-[#060913] text-slate-100 flex items-center justify-center p-6">
          <div className="w-full max-w-md rounded-3xl bg-[#0D1326] border border-white/10 p-6 text-center space-y-4">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-bold">حدث خطأ غير متوقع / Unexpected Error</h2>
            <p className="text-sm text-slate-400 break-words max-h-32 overflow-y-auto">
              {this.state.errorMessage}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, errorMessage: '' });
                this.props.onReset?.();
              }}
              className="w-full min-h-[48px] rounded-2xl bg-gradient-to-r from-blue-600 to-violet-600 text-white font-semibold flex items-center justify-center gap-2 hover:brightness-110 transition cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>العودة للرئيسية / Return Home</span>
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
