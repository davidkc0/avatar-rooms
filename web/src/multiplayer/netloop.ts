import { PlayerState, writeMyState } from './playroom';

const TICK_RATE_MS = 50; // 20Hz

let loopHandle: ReturnType<typeof setInterval> | null = null;
let previousState: PlayerState | null = null;

const quantizeNumber = (value: number) =>
  Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

const quantizeVector3 = (vector: PlayerState['pos']): PlayerState['pos'] => ({
  x: quantizeNumber(vector.x),
  y: quantizeNumber(vector.y),
  z: quantizeNumber(vector.z),
});

const quantizeHead = (head: PlayerState['head']): PlayerState['head'] => ({
  q: head.q.map(quantizeNumber) as PlayerState['head']['q'],
});

export const quantizeBlend = (
  blend: PlayerState['blend'] = {}
): PlayerState['blend'] => {
  const result: PlayerState['blend'] = {};
  Object.entries(blend).forEach(([key, value]) => {
    result[key] = quantizeNumber(value);
  });
  return result;
};

export const diffKeys = (
  prev: PlayerState['blend'] = {},
  next: PlayerState['blend'] = {}
): Record<string, number> => {
  const changed: Record<string, number> = {};
  Object.keys(next).forEach((key) => {
    if (prev[key] !== next[key]) {
      changed[key] = next[key];
    }
  });
  return changed;
};

const quantizeState = (state: PlayerState): PlayerState => ({
  pos: quantizeVector3(state.pos),
  rotY: quantizeNumber(state.rotY),
  anim: state.anim,
  head: quantizeHead(state.head),
  blend: quantizeBlend(state.blend),
});

const arraysEqual = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

export function startWriteLoop(getLocal: () => PlayerState) {
  const tick = () => {
    try {
      const localState = quantizeState(getLocal());
      const partial: Partial<PlayerState> = {};

      if (
        !previousState ||
        previousState.pos.x !== localState.pos.x ||
        previousState.pos.y !== localState.pos.y ||
        previousState.pos.z !== localState.pos.z
      ) {
        partial.pos = localState.pos;
      }

      if (!previousState || previousState.rotY !== localState.rotY) {
        partial.rotY = localState.rotY;
      }

      if (!previousState || previousState.anim !== localState.anim) {
        partial.anim = localState.anim;
      }

      if (
        !previousState ||
        !arraysEqual(previousState.head.q, localState.head.q)
      ) {
        partial.head = localState.head;
      }

      const blendChanges = diffKeys(previousState?.blend, localState.blend);
      if (Object.keys(blendChanges).length > 0) {
        partial.blend = blendChanges;
      }

      if (Object.keys(partial).length > 0) {
        writeMyState(partial).catch((error) => {
          console.error('[netloop] Failed to write state', error);
        });
      }

      previousState = localState;
    } catch (error) {
      console.error('[netloop] Failed to publish player state', error);
    }
  };

  if (loopHandle) {
    clearInterval(loopHandle);
  }

  tick();
  loopHandle = setInterval(tick, TICK_RATE_MS);

  return () => {
    if (loopHandle) {
      clearInterval(loopHandle);
      loopHandle = null;
    }
    previousState = null;
  };
}

let hbTimer: number | null = null;

export function startHeartbeat() {
  if (hbTimer) return;

  hbTimer = window.setInterval(() => {
    // No-op-ish write to prove we can write and update lastWriteAt
    writeMyState({ anim: 'idle' });
  }, 2000);
}

export function stopHeartbeat() {
  if (hbTimer) {
    clearInterval(hbTimer);
    hbTimer = null;
  }
}

