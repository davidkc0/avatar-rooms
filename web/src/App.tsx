import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Lobby from './pages/Lobby';
import Room from './pages/Room';

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        <header className="border-b border-slate-800 bg-slate-900/80 px-6 py-4">
          <h1 className="text-lg font-semibold tracking-wide">Avatar Rooms (MVP)</h1>
        </header>
        <main className="flex-1">
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

