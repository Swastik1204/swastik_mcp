/**
 * ErrorBoundary — top-level React error boundary.
 *
 * Catches any unhandled render / lifecycle errors and renders a
 * readable fallback instead of a blank screen.  Also logs the error
 * to the console so it shows up in browser dev-tools.
 *
 * Usage in App.jsx:
 *   <ErrorBoundary>
 *     <YourTree />
 *   </ErrorBoundary>
 *
 * Works with lazy-loaded routes via React.Suspense — errors thrown
 * inside a Suspense tree (including dynamic import failures) bubble up
 * here instead of crashing the whole app silently.
 */
import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error('[ErrorBoundary] Uncaught error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const { error, errorInfo } = this.state;
    const isDev = import.meta.env.DEV;

    return (
      <div className="min-h-screen flex items-center justify-center bg-base-200 p-8">
        <div className="card bg-base-100 shadow-xl max-w-2xl w-full">
          <div className="card-body gap-4">
            {/* Header */}
            <div className="flex items-center gap-3">
              <span className="text-3xl">💥</span>
              <div>
                <h2 className="card-title text-error">Something went wrong</h2>
                <p className="text-sm text-base-content/60">
                  An unexpected error occurred in this part of the UI.
                </p>
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div className="alert alert-error alert-sm">
                <span className="font-mono text-sm break-all">
                  {error.message || String(error)}
                </span>
              </div>
            )}

            {/* Stack trace — dev only */}
            {isDev && errorInfo?.componentStack && (
              <details className="collapse collapse-arrow bg-base-200">
                <summary className="collapse-title text-xs font-mono opacity-60">
                  Component stack
                </summary>
                <div className="collapse-content">
                  <pre className="text-xs overflow-auto whitespace-pre-wrap opacity-70 max-h-64">
                    {errorInfo.componentStack}
                  </pre>
                </div>
              </details>
            )}

            {/* Actions */}
            <div className="card-actions justify-end gap-2 pt-2">
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => window.location.reload()}
              >
                Reload page
              </button>
              <button
                className="btn btn-sm btn-primary"
                onClick={this.handleReset}
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
