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
  avatarUrl?: string;
  avatarImg?: string;
  withVoiceChat?: boolean;
  tvHeadEnabled?: boolean;
  agoraVideoUid?: number | string;
};

export type WorldState = {
  players: Record<string, PlayerState>;
};

const PLAYER_STATE_KEY = 'playState';

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

  const player = pk.myPlayer();
  if (player) {
    const existing = (player.getState(PLAYER_STATE_KEY) as PlayerState) ?? defaultPlayer();
    player.setState(PLAYER_STATE_KEY, existing, true);
    console.info('[connectToRoom] initialized state for', MY_ID);
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
  let disposed = false;

  const rebuildWorld = async () => {
    const pk = await getPlayroomkit();
  const participantsRecord = pk.getParticipants
    ? pk.getParticipants()
    : {};
  const participants = Object.values(
    participantsRecord as Record<string, any>
  );

    const players: Record<string, PlayerState> = {};

    participants.forEach((player) => {
      const stored =
        (player.getState(PLAYER_STATE_KEY) as PlayerState) ?? defaultPlayer();
      players[player.id] = stored;
    });

    // Include self even if not in participants yet
    const me = pk.myPlayer();
    if (me && !players[me.id]) {
      const stored =
        (me.getState(PLAYER_STATE_KEY) as PlayerState) ?? defaultPlayer();
      players[me.id] = stored;
    }

    if (!disposed) {
      cb({ players });
    }
  };

  let intervalId: ReturnType<typeof setInterval> | null = null;
  let unsubscribeJoin: (() => void) | null = null;

  getPlayroomkit()
    .then((pk) => {
      rebuildWorld();
      intervalId = setInterval(rebuildWorld, 100);
      unsubscribeJoin =
        pk.onPlayerJoin?.((player) => {
          rebuildWorld();
          player.onQuit?.(() => rebuildWorld());
        }) ?? null;
    })
    .catch((error) => {
      console.error('[playroom] Failed to subscribe to state', error);
    });

  return () => {
    disposed = true;
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    if (unsubscribeJoin) {
      unsubscribeJoin();
      unsubscribeJoin = null;
    }
  };
}

export async function writeMyState(partial: Partial<PlayerState>) {
  const pk = await getPlayroomkit();
  const player = pk.myPlayer();
  if (!player) return;

  const current =
    (player.getState(PLAYER_STATE_KEY) as PlayerState) ?? defaultPlayer();

  const merged: PlayerState = {
    ...current,
    ...partial,
    blend:
      partial.blend && current.blend
        ? { ...current.blend, ...partial.blend }
        : partial.blend ?? current.blend,
  };

  player.setState(PLAYER_STATE_KEY, merged, true);
  lastWriteAt = Date.now();
}

export function disconnectFromRoom() {
  MY_ID = null;
  ROOM_CODE_IN_USE = 'plaza';
  lastWriteAt = 0;
}
