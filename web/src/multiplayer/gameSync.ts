// Lazy load playroomkit to avoid initialization errors at module load time
let playroomkit: typeof import('playroomkit') | null = null;

const getPlayroomkit = async () => {
  if (!playroomkit) {
    playroomkit = await import('playroomkit');
  }
  return playroomkit;
};

export type GameScore = {
  playerId: string;
  playerName: string;
  score: number;
  timestamp: number;
};

export type LeaderboardState = {
  scores: GameScore[];
  version: number;
};

const LEADERBOARD_STATE_KEY = 'gameLeaderboard';
const PERSISTENCE_KEY = 'gameLeaderboard';
const MAX_SCORES = 10;

// Get current leaderboard state from Playroomkit
async function getLeaderboardState(): Promise<LeaderboardState> {
  try {
    const pk = await getPlayroomkit();
    const getState = (pk as any).getState;
    if (typeof getState === 'function') {
      const state = getState(LEADERBOARD_STATE_KEY) as LeaderboardState | null;
      if (state) {
        return state;
      }
    }
  } catch (error) {
    console.error('[gameSync] Error getting leaderboard state', error);
  }
  return {
    scores: [],
    version: 0,
  };
}

// Set leaderboard state in Playroomkit
async function setLeaderboardState(state: LeaderboardState): Promise<void> {
  try {
    const pk = await getPlayroomkit();
    const setState = (pk as any).setState;
    if (typeof setState === 'function') {
      setState(LEADERBOARD_STATE_KEY, state, true); // reliable = true
    } else {
      console.warn('[gameSync] setState not available on playroomkit');
    }
  } catch (error) {
    console.error('[gameSync] Error setting leaderboard state', error);
  }
}

// Save to persistent storage
async function saveToPersistence(state: LeaderboardState): Promise<void> {
  try {
    const pk = await getPlayroomkit();
    const setPersistentData = (pk as any).setPersistentData;
    if (typeof setPersistentData === 'function') {
      await setPersistentData(PERSISTENCE_KEY, state);
      console.log('[gameSync] Saved leaderboard to persistence', {
        scoreCount: state.scores.length,
      });
    } else {
      console.warn('[gameSync] setPersistentData not available');
    }
  } catch (error) {
    console.error('[gameSync] Failed to save to persistence', error);
  }
}

// Subscribe to leaderboard state changes
export function subscribeLeaderboard(
  callback: (state: LeaderboardState) => void
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
          // Merge persisted scores with current state
          const currentState = await getLeaderboardState();
          const mergedState: LeaderboardState = {
            scores: persisted.scores || currentState.scores,
            version: Math.max(persisted.version || 0, currentState.version || 0),
          };

          // Only update if persisted data is different
          if (
            JSON.stringify(mergedState.scores) !==
            JSON.stringify(currentState.scores)
          ) {
            await setLeaderboardState(mergedState);
          }
        }
      }
    } catch (error) {
      console.error('[gameSync] Failed to load persisted data', error);
    }

    // Initial load
    const initialState = await getLeaderboardState();
    if (!disposed) {
      callback(initialState);
    }

    // Subscribe to state changes
    let unsubscribe: (() => void) | null = null;
    if (typeof pk.on === 'function') {
      unsubscribe = pk.on('state', (state: any, key: string) => {
        if (key === LEADERBOARD_STATE_KEY && !disposed) {
          try {
            const getState = (pk as any).getState;
            const leaderboardState = typeof getState === 'function' 
              ? (getState(LEADERBOARD_STATE_KEY) as LeaderboardState)
              : null;
            if (leaderboardState) {
              callback(leaderboardState);
            }
          } catch (error) {
            console.error('[gameSync] Error in state callback', error);
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
  };
}

// Submit a new score
export async function submitScore(
  score: number,
  playerName: string,
  playerId: string
): Promise<void> {
  try {
    const currentState = await getLeaderboardState();

    // Create new score entry
    const newScore: GameScore = {
      playerId,
      playerName,
      score,
      timestamp: Date.now(),
    };

    // Add to scores array
    const updatedScores = [...currentState.scores, newScore];

    // Sort by score descending, then by timestamp ascending (earlier is better for ties)
    updatedScores.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score; // Higher score first
      }
      return a.timestamp - b.timestamp; // Earlier timestamp first for ties
    });

    // Keep only top MAX_SCORES
    const topScores = updatedScores.slice(0, MAX_SCORES);

    // Update state
    const updatedState: LeaderboardState = {
      scores: topScores,
      version: currentState.version + 1,
    };

    // Update state
    await setLeaderboardState(updatedState);

    // Save to persistence
    await saveToPersistence(updatedState);

    console.log('[gameSync] Submitted score', {
      playerName,
      score,
      position: topScores.findIndex((s) => s.playerId === playerId && s.score === score) + 1,
      totalScores: topScores.length,
    });
  } catch (error) {
    console.error('[gameSync] Failed to submit score', error);
  }
}

// Get current leaderboard (synchronous if state is already loaded)
export async function getLeaderboard(): Promise<LeaderboardState> {
  return await getLeaderboardState();
}
