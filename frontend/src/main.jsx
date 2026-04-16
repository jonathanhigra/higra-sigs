import React from 'react';
import ReactDOM from 'react-dom/client';
import 'bootstrap/dist/css/bootstrap.min.css';
import './styles/tokens.css';
import './styles/theme-dark.css';
import './styles/theme-light.css';
import './bootstrap.overrides.css';
import './styles/global.css';
import App from './App.jsx';

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

// Handlers globais para capturar erros
window.addEventListener('error', (e) => {
  console.error('Global uncaught error:', e.message, e.filename, e.lineno);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled promise rejection:', e.reason);
});
