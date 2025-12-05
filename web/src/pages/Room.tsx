import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { getStoreValue } from '../utils/helpers';
import { Avatar } from '../world/Avatar';
import { SceneRoot, useScene } from '../world/scene';
import { Walls } from '../world/Walls';
import { Whiteboard } from '../world/Whiteboard';
import { WhiteboardButton } from '../world/WhiteboardButton';
import { WhiteboardCanvas } from '../components/WhiteboardCanvas';
import { ArcadeButton } from '../world/ArcadeButton';
import { SnakeGameCanvas } from '../games/snake/SnakeGameCanvas';
import { Furniture } from '../world/Furniture';
import { Vector3 } from '@babylonjs/core';
import { AbstractMesh, DynamicTexture } from '@babylonjs/core';
import { PlayerController } from '../state/PlayerController';
import {
  type PlayerState,
  type WorldState,
  connectToRoom,
  disconnectFromRoom,
  subscribeState,
  writeMyState,
} from '../multiplayer/playroom';
import { startHeartbeat, stopHeartbeat } from '../multiplayer/netloop';
import { startFaceTracking, stopFaceTracking } from '../tracking/face';
import { quantizeBlend } from '../multiplayer/netloop';
import { useKeyboardMovement, useJoystickMovement, type MovementInput } from '../state/movement';
import { VoiceChat } from '../components/VoiceChat';
import { Joystick } from '../components/Joystick';
import { getMyId } from '../multiplayer/playroom';
import { subscribeLeaderboard, submitScore, type LeaderboardState } from '../multiplayer/gameSync';
import '../utils/helpers'; // Import to ensure hashCode is available

type LocalUiState = {
  cameraOn: boolean;
  faceBlur: boolean;
  drawingMode: boolean;
  gameMode: boolean;
};

