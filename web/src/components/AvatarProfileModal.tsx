import { useEffect } from 'react';
import type { PlayerProfile } from '../types/playerProfile';

type AvatarProfileModalProps = {
  playerId: string | null;
  screenPosition: { x: number; y: number } | null;
  onClose: () => void;
  profile: PlayerProfile | null;
};

export function AvatarProfileModal({
  playerId,
  screenPosition,
  onClose,
  profile,
}: AvatarProfileModalProps) {
  // Handle ESC key to close modal
  useEffect(() => {
    if (!playerId) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [playerId, onClose]);

  if (!playerId || !screenPosition) {
    return null;
  }

  const playerName = profile?.name || 'Player';
  const playerPhoto = profile?.photo || '';
  const hasPhoto = playerPhoto && playerPhoto !== 'false';

  // Calculate modal position (offset above avatar head)
  const modalOffsetY = -100; // 100px above avatar head
  const modalX = screenPosition.x;
  const modalY = screenPosition.y + modalOffsetY;

  // Keep modal within viewport bounds
  const modalWidth = 320;
  const modalHeight = 400; // Approximate height
  const padding = 20;
  
  let finalX = modalX - modalWidth / 2; // Center horizontally on avatar
  let finalY = modalY;

  // Clamp to viewport
  if (finalX < padding) {
    finalX = padding;
  } else if (finalX + modalWidth > window.innerWidth - padding) {
    finalX = window.innerWidth - modalWidth - padding;
  }

  if (finalY < padding) {
    finalY = screenPosition.y + 50; // Show below avatar if not enough space above
  } else if (finalY + modalHeight > window.innerHeight - padding) {
    finalY = window.innerHeight - modalHeight - padding;
  }

  return (
    <>
      {/* Backdrop overlay */}
      <div
        className="fixed inset-0 bg-black/30 z-[9998]"
        onClick={onClose}
        style={{ pointerEvents: 'auto' }}
      />

      {/* Modal card */}
      <div
        className="fixed bg-white rounded-lg shadow-2xl z-[9999] overflow-hidden"
        style={{
          left: `${finalX}px`,
          top: `${finalY}px`,
          width: `${modalWidth}px`,
          maxWidth: 'calc(100vw - 40px)',
          pointerEvents: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200 transition-colors z-10"
          aria-label="Close"
        >
          <svg
            className="w-5 h-5 text-gray-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        {/* Profile picture */}
        <div className="w-full pt-6 pb-4 flex justify-center">
          <div className="w-24 h-24 rounded-full overflow-hidden bg-gray-200 border-4 border-white shadow-lg">
            {hasPhoto ? (
              <img
                src={playerPhoto}
                alt={playerName}
                className="w-full h-full object-cover"
                onError={(e) => {
                  // Fallback to placeholder if image fails to load
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-400 to-purple-500 text-white text-2xl font-bold">
                {playerName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        </div>

        {/* Username */}
        <div className="px-6 pb-2 text-center">
          <h2 className="text-xl font-bold text-gray-800 truncate">{playerName}</h2>
        </div>

        {/* Bio section */}
        <div className="px-6 py-4 border-t border-gray-200">
          <h3 className="text-sm font-semibold text-gray-600 mb-2">Bio</h3>
          <p className="text-sm text-gray-500">No bio available</p>
        </div>

        {/* Action buttons */}
        <div className="px-6 py-4 border-t border-gray-200 space-y-2">
          <button
            className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors active:bg-blue-800"
            style={{ minHeight: '44px' }} // Mobile-friendly touch target
            onClick={() => {
              console.log('[AvatarProfileModal] Invite to video chat clicked for:', playerId);
              // Placeholder - functionality to be added later
            }}
          >
            Invite to Video Chat
          </button>
          <button
            className="w-full py-3 px-4 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors active:bg-red-800"
            style={{ minHeight: '44px' }} // Mobile-friendly touch target
            onClick={() => {
              console.log('[AvatarProfileModal] Report clicked for:', playerId);
              // Placeholder - functionality to be added later
            }}
          >
            Report
          </button>
        </div>
      </div>
    </>
  );
}
