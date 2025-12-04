// Lazy load playroomkit to avoid initialization errors at module load time
let playroomkit: typeof import('playroomkit') | null = null;

const getPlayroomkit = async () => {
  if (!playroomkit) {
    playroomkit = await import('playroomkit');
  }
  return playroomkit;
};

export type DrawingStroke = {
  id: string;
  points: Array<{ x: number; y: number }>; // Normalized 0-1 coordinates
  color: string;
  lineWidth: number;
  timestamp: number;
  playerId: string;
};

export type WhiteboardState = {
  strokes: DrawingStroke[];
  version: number;
};

const WHITEBOARD_STATE_KEY = 'whiteboard';
const PERSISTENCE_KEY = 'whiteboard';
const SAVE_INTERVAL_MS = 30000; // Save every 30 seconds
const SAVE_STROKE_COUNT = 10; // Or every 10 strokes

let strokeCountSinceSave = 0;
let lastSaveTime = Date.now();
let saveTimeoutId: ReturnType<typeof setTimeout> | null = null;

// Get current whiteboard state from Playroomkit
async function getWhiteboardState(): Promise<WhiteboardState> {
  try {
    const pk = await getPlayroomkit();
    // getState is a standalone function, not a method
    const getState = (pk as any).getState;
    if (typeof getState === 'function') {
      const state = getState(WHITEBOARD_STATE_KEY) as WhiteboardState | null;
      if (state) {
        return state;
      }
    }
  } catch (error) {
    console.error('[whiteboardSync] Error getting state', error);
  }
  return {
    strokes: [],
    version: 0,
  };
}

// Set whiteboard state in Playroomkit
async function setWhiteboardState(state: WhiteboardState): Promise<void> {
  try {
    const pk = await getPlayroomkit();
    // setState is a standalone function, not a method
    const setState = (pk as any).setState;
    if (typeof setState === 'function') {
      setState(WHITEBOARD_STATE_KEY, state, true); // reliable = true
    } else {
      console.warn('[whiteboardSync] setState not available on playroomkit');
    }
  } catch (error) {
    console.error('[whiteboardSync] Error setting state', error);
  }
}

// Save to persistent storage
async function saveToPersistence(state: WhiteboardState): Promise<void> {
  try {
    const pk = await getPlayroomkit();
    const setPersistentData = (pk as any).setPersistentData;
    if (typeof setPersistentData === 'function') {
      await setPersistentData(PERSISTENCE_KEY, state);
      console.log('[whiteboardSync] Saved to persistence', {
        strokeCount: state.strokes.length,
      });
    } else {
      console.warn('[whiteboardSync] setPersistentData not available');
    }
  } catch (error) {
    console.error('[whiteboardSync] Failed to save to persistence', error);
  }
}

// Schedule a save (debounced)
function scheduleSave(state: WhiteboardState): void {
  strokeCountSinceSave++;
  const shouldSave =
    strokeCountSinceSave >= SAVE_STROKE_COUNT ||
    Date.now() - lastSaveTime >= SAVE_INTERVAL_MS;

  if (shouldSave) {
    if (saveTimeoutId) {
      clearTimeout(saveTimeoutId);
    }

    saveTimeoutId = setTimeout(() => {
      saveToPersistence(state).then(() => {
        strokeCountSinceSave = 0;
        lastSaveTime = Date.now();
        saveTimeoutId = null;
      });
    }, 1000); // Debounce by 1 second
  }
}

// Subscribe to whiteboard state changes
export function subscribeWhiteboardState(
  callback: (state: WhiteboardState) => void
): () => void {
  let disposed = false;

  const setupSubscription = async () => {
    const pk = await getPlayroomkit();

    // Load persisted data on initial connection
    try {
      const getPersistentData = (pk as any).getPersistentData;
      if (typeof getPersistentData === 'function') {
        const persisted = await getPersistentData(PERSISTENCE_KEY);
        if (persisted && !disposed) {
          // Merge persisted strokes with current state
          const currentState = await getWhiteboardState();
          const mergedState: WhiteboardState = {
            strokes: persisted.strokes || currentState.strokes,
            version: Math.max(persisted.version || 0, currentState.version || 0),
          };

          // Only update if persisted data is different
          if (
            JSON.stringify(mergedState.strokes) !==
            JSON.stringify(currentState.strokes)
          ) {
            await setWhiteboardState(mergedState);
          }
        }
      }
    } catch (error) {
      console.error('[whiteboardSync] Failed to load persisted data', error);
    }

    // Initial load
    const initialState = await getWhiteboardState();
    if (!disposed) {
      callback(initialState);
    }

    // Subscribe to state changes
    let unsubscribe: (() => void) | null = null;
    if (typeof pk.on === 'function') {
      unsubscribe = pk.on('state', (state: any, key: string) => {
        if (key === WHITEBOARD_STATE_KEY && !disposed) {
          try {
            const getState = (pk as any).getState;
            const whiteboardState = typeof getState === 'function' 
              ? (getState(WHITEBOARD_STATE_KEY) as WhiteboardState)
              : null;
            if (whiteboardState) {
              callback(whiteboardState);
            }
          } catch (error) {
            console.error('[whiteboardSync] Error in state callback', error);
          }
        }
      });
    }

    return () => {
      disposed = true;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  };

  let unsubscribeFn: (() => void) | null = null;

  setupSubscription().then((unsubscribe) => {
    if (!disposed) {
      unsubscribeFn = unsubscribe;
    }
  });

  return () => {
    disposed = true;
    if (unsubscribeFn) {
      unsubscribeFn();
    }
    if (saveTimeoutId) {
      clearTimeout(saveTimeoutId);
      saveTimeoutId = null;
    }
  };
}

// Broadcast a new stroke to all users
export async function broadcastStroke(stroke: DrawingStroke): Promise<void> {
  try {
    const currentState = await getWhiteboardState();

    // Check if stroke already exists (prevent duplicates)
    const strokeExists = currentState.strokes.some((s) => s.id === stroke.id);
    if (strokeExists) {
      console.log('[whiteboardSync] Stroke already exists, skipping', stroke.id);
      return;
    }

    // Add new stroke
    const updatedState: WhiteboardState = {
      strokes: [...currentState.strokes, stroke],
      version: currentState.version + 1,
    };

    // Update state
    await setWhiteboardState(updatedState);

    // Schedule persistence save
    scheduleSave(updatedState);

    console.log('[whiteboardSync] Broadcasted stroke', {
      id: stroke.id,
      pointCount: stroke.points.length,
      totalStrokes: updatedState.strokes.length,
    });
  } catch (error) {
    console.error('[whiteboardSync] Failed to broadcast stroke', error);
  }
}

// Replay all strokes on a canvas context
export function replayStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: DrawingStroke[],
  textureSize: number
): void {
  strokes.forEach((stroke) => {
    if (stroke.points.length === 0) return;

    ctx.beginPath();
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const firstPoint = stroke.points[0];
    ctx.moveTo(
      firstPoint.x * textureSize,
      firstPoint.y * textureSize
    );

    for (let i = 1; i < stroke.points.length; i++) {
      const point = stroke.points[i];
      ctx.lineTo(point.x * textureSize, point.y * textureSize);
    }

    ctx.stroke();
  });
}

