'use client';

import { Component, type ReactNode } from 'react';

interface Props {
  fallback?: ReactNode;
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="flex flex-col items-center justify-center p-8 gap-2 rounded-lg border border-red-900/50 bg-red-950/20">
            <p className="text-red-400 text-sm font-medium">This component failed to render</p>
            <p className="text-red-400/60 text-xs">
              {this.state.error?.message || 'Unknown error'}
            </p>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
