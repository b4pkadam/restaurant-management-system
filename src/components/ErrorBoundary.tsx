import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught React Error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-6 dark:bg-gray-900 dark:text-white">
          <div className="w-full max-w-xl rounded-2xl bg-white p-8 shadow-xl dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
              ⚠️
            </div>
            <h1 className="text-xl font-bold text-center text-gray-900 dark:text-white">Something went wrong</h1>
            <p className="mt-2 text-sm text-center text-red-600 dark:text-red-400 font-semibold">
              {this.state.error?.name}: {this.state.error?.message}
            </p>

            {this.state.error?.stack && (
              <div className="mt-4 text-left">
                <p className="text-xs font-semibold text-gray-500 mb-1">Diagnostics / Stack Trace:</p>
                <pre className="text-[10px] leading-relaxed font-mono bg-gray-100 dark:bg-gray-950 p-3 rounded-lg overflow-auto max-h-40 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-800 whitespace-pre-wrap break-all">
                  {this.state.error.stack}
                </pre>
              </div>
            )}

            <div className="mt-6 flex flex-col gap-3">
              <button
                onClick={() => {
                  try {
                    localStorage.clear();
                  } catch {}
                  window.location.reload();
                }}
                className="w-full rounded-xl bg-red-600 py-3 text-sm font-bold text-white shadow-md hover:bg-red-700 active:scale-95 transition-all cursor-pointer"
              >
                Reset Storage & Reload
              </button>
              <button
                onClick={() => window.location.reload()}
                className="w-full rounded-xl bg-gray-100 dark:bg-gray-700 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-200 transition-all cursor-pointer"
              >
                Try Reloading
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
