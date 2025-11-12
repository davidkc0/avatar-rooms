// Lazy load playroomkit to avoid initialization errors at module load time
let playroomkit: typeof import('playroomkit') | null = null;

const getPlayroomkit = async () => {
  if (!playroomkit) {
    playroomkit = await import('playroomkit');
  }
  return playroomkit;
};

export type PlayerState = {
  pos: { x: number; y: number; z: number };
  rotY: number;
  anim: 'idle' | 'walk';
  head: { q: [number, number, number, number] };
  blend: Record<string, number>;
};

export type WorldState = {
  players: Record<string, PlayerState>;
};

let MY_ID: string | null = null;
let ROOM_CODE_IN_USE = 'plaza';
let lastWriteAt = 0;

export function roomCodeFromSlug(slug?: string) {
  // Deterministic, simple mapping
  return (slug?.trim()?.toLowerCase() || 'plaza').replace(/[^a-z0-9_-]/g, '-');
}

function assertSameRoom(nextCode: string) {
  const currentCode = getRoomCodeInUse();
  if (currentCode !== nextCode) {
    console.error(
      `[playroom] Room code mismatch: expected ${nextCode}, but getRoomCodeInUse() returned ${currentCode}. This may indicate a connection issue.`
    );
  }
  ROOM_CODE_IN_USE = nextCode;
}

async function ensureWorldState(): Promise<WorldState> {
  const pk = await getPlayroomkit();
  const s = (pk.getState() as WorldState) || ({ players: {} } as WorldState);
  if (!s.players) s.players = {};
  return s;
}

function defaultPlayer(): PlayerState {
  return {
    pos: { x: 0, y: 0, z: 0 },
    rotY: 0,
    anim: 'idle',
    head: { q: [0, 0, 0, 1] },
    blend: {},
  };
}

export async function connectToRoom(
  slugOrCode?: string
): Promise<{ myId: string; roomCode: string }> {
  console.info('[connectToRoom] Starting connection...', slugOrCode);
  
  const pk = await getPlayroomkit();
  console.info('[connectToRoom] Playroomkit loaded');
  
  const nextCode = roomCodeFromSlug(slugOrCode);
  console.info('[connectToRoom] Room code:', nextCode);
  
  // Set room code before connecting so getRoomCodeInUse() returns correct value
  ROOM_CODE_IN_USE = nextCode;
  
  // Await the Playroom join (skip React-17 lobby)
  console.info('[connectToRoom] Calling insertCoin...');
  try {
    await pk.insertCoin({ skipLobby: true, roomCode: nextCode });
    console.info('[connectToRoom] insertCoin completed');
  } catch (error) {
    console.error('[connectToRoom] insertCoin failed:', error);
    throw error;
  }

  assertSameRoom(nextCode);
  console.info('[connectToRoom] joined', ROOM_CODE_IN_USE);

  const me = pk.myPlayer();
  console.info('[connectToRoom] myPlayer.id', me?.id);
  
  if (!me?.id) {
    throw new Error(
      'Playroom did not return myPlayer().id — ensure insertCoin awaited and roomCode stable.'
    );
  }
  MY_ID = me.id;

  // Seed self if missing
  const s = await ensureWorldState();
  if (!s.players[MY_ID]) {
    s.players[MY_ID] = defaultPlayer();
    pk.setState(s);
    console.info('[connectToRoom] seeded player node for', MY_ID);
  }

  return { myId: MY_ID, roomCode: ROOM_CODE_IN_USE };
}

export function getMyId() {
  return MY_ID;
}

export function getRoomCodeInUse() {
  return ROOM_CODE_IN_USE;
}

export function getLastWriteAt() {
  return lastWriteAt;
}

export function subscribeState(cb: (s: WorldState) => void): () => void {
  let cleanup: (() => void) | null = null;
  let intervalId: ReturnType<typeof setInterval> | null = null;
  
  getPlayroomkit().then((pk) => {
    // Try onStateChange first, fallback to polling if not available
    if (typeof pk.onStateChange === 'function') {
      cleanup = pk.onStateChange((ns) => {
        cb((ns as WorldState) ?? { players: {} });
      });
    } else {
      // Fallback to polling every 100ms
      console.warn('[playroom] onStateChange not available, using polling');
      let lastState: any = null;
      intervalId = setInterval(() => {
        const currentState = pk.getState() as WorldState;
        // Only call callback if state changed
        if (JSON.stringify(currentState) !== JSON.stringify(lastState)) {
          lastState = currentState;
          cb(currentState ?? { players: {} });
        }
      }, 100);
    }
    
    // Also call with initial state
    const initialState = (pk.getState() as WorldState) ?? { players: {} };
    cb(initialState);
  }).catch((error) => {
    console.error('[playroom] Failed to subscribe to state', error);
  });

  return () => {
    if (cleanup) {
      cleanup();
      cleanup = null;
    }
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };
}

// Safe, atomic updater to avoid clobbering sibling keys
export async function updateMyNode(
  mutator: (p: PlayerState) => PlayerState
) {
  if (!MY_ID) return;
  
  const pk = await getPlayroomkit();
  const s = await ensureWorldState();
  const current = s.players[MY_ID] ?? defaultPlayer();
  s.players[MY_ID] = mutator(current);
  pk.setState(s);
  lastWriteAt = Date.now();
}

// Shallow merge variant (convenience)
export async function writeMyState(partial: Partial<PlayerState>) {
  await updateMyNode((p) => {
    const merged = { ...p, ...partial };
    // Special handling for blend: merge objects instead of replacing
    if (partial.blend && p.blend) {
      merged.blend = { ...p.blend, ...partial.blend };
    }
    return merged;
  });
}

export function disconnectFromRoom() {
  MY_ID = null;
  ROOM_CODE_IN_USE = 'plaza';
  lastWriteAt = 0;
}
