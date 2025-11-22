import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { useEffect } from 'react';
import Lobby from './pages/Lobby';
import Room from './pages/Room';

const BUILD_ID = 'ios-v4-2025-11-22-01';

<h1>Avatar Rooms – {BUILD_ID}</h1>


console.log('[app.tsx] Module loaded');

function App() {
  useEffect(() => {
    console.log('[App] Component mounted');
    return () => {
      console.log('[App] Component unmounting');
    };
  }, []);

  console.log('[App] Rendering...');
  const buildVersion = Date.now(); // Force update

  return (
    <BrowserRouter>
      <div 
        key={buildVersion}
        className="fixed inset-0 bg-black text-slate-100 flex flex-col overflow-hidden" 
        style={{ 
          backgroundColor: '#000000', 
          color: '#f1f5f9',
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          paddingLeft: 'env(safe-area-inset-left)',
          paddingRight: 'env(safe-area-inset-right)'
        }}
      >
        {/* Header removed for mobile optimization */}
        <main className="flex-1 relative overflow-hidden" style={{ flex: '1', height: '100%', width: '100%' }}>
          <Routes>
            <Route path="/" element={<Lobby />} />
            <Route path="/rooms/:slug" element={<Room />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;

