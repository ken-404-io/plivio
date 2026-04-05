import { Component, type ReactNode } from 'react';
import { RefreshCw, Home } from 'lucide-react';

interface Props  { children: ReactNode; }
interface State  { hasError: boolean; message: string; }

/**
 * React error boundary — catches any unhandled rendering error in its
 * subtree and shows a friendly recovery screen instead of a blank page.
 *
 * Place at the top of the app tree (in main.tsx or App.tsx) so all
 * pages are protected.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(err: unknown): State {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return { hasError: true, message };
  }

  componentDidCatch(err: unknown, info: { componentStack: string }) {
    // In production you'd send this to a monitoring service (Sentry, etc.)
    console.error('[ErrorBoundary]', err, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="error-page">
        <div className="error-page-inner">
          <div className="error-code error-code--crash" aria-hidden="true">!</div>

          <h1 className="error-title">Something went wrong</h1>
          <p className="error-desc">
            The app ran into an unexpected problem. This has been noted.
          </p>

          {this.state.message && (
            <p className="error-technical">{this.state.message}</p>
          )}

          <div className="error-actions">
            <button className="btn btn-ghost" onClick={this.handleReset}>
              <RefreshCw size={16} /> Try again
            </button>
            <a href="/dashboard" className="btn btn-primary">
              <Home size={16} /> Go to Dashboard
            </a>
          </div>
        </div>
      </div>
    );
  }
}
