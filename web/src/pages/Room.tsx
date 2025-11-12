import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Avatar } from '../world/Avatar';
import { SceneRoot } from '../world/scene';
import {
  PlayerState,
  WorldState,
  connectToRoom,
  disconnectFromRoom,
  subscribeState,
  writeMyState,
  getMyId,
  getRoomCodeInUse,
  getLastWriteAt,
} from '../multiplayer/playroom';
import { startWriteLoop, startHeartbeat, stopHeartbeat } from '../multiplayer/netloop';
import { startFaceTracking, stopFaceTracking } from '../tracking/face';
import { quantizeBlend } from '../multiplayer/netloop';
import { useKeyboardMovement, useJoystickMovement, updatePosition, MovementInput } from '../state/movement';
import { Joystick } from '../components/Joystick';

type LocalUiState = {
  cameraOn: boolean;
  faceBlur: boolean;
};

const initialUi: LocalUiState = { cameraOn: true, faceBlur: false };

const createFallbackPlayer = (): PlayerState => ({
  pos: { x: 0, y: 1, z: 0 },
  rotY: 0,
  anim: 'idle',
  head: { q: [0, 0, 0, 1] },
  blend: {},
});

function Room() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [world, setWorld] = useState<WorldState>({ players: {} });
  const [myId, setMyId] = useState<string>('none');
  const [roomCode, setRoomCode] = useState<string>('unknown');
  const [ui, setUi] = useState<LocalUiState>(initialUi);
  const [isConnecting, setIsConnecting] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const frameCounterRef = useRef(0);
  const worldRef = useRef(world);
  const faceBlurRef = useRef(ui.faceBlur);
  const keyboardInput = useKeyboardMovement();
  const [joystickInput] = useJoystickMovement();
  const lastUpdateTimeRef = useRef<number>(performance.now());
  const localPlayerStateRef = useRef<PlayerState | null>(null);
  const mountedRef = useRef(true);

  // Combine keyboard and joystick input (joystick takes priority)
  const movementInput: MovementInput = useMemo(() => {
    if (joystickInput.forward !== 0 || joystickInput.right !== 0) {
      return joystickInput;
    }
    return keyboardInput;
  }, [keyboardInput, joystickInput]);

  useEffect(() => {
    worldRef.current = world;
  }, [world]);

  useEffect(() => {
    faceBlurRef.current = ui.faceBlur;
  }, [ui.faceBlur]);

  useEffect(() => {
    if (!videoRef.current) {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.style.display = 'none';
      videoRef.current = video;
      document.body.appendChild(video);
    }

    return () => {
      const node = videoRef.current;
      if (node && node.parentElement) {
        node.parentElement.removeChild(node);
      }
      videoRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!slug) {
      return;
    }

    mountedRef.current = true;
    setIsConnecting(true);
    let stopWriteLoop: (() => void) | null = null;
    let unsubscribe: (() => void) | null = null;

    (async () => {
      try {
        console.log('[Room] Attempting to connect to room:', slug);
        const { myId: connectedMyId, roomCode: connectedRoomCode } = await connectToRoom(slug);
        console.log('[Room] connectToRoom resolved:', { connectedMyId, connectedRoomCode });
        
        if (!mountedRef.current) {
          console.log('[Room] Component unmounted, aborting');
          return;
        }
        
        setIsConnecting(false);
        setMyId(connectedMyId);
        setRoomCode(connectedRoomCode);
        console.log('[Room] Connected with player ID:', connectedMyId, 'roomCode:', connectedRoomCode);

        unsubscribe = subscribeState((state) => {
          console.log('[Room] State update received:', state);
          console.log('[Room] Players in state:', Object.keys(state.players || {}));
          
          // Merge local player state into world state for display
          const mergedState = { ...state };
          if (!mergedState.players) mergedState.players = {};
          
          if (localPlayerStateRef.current && connectedMyId) {
            mergedState.players[connectedMyId] = localPlayerStateRef.current;
            console.log('[Room] After merge, players:', Object.keys(mergedState.players));
          }
          setWorld(mergedState);
        });

        // Initialize local player state from world state or fallback
        const initialState = worldRef.current.players[connectedMyId] ?? createFallbackPlayer();
        console.log('[Room] Initial player state:', initialState);
        localPlayerStateRef.current = initialState;

        stopWriteLoop = startWriteLoop(() => {
          return localPlayerStateRef.current ?? createFallbackPlayer();
        });

        startHeartbeat(); // prove writes happen periodically
      } catch (error) {
        setIsConnecting(false);
        console.error('[Room] Failed to connect', error);
      }
    })();

    return () => {
      mountedRef.current = false;
      stopWriteLoop?.();
      unsubscribe?.();
      stopHeartbeat();
      disconnectFromRoom();
    };
  }, [slug]);

  const players = useMemo(() => Object.entries(world.players), [world.players]);

  const toggleCamera = () =>
    setUi((prev) => ({ ...prev, cameraOn: !prev.cameraOn }));

  const toggleFaceBlur = () =>
    setUi((prev) => ({ ...prev, faceBlur: !prev.faceBlur }));

  const leave = () => {
    navigate('/');
  };

  useEffect(() => {
    const video = videoRef.current;
    if (myId === 'none' || !video) {
      return;
    }

    let cancelled = false;

    const sendNeutral = () => {
      writeMyState({
        head: { q: [0, 0, 0, 1] },
        blend: {},
      }).catch((error) => {
        console.error('[Room] Failed to send neutral state', error);
      });
    };

    if (ui.cameraOn) {
      startFaceTracking(video, (headQ, blendRaw) => {
        if (cancelled) {
          return;
        }

        frameCounterRef.current =
          (frameCounterRef.current + 1) % 3;
        if (frameCounterRef.current !== 0) {
          return;
        }

        const processedBlend = { ...blendRaw };
        if (faceBlurRef.current) {
          Object.keys(processedBlend).forEach((key) => {
            if (key.startsWith('mouth') || key.startsWith('eye')) {
              processedBlend[key] = 0;
            }
          });
        }

        const quantizedBlend = quantizeBlend(processedBlend);
        const quantizedHead = headQ.map(
          (value) => Math.round(value * 100) / 100
        ) as [number, number, number, number];

        writeMyState({
          head: { q: quantizedHead },
          blend: quantizedBlend,
        }).catch((error) => {
          console.error('[Room] Failed to write face tracking state', error);
        });
      }).catch((error) => {
        console.error('[Room] Failed to start face tracking', error);
      });
    } else {
      stopFaceTracking();
      sendNeutral();
      frameCounterRef.current = 0;
    }

    return () => {
      cancelled = true;
      stopFaceTracking();
      sendNeutral();
      frameCounterRef.current = 0;
    };
  }, [ui.cameraOn, myId]);

  // Movement update loop
  useEffect(() => {
    if (myId === 'none') {
      return;
    }

    let animationFrame: number;
    let lastTime = performance.now();

    const updateMovement = (currentTime: number) => {
      const deltaTime = Math.min((currentTime - lastTime) / 1000, 0.033); // Convert to seconds, cap at 33ms
      lastTime = currentTime;

      const currentState = localPlayerStateRef.current ?? createFallbackPlayer();
      const updated = updatePosition(
        currentState.pos,
        currentState.rotY,
        movementInput,
        deltaTime
      );

      localPlayerStateRef.current = {
        ...currentState,
        ...updated,
      };

      animationFrame = requestAnimationFrame(updateMovement);
    };

    animationFrame = requestAnimationFrame(updateMovement);

    return () => {
      cancelAnimationFrame(animationFrame);
    };
  }, [myId, movementInput]);

  return (
    <div className="flex h-full flex-col">
      {/* Loading Overlay */}
      {isConnecting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
          <div className="text-center">
            <div className="mb-4 text-lg font-medium text-slate-300">Connecting to room...</div>
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-slate-600 border-t-slate-300"></div>
            <div className="mt-4 text-sm text-slate-400">This may take a few seconds</div>
          </div>
        </div>
      )}

      {/* Debug HUD */}
      <div className="absolute left-2 top-2 z-10 bg-black/60 text-xs text-white px-2 py-1 rounded space-y-0.5">
        <div>roomCode: {roomCode || getRoomCodeInUse()}</div>
        <div>myId: {myId || getMyId() || 'none'}</div>
        <div>players: {Object.keys(world.players || {}).join(', ') || 'none'}</div>
        <div>lastWrite: {getLastWriteAt() ? new Date(getLastWriteAt()).toLocaleTimeString() : 'never'}</div>
      </div>

      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-6 py-4">
        <div>
          <h2 className="text-2xl font-semibold capitalize">{slug}</h2>
          <p className="text-sm text-slate-400">
            {players.length} player{players.length === 1 ? '' : 's'} active
          </p>
        </div>
        <div className="flex gap-3">
          <button
            className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-medium transition hover:bg-slate-700"
            onClick={toggleCamera}
          >
            Camera {ui.cameraOn ? 'On' : 'Off'}
          </button>
          <button
            className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-medium transition hover:bg-slate-700"
            onClick={toggleFaceBlur}
          >
            Face Blur {ui.faceBlur ? 'On' : 'Off'}
          </button>
          <button
            className="rounded-md border border-rose-800 bg-rose-900/80 px-3 py-2 text-sm font-medium text-rose-100 transition hover:bg-rose-900"
            onClick={leave}
          >
            Leave
          </button>
        </div>
      </div>

      <div className="relative flex-1">
        <SceneRoot>
          {players.map(([id, playerState]) => (
            <Avatar key={id} playerId={id} player={playerState} isLocal={id === myId} />
          ))}
          {myId !== 'none' && !world.players[myId] ? (
            <Avatar key="local-fallback" playerId={myId} player={createFallbackPlayer()} isLocal={true} />
          ) : null}
        </SceneRoot>
        <Joystick />
      </div>
    </div>
  );
}

export default Room;

