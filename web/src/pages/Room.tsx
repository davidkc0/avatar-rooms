import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Avatar } from '../world/Avatar';
import { SceneRoot, useScene } from '../world/scene';
import { Vector3 } from '@babylonjs/core';
import { PlayerController } from '../state/PlayerController';
import {
  type PlayerState,
  type WorldState,
  connectToRoom,
  disconnectFromRoom,
  subscribeState,
  writeMyState,
} from '../multiplayer/playroom';
import { startWriteLoop, startHeartbeat, stopHeartbeat } from '../multiplayer/netloop';
import { startFaceTracking, stopFaceTracking } from '../tracking/face';
import { quantizeBlend } from '../multiplayer/netloop';
import { useKeyboardMovement, useJoystickMovement, type MovementInput } from '../state/movement';
import { Joystick } from '../components/Joystick';

type LocalUiState = {
  cameraOn: boolean;
  faceBlur: boolean;
};

const initialUi: LocalUiState = { cameraOn: true, faceBlur: false };

const createFallbackPlayer = (): PlayerState => ({
  pos: { x: 0, y: 0, z: 0 },
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
  const [ui, setUi] = useState<LocalUiState>(initialUi);
  const [isConnecting, setIsConnecting] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const frameCounterRef = useRef(0);
  const worldRef = useRef(world);
  const faceBlurRef = useRef(ui.faceBlur);
  const keyboardInput = useKeyboardMovement();
  const [joystickInput] = useJoystickMovement();
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
        console.log('[Room] Connected with player ID:', connectedMyId, 'roomCode:', connectedRoomCode);

        // Initialize local player state from world state or fallback
        const initialState = worldRef.current.players[connectedMyId] ?? createFallbackPlayer();
        console.log('[Room] Initial player state:', initialState);
        localPlayerStateRef.current = initialState;

        // Immediately add local player to world state for display
        setWorld((prev) => {
          const updated = { ...prev };
          if (!updated.players) updated.players = {};
          updated.players[connectedMyId] = initialState;
          console.log('[Room] Added local player to world state:', Object.keys(updated.players));
          return updated;
        });

        unsubscribe = subscribeState((state) => {
          console.log('[Room] State update received:', state);
          console.log('[Room] Players in state:', Object.keys(state.players || {}));
          
          // Merge local player state into world state for display
          const mergedState = { ...state };
          if (!mergedState.players) mergedState.players = {};
          
          // Always use the latest local player state
          if (localPlayerStateRef.current && connectedMyId) {
            mergedState.players[connectedMyId] = localPlayerStateRef.current;
            console.log('[Room] After merge, players:', Object.keys(mergedState.players));
          }
          setWorld(mergedState);
        });
        
        // Also update world state periodically from local player state
        const worldUpdateInterval = setInterval(() => {
          if (localPlayerStateRef.current && connectedMyId) {
            setWorld((prev) => {
              const updated = { ...prev };
              if (!updated.players) updated.players = {};
              // Only update if position actually changed
              const current = updated.players[connectedMyId];
              const latest = localPlayerStateRef.current;
              
              if (!latest) return prev;

              if (
                !current ||
                current.pos.x !== latest.pos.x ||
                current.pos.y !== latest.pos.y ||
                current.pos.z !== latest.pos.z ||
                current.rotY !== latest.rotY
              ) {
                updated.players[connectedMyId] = latest;
                return updated;
              }
              return prev;
            });
          }
        }, 50); // Update every 50ms
        
        // Store interval ID for cleanup
        (unsubscribe as any).worldUpdateInterval = worldUpdateInterval;

        // Write initial state immediately to ensure we appear in the room
        writeMyState(initialState).catch((error) => {
          console.error('[Room] Failed to write initial state', error);
        });

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
      if (unsubscribe) {
        unsubscribe();
        // Clear world update interval if it exists
        if ((unsubscribe as any).worldUpdateInterval) {
          clearInterval((unsubscribe as any).worldUpdateInterval);
        }
      }
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

  // Movement update loop now handled by PlayerController component inside SceneRoot

  // Camera follow effect - only works inside SceneRoot
  const CameraFollow = () => {
    const { scene, camera } = useScene();
    
    useEffect(() => {
      if (myId === 'none') return;
      
      const observer = scene.onBeforeRenderObservable.add(() => {
        // Access localPlayerStateRef from parent scope
        const localState = localPlayerStateRef.current;
        if (localState && camera) {
          // Update camera target to follow player (offset by 1 unit up for better view)
          camera.setTarget(new Vector3(localState.pos.x, localState.pos.y + 1, localState.pos.z));
        }
      });
      
      return () => {
        scene.onBeforeRenderObservable.remove(observer);
      };
    }, [scene, camera, myId]);
    
    return null;
  };

  return (
    <div className="relative h-full w-full">
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

      {/* Mobile Controls Overlay */}
      <div className="absolute top-4 right-4 z-20 flex flex-col gap-3">
        <button
          className="h-12 w-12 rounded-full bg-slate-800/80 border border-slate-600 text-white flex items-center justify-center shadow-lg backdrop-blur active:bg-slate-700"
          onClick={toggleCamera}
        >
          {/* Camera Icon */}
          {ui.cameraOn ? (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-slate-400">
              <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
            </svg>
          )}
        </button>
        
        <button
          className="h-12 w-12 rounded-full bg-slate-800/80 border border-slate-600 text-white flex items-center justify-center shadow-lg backdrop-blur active:bg-slate-700"
          onClick={toggleFaceBlur}
        >
          {/* Face Blur Icon (Sparkles/Mask) */}
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke={ui.faceBlur ? "currentColor" : "#94a3b8"} className="w-6 h-6">
             <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 0 1-6.364 0M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Z" />
          </svg>
        </button>

        <button
          className="h-12 w-12 rounded-full bg-rose-900/80 border border-rose-700 text-white flex items-center justify-center shadow-lg backdrop-blur active:bg-rose-800 mt-4"
          onClick={leave}
        >
          {/* Exit Icon */}
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
          </svg>
        </button>
      </div>

      <div className="absolute inset-0">
        <SceneRoot>
          <CameraFollow />
          <PlayerController 
            myId={myId}
            movementInput={movementInput}
            localPlayerStateRef={localPlayerStateRef}
            createFallbackPlayer={createFallbackPlayer}
          />
          {players.length > 0 ? (
            players.map(([id, playerState]) => {
              console.log('[Room] Rendering Avatar for player:', id, 'state:', playerState);
              return (
                <Avatar 
                  key={id} 
                  playerId={id} 
                  player={playerState} 
                  isLocal={id === myId}
                  videoElement={id === myId ? videoRef.current || undefined : undefined}
                  getLocalState={id === myId ? () => localPlayerStateRef.current : undefined}
                />
              );
            })
          ) : (
            myId !== 'none' && (
              <Avatar 
                key="local-fallback" 
                playerId={myId} 
                player={createFallbackPlayer()} 
                isLocal={true}
                videoElement={videoRef.current || undefined}
                getLocalState={() => localPlayerStateRef.current}
              />
            )
          )}
        </SceneRoot>
        <Joystick />
      </div>
    </div>
  );
}

export default Room;

