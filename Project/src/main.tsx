import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

const rootElement = document.getElementById('root');

function renderFatalError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error('[v0] App failed to start:', error);

  if (rootElement) {
    rootElement.innerHTML = `
      <main style="min-height:100vh;display:grid;place-items:center;padding:2rem;background:#fff;color:#0f172a;font-family:Inter,system-ui,sans-serif;text-align:center">
        <div style="max-width:42rem">
          <h1 style="margin:0 0 .75rem;font-size:1.5rem">TradeND could not start</h1>
          <p style="margin:0;color:#475569">Please reload the page. If the problem persists, contact support.</p>
          <details style="margin-top:1rem;text-align:left;color:#64748b;font-size:.875rem"><summary>Technical details</summary><pre style="white-space:pre-wrap">${message.replace(/[&<>]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[character] ?? character))}</pre></details>
        </div>
      </main>
    `;
  }
}

if (!rootElement) {
  renderFatalError(new Error('Missing #root element'));
} else {
  import('./App.tsx')
    .then(({ default: App }) => {
      createRoot(rootElement).render(
        <StrictMode>
          <App />
        </StrictMode>
      );
    })
    .catch(renderFatalError);
}
