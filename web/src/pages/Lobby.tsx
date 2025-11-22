import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

console.log('[Lobby.tsx] Module loaded');

const ROOMS = [
  { name: 'Plaza', slug: 'plaza', description: 'Meet in our shared hub world of poop 2.0. FUCK' },
  { name: 'Arcade', slug: 'arcade', description: 'Test gameplay loops and experiments.' },
  { name: 'Lounge', slug: 'lounge', description: 'Relax and chat with live avatars.' },
];

function Lobby() {
  const navigate = useNavigate();

  useEffect(() => {
    console.log('[Lobby] Component mounted');
  }, []);

  return (
    <div className="mx-auto flex max-w-4xl flex-1 flex-col gap-6 px-6 py-10">
      <header className="space-y-3 text-center">
        <h2 className="text-3xl font-semibold">Choose a space</h2>
        <p className="text-slate-400">
          Jump into an experimental room to preview avatar tracking and multiplayer sync.
        </p>
      </header>
      <div className="grid gap-6 sm:grid-cols-3">
        {ROOMS.map((room) => (
          <button
            key={room.slug}
            className="group flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900/80 p-5 text-left transition hover:border-slate-500 hover:bg-slate-900"
            onClick={() => navigate(`/rooms/${room.slug}`)}
          >
            <span className="text-xl font-semibold text-slate-100 group-hover:text-white">
              {room.name}
            </span>
            <span className="text-sm text-slate-400 group-hover:text-slate-300">{room.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default Lobby;

