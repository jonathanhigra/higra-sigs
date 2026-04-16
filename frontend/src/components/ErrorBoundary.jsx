import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/feed';
  };

  render() {
    if (this.state.hasError) {
      if (this.props.compact) {
        return (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '64px 24px', textAlign: 'center',
            color: 'var(--text-primary, #f1f1f6)',
          }}>
            <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12, opacity: 0.8 }}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <h3 style={{ margin: '0 0 6px', fontSize: '1rem', fontWeight: 700 }}>Algo deu errado</h3>
            <p style={{ margin: '0 0 20px', color: 'var(--text-muted, #9a9aa2)', fontSize: '0.85rem', maxWidth: 340, lineHeight: 1.5 }}>
              Ocorreu um erro nesta seção. Tente recarregar.
            </p>
            <button onClick={this.handleReload} style={{
              background: 'var(--accent, #1d9bf0)', color: '#fff', border: 'none', borderRadius: 8,
              padding: '8px 20px', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer',
            }}>
              Recarregar
            </button>
          </div>
        );
      }

      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          minHeight: '100vh', padding: '24px', textAlign: 'center',
          background: 'var(--feed-bg, #0d0d10)', color: '#f1f1f6',
        }}>
          <svg viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 16 }}>
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          <h2 style={{ margin: '0 0 8px', fontSize: '1.3rem', fontWeight: 700 }}>Algo deu errado</h2>
          <p style={{ margin: '0 0 24px', color: '#9a9aa2', fontSize: '0.9rem', maxWidth: 400, lineHeight: 1.5 }}>
            Ocorreu um erro inesperado. Tente recarregar a página ou voltar ao início.
          </p>
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={this.handleReload} style={{
              background: '#1d9bf0', color: '#fff', border: 'none', borderRadius: 999,
              padding: '10px 24px', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer',
            }}>
              Recarregar
            </button>
            <button onClick={this.handleGoHome} style={{
              background: 'transparent', color: '#1d9bf0', border: '1px solid #26262b', borderRadius: 999,
              padding: '10px 24px', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer',
            }}>
              Ir ao Início
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
