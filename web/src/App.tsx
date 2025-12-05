import { BrowserRouter, Route, Routes, useNavigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import Lobby from './pages/Lobby';
import Room from './pages/Room';
import SnakeTest from './pages/SnakeTest';
// @ts-ignore - Package types may not be available until installed
import { AvatarCreator } from '@readyplayerme/react-avatar-creator';
import { getRandomExpression } from './utils/helpers';

console.log('[app.tsx] Module loaded');

function AvatarCreatorWrapper() {
  const navigate = useNavigate();
  const location = useLocation();
  const roomSlug = (location.state as any)?.roomSlug || 'plaza';

  return (
    <AvatarCreator
      subdomain="playroom"
      className="fixed top-0 left-0 z-10 w-screen h-screen"
      onAvatarExported={(event: any) => {
        const avatarUrl = event.data.url;
        const avatarId = event.data.avatarId;
        const avatarImage = `https://models.readyplayer.me/${avatarId}.png?expression=${getRandomExpression()}&size=512`;
        
        // Store avatar data in localStorage for Room to use
        localStorage.setItem('rpm_avatarUrl', avatarUrl);
        localStorage.setItem('rpm_avatarImg', avatarImage);
        localStorage.setItem('rpm_avatarId', avatarId);
        
        // Navigate to the room
        navigate(`/rooms/${roomSlug}`, { 
          state: { 
            avatarUrl: avatarUrl.split('?')[0] + '?' + new Date().getTime() + '&meshLod=2',
            avatarImg: avatarImage 
          } 
        });
      }}
    />
  );
}

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
            <Route path="/avatar/:slug" element={<AvatarCreatorWrapper />} />
            <Route path="/rooms/:slug" element={<Room />} />
            <Route path="/snake" element={<SnakeTest />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;

