import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

const root = ReactDOM.createRoot(rootElement);

const showRootFailure = (detail: string) => {
  rootElement.innerHTML = `
    <div style="min-height:100vh;display:grid;place-items:center;background:#fdf7fb;padding:24px;font-family:sans-serif;">
      <div style="max-width:640px;background:rgba(255,255,255,0.92);border:1px solid #f2d4e5;border-radius:28px;padding:32px;box-shadow:0 16px 50px rgba(15,23,42,0.08);">
        <h1 style="margin:0 0 12px;color:#111827;font-size:28px;font-weight:800;">LinguaFlow hit a loading problem.</h1>
        <p style="margin:0 0 16px;color:#475569;line-height:1.6;">
          The app stayed online, but the interface failed to finish loading.
        </p>
        <pre style="margin:0;white-space:pre-wrap;word-break:break-word;background:#fff6fb;color:#be185d;border-radius:18px;padding:16px;font-size:14px;">${detail}</pre>
      </div>
    </div>
  `;
};

window.addEventListener('error', (event) => {
  const detail = event.error instanceof Error ? event.error.message : String(event.message || 'Unknown window error');
  console.error('Window error', event.error || event.message);
  showRootFailure(detail);
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason instanceof Error ? event.reason.message : String(event.reason || 'Unknown promise rejection');
  console.error('Unhandled promise rejection', event.reason);
  showRootFailure(reason);
});

try {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} catch (error) {
  const detail = error instanceof Error ? error.message : 'Unknown render error';
  console.error('Root render error', error);
  showRootFailure(detail);
}
