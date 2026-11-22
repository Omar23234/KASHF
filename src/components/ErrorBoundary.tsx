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
        <div className="min-h-dvh bg-[#FBF7F0] text-[#231A15] flex items-center justify-center p-6">
          <div className="w-full max-w-md rounded-3xl bg-[#FFFDF9] border border-[#D5C7B2] p-6 text-center space-y-4 shadow-xl">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-[#F9EAE6] border border-[#C88172] flex items-center justify-center text-[#9B3B30]">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-bold text-[#231A15]">حدث خطأ غير متوقع / Unexpected Error</h2>
            <p className="text-sm text-[#6E5E50] break-words max-h-32 overflow-y-auto">
              {this.state.errorMessage}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, errorMessage: '' });
                this.props.onReset?.();
              }}
              className="w-full min-h-[48px] rounded-2xl bg-[#231A15] hover:bg-[#3A2C24] text-[#FBF7F0] font-semibold flex items-center justify-center gap-2 transition cursor-pointer"
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
