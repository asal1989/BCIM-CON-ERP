// src/components/common/ErrorBoundary.jsx
// Class-based React Error Boundary — catches JS errors in any child component tree
// and renders a friendly fallback instead of a blank white screen.
import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            background: '#0f172a',
            color: '#f1f5f9',
            fontFamily: 'system-ui, sans-serif',
            padding: '2rem',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            Something went wrong
          </h1>
          <p style={{ color: '#94a3b8', maxWidth: '480px', marginBottom: '1.5rem' }}>
            An unexpected error occurred. You can try again or reload the page.
          </p>
          {process.env.NODE_ENV !== 'production' && this.state.error && (
            <pre
              style={{
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '8px',
                padding: '1rem',
                fontSize: '0.75rem',
                color: '#f87171',
                maxWidth: '640px',
                overflow: 'auto',
                textAlign: 'left',
                marginBottom: '1.5rem',
              }}
            >
              {this.state.error.toString()}
              {this.state.errorInfo?.componentStack}
            </pre>
          )}
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={this.handleRetry}
              style={{
                background: '#1e293b',
                color: '#f1f5f9',
                border: '1px solid #334155',
                borderRadius: '8px',
                padding: '0.625rem 1.5rem',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Try Again
            </button>
            <button
              onClick={this.handleReload}
              style={{
                background: '#3b82f6',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                padding: '0.625rem 1.5rem',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