const initialUi: LocalUiState = { cameraOn: true, faceBlur: false, drawingMode: false, gameMode: false };

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
  const location = useLocation();
  const [world, setWorld] = useState<WorldState>({ players: {} });
  const [myId, setMyId] = useState<string>('none');
  const [roomCode, setRoomCode] = useState<string>('');
  const [ui, setUi] = useState<LocalUiState>(initialUi);
  const [isConnecting, setIsConnecting] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const frameCounterRef = useRef(0);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const worldRef = useRef(world);
  const worldStateRef = useRef<WorldState>({ players: {} });
  const faceBlurRef = useRef(ui.faceBlur);
  const keyboardInput = useKeyboardMovement();
  const [joystickInput] = useJoystickMovement();
  const localPlayerStateRef = useRef<PlayerState | null>(null);
  const mountedRef = useRef(true);
  const [whiteboardMesh, setWhiteboardMesh] = useState<AbstractMesh | null>(null);
  const drawingModeRef = useRef(false);
  const gameModeRef = useRef(false);
  const whiteboardTextureRef = useRef<DynamicTexture | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardState>({ scores: [], version: 0 });
  
  // Update refs when modes change
  useEffect(() => {
    drawingModeRef.current = ui.drawingMode;
  }, [ui.drawingMode]);

  useEffect(() => {
    gameModeRef.current = ui.gameMode;
  }, [ui.gameMode]);

  // Stable callbacks for whiteboard
  const handleExitDrawingMode = useCallback(() => {
    setUi(prev => ({ ...prev, drawingMode: false }));
  }, []);

  const handleToggleDrawingMode = useCallback(() => {
    setUi(prev => ({ ...prev, drawingMode: !prev.drawingMode }));
  }, []);

  const handleTextureUpdated = useCallback(() => {
    // Force a re-render or update to ensure texture is visible
    console.log('[Room] Texture updated, forcing material refresh');
  }, []);

  // Game mode handlers
  const handleToggleGameMode = useCallback(() => {
    setUi(prev => ({ ...prev, gameMode: !prev.gameMode }));
  }, []);

  const handleExitGameMode = useCallback(() => {
    setUi(prev => ({ ...prev, gameMode: false }));
  }, []);

  const handleGameOver = useCallback(async (score: number) => {
    const myId = getMyId();
    if (!myId) {
      console.warn('[Room] Cannot submit score: no player ID');
      return;
    }

    // Get player name (use a default if not available)
    const playerName = 'Player'; // TODO: Get actual player name from Playroomkit
    
    try {
      await submitScore(score, playerName, myId);
      console.log('[Room] Score submitted:', score);
    } catch (error) {
      console.error('[Room] Failed to submit score', error);
    }
  }, []);

  // Subscribe to leaderboard updates
  useEffect(() => {
    const unsubscribe = subscribeLeaderboard((state) => {
      setLeaderboard(state);
    });
    return unsubscribe;
  }, []);

  // Combine keyboard and joystick input (joystick takes priority)
  // Disable movement when in drawing mode or game mode
  const movementInput: MovementInput = useMemo(() => {
    if (ui.drawingMode || ui.gameMode) {
      return { forward: 0, right: 0 }; // No movement in drawing/game mode
    }
    if (joystickInput.forward !== 0 || joystickInput.right !== 0) {
      return joystickInput;
    }
    return keyboardInput;
  }, [keyboardInput, joystickInput, ui.drawingMode, ui.gameMode]);

  useEffect(() => {
    worldRef.current = world;
    worldStateRef.current = world;
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

        // Get avatar data from location state or localStorage
        const locationState = location.state as any;
        const storedAvatarUrl = locationState?.avatarUrl || getStoreValue('rpm_avatarUrl');
        const storedAvatarImg = locationState?.avatarImg || getStoreValue('rpm_avatarImg');
        
        // Initialize local player state from world state or fallback
        const initialState = worldRef.current.players[connectedMyId] ?? createFallbackPlayer();
        console.log('[Room] Initial player state:', initialState);
        
        // Build avatar URL with timestamp to avoid caching (preserve existing params)
        let avatarUrl: string | undefined = undefined;
        if (storedAvatarUrl) {
          try {
            const url = new URL(storedAvatarUrl);
            url.searchParams.set('meshLod', '2');
            url.searchParams.set('t', String(Date.now()));
            avatarUrl = url.toString();
          } catch (err) {
            console.warn('[Room] Invalid avatar URL, using raw value', err);
            avatarUrl = storedAvatarUrl;
          }
        }
        
        localPlayerStateRef.current = {
          ...initialState,
          ...(avatarUrl && { avatarUrl }),
          ...(storedAvatarImg && { avatarImg: storedAvatarImg }),
        };
        
        console.log('[Room] Using avatar URL:', avatarUrl);

        // Immediately add local player to world state for display (use localPlayerStateRef to include avatarUrl)
        setWorld((prev) => {
          const updated = { ...prev };
          if (!updated.players) updated.players = {};
          updated.players[connectedMyId] = {
            ...localPlayerStateRef.current!,
            pos: { ...localPlayerStateRef.current!.pos },
            head: { ...localPlayerStateRef.current!.head },
            blend: { ...localPlayerStateRef.current!.blend },
          };
          return updated;
        });

        unsubscribe = subscribeState((state) => {
          const playerIds = Object.keys(state.players || {});
          
          // Merge local player state into world state for display
          const mergedState = { ...state };
          if (!mergedState.players) mergedState.players = {};
          
          // Always use the latest local player state (but preserve all remote players from state)
          if (localPlayerStateRef.current && connectedMyId) {
            mergedState.players[connectedMyId] = localPlayerStateRef.current;
          }
          
          // Only update if state actually changed (prevent unnecessary re-renders)
          const currentWorld = worldStateRef.current;
          const hasChanges = 
            !currentWorld ||
            JSON.stringify(currentWorld.players) !== JSON.stringify(mergedState.players);
          
          if (hasChanges) {
        worldStateRef.current = mergedState;
        setWorld(mergedState);
          }
        });
        
        // Also update world state periodically from local player state
        // This ensures local player updates are reflected immediately, but preserves remote players
        // Write initial state immediately to ensure we appear in the room
        writeMyState(localPlayerStateRef.current!).catch((error) => {
          console.error('[Room] Failed to write initial state', error);
        });

        startHeartbeat(); // prove writes happen periodically
      } catch (error) {
        setIsConnecting(false);
        console.error('[Room] Failed to connect', error);
      }
    })();

    return () => {
      mountedRef.current = false;

      // Unsubscribe from Playroom state
      if (unsubscribe) {
        unsubscribe();
      }

      // Clear local world / player state so avatars are removed immediately
      worldStateRef.current = { players: {} };
      worldRef.current = { players: {} };
      localPlayerStateRef.current = null;
      setWorld({ players: {} });
      setMyId('none');

      stopHeartbeat();
      
      // Disconnect from Playroom (this will clear our state for other clients)
      disconnectFromRoom().catch((error) => {
        console.error('[Room] Error disconnecting from room:', error);
      });
    };
  }, [slug]);

  // Movement write loop (20 Hz) - replaces startStateUpdateLoop in viewModel
  useEffect(() => {
    if (myId === 'none') return;

    let lastSentState: PlayerState | null = null;
    let lastLogTime = 0;

    const intervalId = setInterval(() => {
      const state = localPlayerStateRef.current;
      if (!state) {
        return;
      }

      const movementChanged =
        !lastSentState ||
        state.pos.x !== lastSentState.pos.x ||
        state.pos.y !== lastSentState.pos.y ||
        state.pos.z !== lastSentState.pos.z ||
        state.rotY !== lastSentState.rotY ||
        state.anim !== lastSentState.anim;

      if (!movementChanged) {
        return;
      }

      writeMyState({
        pos: state.pos,
        rotY: state.rotY,
        anim: state.anim,
      })
        .then(() => {
          lastSentState = {
            ...state,
            pos: { ...state.pos },
            head: { ...state.head },
            blend: { ...state.blend },
          };

          const now = performance.now();
          if (now - lastLogTime > 1000) {
            console.log('[Room] ✍️ Wrote movement state', {
              pos: lastSentState.pos,
              rotY: lastSentState.rotY,
              anim: lastSentState.anim,
            });
            lastLogTime = now;
          }
        })
        .catch((error) => {
          console.error('[Room] Failed to write movement state', error);
        });
    }, 50); // 20 Hz

    return () => clearInterval(intervalId);
  }, [myId]);

  const players = useMemo(() => Object.entries(world.players), [world.players]);

  const toggleCamera = () =>
    setUi((prev) => ({ ...prev, cameraOn: !prev.cameraOn }));

  const toggleFaceBlur = () =>
    setUi((prev) => ({ ...prev, faceBlur: !prev.faceBlur }));

  const leave = () => {
    navigate('/');
  };
  
  // Handle ESC key to exit drawing mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && ui.drawingMode) {
        e.preventDefault();
        e.stopPropagation();
        console.log('[Room] ESC pressed, exiting drawing mode');
        setUi(prev => ({ ...prev, drawingMode: false }));
      }
    };
    
    if (ui.drawingMode || ui.gameMode) {
      window.addEventListener('keydown', handleKeyDown, true); // Use capture phase
      return () => {
        window.removeEventListener('keydown', handleKeyDown, true);
      };
    }
  }, [ui.drawingMode]);

  useEffect(() => {
    const video = videoRef.current;
    if (myId === 'none' || !video) {
      return;
    }

    let cancelled = false;

    const sendNeutral = () => {
      const neutralHead = { q: [0, 0, 0, 1] as [number, number, number, number] };

      writeMyState({
        head: neutralHead,
        blend: {},
        tvHeadEnabled: false,
        agoraVideoUid: undefined,
      }).catch((error) => {
        console.error('[Room] Failed to send neutral state', error);
      });

      if (localPlayerStateRef.current) {
        localPlayerStateRef.current.head = neutralHead;
        localPlayerStateRef.current.blend = {};
        localPlayerStateRef.current.tvHeadEnabled = false;
        localPlayerStateRef.current.agoraVideoUid = undefined;
      }
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

        // CRITICAL: Only write face tracking data (head, blend) - NOT tvHeadEnabled
        // tvHeadEnabled is written immediately when camera stream is obtained
        writeMyState({
          head: { q: quantizedHead },
          blend: quantizedBlend,
        }).catch((error) => {
          console.error('[Room] Failed to write face tracking state', error);
        });

        // Keep local ref in sync so Avatar sees the values immediately
        if (localPlayerStateRef.current) {
          localPlayerStateRef.current.head = { q: quantizedHead };
          localPlayerStateRef.current.blend = quantizedBlend;
        }
      })
        .then((stream) => {
          setCameraStream(stream);
          
        // CRITICAL: Immediately write tvHeadEnabled to Playroom when camera stream is obtained
        writeMyState({
          tvHeadEnabled: true,
          agoraVideoUid: myId,
        })
          .then(() => {
            if (localPlayerStateRef.current) {
              localPlayerStateRef.current.tvHeadEnabled = true;
              localPlayerStateRef.current.agoraVideoUid = myId;
            }
            console.log('[Room] ✅ Wrote tvHeadEnabled=true to Playroom');
          })
          .catch((error) => {
            console.error('[Room] Failed to write tvHeadEnabled state', error);
          });
        })
        .catch((error) => {
          console.error('[Room] Failed to start face tracking', error);
          // Ensure tv head state stays false if tracking fails
          writeMyState({
            tvHeadEnabled: false,
            agoraVideoUid: undefined,
          }).catch((writeErr) => {
            console.error('[Room] Failed to clear tvHeadEnabled state after tracking failure', writeErr);
          });
        });
    } else {
      stopFaceTracking();
      setCameraStream(null);
      
      // CRITICAL: Immediately clear tvHeadEnabled when camera is turned off
      writeMyState({
        tvHeadEnabled: false,
        agoraVideoUid: undefined,
      })
        .then(() => {
          if (localPlayerStateRef.current) {
            localPlayerStateRef.current.tvHeadEnabled = false;
            localPlayerStateRef.current.agoraVideoUid = undefined;
          }
          console.log('[Room] ✅ Wrote tvHeadEnabled=false to Playroom');
        })
        .catch((error) => {
          console.error('[Room] Failed to clear tvHeadEnabled state', error);
        });
      
      sendNeutral();
      frameCounterRef.current = 0;
    }

    return () => {
      cancelled = true;
      stopFaceTracking();
      setCameraStream(null);
      sendNeutral();
      frameCounterRef.current = 0;
    };
  }, [ui.cameraOn, myId]);

  // Movement update loop now handled by PlayerController component inside SceneRoot

  // Camera follow effect - only works inside SceneRoot
  const CameraFollow = () => {
    const { scene, camera } = useScene();
    
    useEffect(() => {
      if (myId === 'none' || !camera) return;
      
      // Handle drawing mode or game mode - disable camera controls
      if (ui.drawingMode || ui.gameMode) {
        // Disable camera controls in drawing/game mode
        camera.detachControl();
        return;
      }
      
      // Re-enable camera controls when exiting drawing mode
      const canvas = scene.getEngine().getRenderingCanvas();
      if (canvas) {
        camera.attachControl(canvas, true);
      }
      
      // Normal camera follow
      const observer = scene.onBeforeRenderObservable.add(() => {
        const localState = localPlayerStateRef.current;
        if (localState && camera) {
          camera.setTarget(new Vector3(localState.pos.x, localState.pos.y + 1.6, localState.pos.z));
        }
      });
      
      return () => {
        scene.onBeforeRenderObservable.remove(observer);
      };
    }, [scene, camera, myId, ui.drawingMode]);
    
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
      <div className="absolute top-4 right-4 z-20 flex flex-col gap-3 pointer-events-none">
        <div className="pointer-events-auto">
          {/* Voice Chat */}
        {myId !== 'none' && roomCode && (
          <VoiceChat
            uid={myId}
            roomCode={roomCode}
            cameraStream={cameraStream}
            cameraEnabled={ui.cameraOn}
          />
        )}
        </div>

        <button
          className="h-12 w-12 rounded-full bg-slate-800/80 border border-slate-600 text-white flex items-center justify-center shadow-lg backdrop-blur active:bg-slate-700 pointer-events-auto"
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
          className="h-12 w-12 rounded-full bg-slate-800/80 border border-slate-600 text-white flex items-center justify-center shadow-lg backdrop-blur active:bg-slate-700 pointer-events-auto"
          onClick={toggleFaceBlur}
        >
          {/* Face Blur Icon (Sparkles/Mask) */}
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke={ui.faceBlur ? "currentColor" : "#94a3b8"} className="w-6 h-6">
             <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 0 1-6.364 0M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Z" />
          </svg>
        </button>

        <button
          className="h-12 w-12 rounded-full bg-rose-900/80 border border-rose-700 text-white flex items-center justify-center shadow-lg backdrop-blur active:bg-rose-800 mt-4 pointer-events-auto"
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
          <Walls
            onWhiteboardCreated={(mesh) => {
              console.log('[Room] Whiteboard mesh created', mesh);
              setWhiteboardMesh(mesh);
            }}
          />
          <Furniture
            modelPath="/"
            modelName="arcade_machine.glb"
            position={new Vector3(0, 0.01, 7.5)}
            rotation={new Vector3(0, Math.PI, 0)}
            scale={new Vector3(0.015, 0.015, 0.015)}
          />
          <ArcadeButton
            onToggleGame={handleToggleGameMode}
            isGameMode={ui.gameMode}
          />
          {whiteboardMesh && (
            <>
              <Whiteboard 
                whiteboardMesh={whiteboardMesh} 
                drawingMode={ui.drawingMode}
                onExitDrawingMode={handleExitDrawingMode}
                textureRef={whiteboardTextureRef}
                onTextureUpdated={handleTextureUpdated}
              />
              {ui.drawingMode && (
                <WhiteboardCanvas
                  drawingMode={ui.drawingMode}
                  onExitDrawingMode={handleExitDrawingMode}
                  textureRef={whiteboardTextureRef}
                  onTextureUpdated={handleTextureUpdated}
                />
              )}
              <WhiteboardButton 
                whiteboardMesh={whiteboardMesh}
                onToggleDrawingMode={handleToggleDrawingMode}
                isDrawingMode={ui.drawingMode}
              />
            </>
          )}
          <CameraFollow />
          <PlayerController 
            myId={myId}
            movementInput={movementInput}
            localPlayerStateRef={localPlayerStateRef}
            createFallbackPlayer={createFallbackPlayer}
          />
          {players.length > 0 ? (
            players.map(([id, playerState]) => {
              return (
                <Avatar 
                  key={id} 
                  playerId={id} 
                  player={playerState} 
                  isLocal={id === myId}
                  videoElement={id === myId && ui.cameraOn ? videoRef.current || undefined : undefined}
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
                videoElement={ui.cameraOn ? videoRef.current || undefined : undefined}
                getLocalState={() => localPlayerStateRef.current}
              />
            )
          )}
        </SceneRoot>
        <Joystick />
        {ui.gameMode && (
          <SnakeGameCanvas
            gameMode={ui.gameMode}
            onExitGame={handleExitGameMode}
            onGameOver={handleGameOver}
          />
        )}
        {ui.gameMode && leaderboard.scores.length > 0 && (
          <div className="fixed top-4 right-4 bg-black/80 text-white p-4 rounded-lg max-w-xs z-[10000] pointer-events-auto">
            <h3 className="text-lg font-bold mb-2">Leaderboard</h3>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {leaderboard.scores.slice(0, 10).map((score, index) => (
                <div
                  key={`${score.playerId}-${score.timestamp}`}
                  className="flex justify-between text-sm"
                >
                  <span className="text-gray-300">#{index + 1}</span>
                  <span className="flex-1 mx-2 truncate">{score.playerName}</span>
                  <span className="font-semibold">{score.score}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Room;

