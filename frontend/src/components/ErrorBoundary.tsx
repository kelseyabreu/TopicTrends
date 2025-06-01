import React, { Component, ErrorInfo, ReactNode } from 'react';
import { toast } from 'react-toastify';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
      errorInfo: null
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log the error to console and external service
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    // Update state with error info
    this.setState({
      error,
      errorInfo
    });

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Show toast notification
    toast.error('Something went wrong. Please refresh the page or try again.');

    // In production, you might want to send this to an error reporting service
    // Example: Sentry.captureException(error, { contexts: { react: errorInfo } });
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div style={{
          padding: '2rem',
          textAlign: 'center',
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '8px',
          margin: '1rem',
          color: '#991b1b'
        }}>
          <h2 style={{ marginBottom: '1rem', color: '#dc2626' }}>
            Oops! Something went wrong
          </h2>
          <p style={{ marginBottom: '1.5rem', color: '#7f1d1d' }}>
            We're sorry, but something unexpected happened. Please try refreshing the page.
          </p>
          
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={this.handleRetry}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#dc2626',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Try Again
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Refresh Page
            </button>
          </div>

          {/* Show error details in development */}
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <details style={{ 
              marginTop: '2rem', 
              textAlign: 'left',
              backgroundColor: '#f9fafb',
              padding: '1rem',
              borderRadius: '4px',
              border: '1px solid #d1d5db'
            }}>
              <summary style={{ cursor: 'pointer', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                Error Details (Development Only)
              </summary>
              <pre style={{ 
                fontSize: '0.875rem',
                overflow: 'auto',
                backgroundColor: '#1f2937',
                color: '#f9fafb',
                padding: '1rem',
                borderRadius: '4px',
                marginTop: '0.5rem'
              }}>
                <strong>Error:</strong> {this.state.error.toString()}
                {this.state.errorInfo && (
                  <>
                    <br /><br />
                    <strong>Component Stack:</strong>
                    {this.state.errorInfo.componentStack}
                  </>
                )}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

// Higher-order component for easier usage
export const withErrorBoundary = <P extends object>(
  Component: React.ComponentType<P>,
  fallback?: ReactNode,
  onError?: (error: Error, errorInfo: ErrorInfo) => void
) => {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary fallback={fallback} onError={onError}>
      <Component {...props} />
    </ErrorBoundary>
  );
  
  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;
  return WrappedComponent;
};

// Specialized error boundaries for different parts of the app
export const PageErrorBoundary: React.FC<{ children: ReactNode }> = ({ children }) => (
  <ErrorBoundary
    fallback={
      <div style={{
        minHeight: '50vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem'
      }}>
        <div style={{
          textAlign: 'center',
          maxWidth: '500px',
          padding: '2rem',
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '8px'
        }}>
          <h1 style={{ color: '#dc2626', marginBottom: '1rem' }}>Page Error</h1>
          <p style={{ color: '#7f1d1d', marginBottom: '1.5rem' }}>
            This page encountered an error. Please try refreshing or go back to the home page.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#dc2626',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Refresh Page
            </button>
            <button
              onClick={() => window.location.href = '/'}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Go Home
            </button>
          </div>
        </div>
      </div>
    }
    onError={(error, errorInfo) => {
      console.error('Page Error:', error, errorInfo);
      // Could send to error reporting service here
    }}
  >
    {children}
  </ErrorBoundary>
);

export const ComponentErrorBoundary: React.FC<{ children: ReactNode; componentName?: string }> = ({ 
  children, 
  componentName = 'Component' 
}) => (
  <ErrorBoundary
    fallback={
      <div style={{
        padding: '1rem',
        backgroundColor: '#fef2f2',
        border: '1px solid #fecaca',
        borderRadius: '4px',
        textAlign: 'center'
      }}>
        <p style={{ color: '#dc2626', fontSize: '0.875rem' }}>
          {componentName} failed to load
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: '0.5rem',
            padding: '0.25rem 0.75rem',
            backgroundColor: '#dc2626',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontSize: '0.75rem',
            cursor: 'pointer'
          }}
        >
          Refresh
        </button>
      </div>
    }
  >
    {children}
  </ErrorBoundary>
);

export default ErrorBoundary;
