import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught React Error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-6 text-center dark:bg-gray-900 dark:text-white">
          <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
              ⚠️
            </div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Something went wrong</h1>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              {this.state.error?.message || 'An unexpected error occurred while rendering the application.'}
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <button
                onClick={() => {
                  localStorage.clear();
                  window.location.reload();
                }}
                className="w-full rounded-xl bg-red-600 py-3 text-sm font-bold text-white shadow-md hover:bg-red-700 active:scale-95 transition-all"
              >
                Reset App & Reload
              </button>
              <button
                onClick={() => window.location.reload()}
                className="w-full rounded-xl bg-gray-100 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200"
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
