import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

console.log('[main.tsx] Starting app initialization...');

// Add error boundary at the root level
window.addEventListener('error', (event) => {
  console.error('[GLOBAL ERROR]', event.error);
  document.body.innerHTML = `
    <div style="padding: 20px; font-family: monospace; background: #1e1e1e; color: #ff6b6b; min-height: 100vh;">
      <h1 style="color: #ff6b6b;">❌ JavaScript Error</h1>
      <pre style="background: #2d2d2d; padding: 15px; border-radius: 5px; overflow: auto;">
${event.error?.stack || event.error?.message || 'Unknown error'}
      </pre>
      <p>Check the browser console for more details.</p>
    </div>
  `;
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[UNHANDLED PROMISE REJECTION]', event.reason);
});

(async () => {
  try {
    console.log('[main.tsx] Importing App component...');
    const { default: App } = await import('./app');
    console.log('[main.tsx] App component imported successfully');

    const rootElement = document.getElementById('root');
    console.log('[main.tsx] Root element:', rootElement);

    if (!rootElement) {
      throw new Error('Root element not found! Make sure index.html has <div id="root"></div>');
    }

    console.log('[main.tsx] Creating React root...');
    const root = createRoot(rootElement);
    console.log('[main.tsx] React root created, rendering...');

    root.render(
      <StrictMode>
        <App />
      </StrictMode>
    );
    console.log('[main.tsx] ✅ App rendered successfully!');
  } catch (error) {
    console.error('[main.tsx] ❌ FATAL ERROR:', error);
    document.body.innerHTML = `
      <div style="padding: 20px; font-family: monospace; background: #1e1e1e; color: #ff6b6b; min-height: 100vh;">
        <h1 style="color: #ff6b6b;">❌ Failed to Initialize App</h1>
        <pre style="background: #2d2d2d; padding: 15px; border-radius: 5px; overflow: auto; white-space: pre-wrap;">
${error instanceof Error ? error.stack : String(error)}
        </pre>
        <p style="margin-top: 20px;">Check the browser console (F12) for more details.</p>
      </div>
    `;
  }
})();
