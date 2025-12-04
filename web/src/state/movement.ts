import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';

export type MovementInput = {
  forward: number;
  right: number;
};

const SPEED = 0.05;
const ROTATION_SPEED = 0.03;

export function useKeyboardMovement(): MovementInput {
  const [input, setInput] = useState<MovementInput>({ forward: 0, right: 0 });
  const keysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key.toLowerCase());
      updateInput();
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase());
      updateInput();
    };

    const updateInput = () => {
      const keys = keysRef.current;
      let forward = 0;
      let right = 0;

      if (keys.has('w') || keys.has('arrowup')) {
        forward += 1;
      }
      if (keys.has('s') || keys.has('arrowdown')) {
        forward -= 1;
      }
      if (keys.has('a') || keys.has('arrowleft')) {
        right -= 1;
      }
      if (keys.has('d') || keys.has('arrowright')) {
        right += 1;
      }

      setInput({ forward, right });
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  return input;
}

type JoystickStore = {
  input: MovementInput;
  setInput: (input: MovementInput) => void;
};

const useJoystickStore = create<JoystickStore>((set) => ({
  input: { forward: 0, right: 0 },
  setInput: (input: MovementInput) => set({ input }),
}));

export function useJoystickMovement(): [
  MovementInput,
  (input: MovementInput) => void,
] {
  const input = useJoystickStore((state) => state.input);
  const setInput = useJoystickStore((state) => state.setInput);
  return [input, setInput];
}

export function updatePosition(
  current: { x: number; y: number; z: number },
  rotY: number,
  input: MovementInput,
  deltaTime: number,
  cameraAlpha: number
): { pos: { x: number; y: number; z: number }; rotY: number; anim: 'idle' | 'walk' } {
  const hasInput = input.forward !== 0 || input.right !== 0;

  if (!hasInput) {
    return {
      pos: current,
      rotY,
      anim: 'idle',
    };
  }

  // Calculate angle of input stick (0 = forward, PI/2 = right, etc)
  // atan2(x, y) -> returns angle from Y axis (forward) if we pass (right, forward)
  // Standard Math.atan2(y, x) is from X axis.
  // Let's use atan2(right, forward) -> 0 is forward (Z), PI/2 is right (X)
  const inputAngle = Math.atan2(input.right, input.forward);

  // Adjust for camera rotation
  // Babylon ArcRotateCamera: alpha is angle on XZ plane.
  // -PI/2 = South (looking North/+Z). 0 = East (looking West/-X).
  // We want "Forward" input to align with "Camera View Direction".
  // Camera View Direction = alpha + PI (since camera looks AT target).
  // Actually, easier to think: -alpha + offset.

  // Experimentally for Babylon ArcRotateCamera:
  // Desired Angle = -cameraAlpha + inputAngle + Offset
  // If alpha = -PI/2 (South), looking North. Forward input (0) should result in 0 (North).
  // -(-PI/2) + 0 + Offset = PI/2 + Offset = 0 => Offset = -PI/2.

  // Let's try: targetRot = -cameraAlpha + inputAngle - Math.PI/2;
  // Case 1: Alpha = -PI/2 (South). Forward Input (0).
  // Rot = (PI/2) + 0 - PI/2 = 0. (North/Z+). Correct.

  // Case 2: Alpha = 0 (East). Looking West (-X). Forward Input (0).
  // Rot = 0 + 0 - PI/2 = -PI/2 (West/X-). Correct (if 0 is Z+).

  // Wait, if Z+ is 0 radians?
  // Babylon standard: 0 rotation is usually facing Z+?
  // Yes.
  // So -PI/2 rotation is facing X-.
  // Correct.

  const targetRotY = -cameraAlpha + inputAngle - Math.PI / 2;

  // Smooth rotation? For now instant snap to input direction is fine,
  // or we can lerp "rotY" towards "targetRotY".
  // Let's just set it for responsiveness.
  const newRotY = targetRotY;

  // Calculate movement vector based on this world-space rotation
  // Z is cos, X is sin for angle 0 at Z+?
  // Usually: x = sin(angle), z = cos(angle) for 0 at North.
  const moveSpeed = SPEED * deltaTime * 60;
  // Normalize input magnitude so diagonal isn't faster
  const inputMag = Math.min(1, Math.sqrt(input.forward ** 2 + input.right ** 2));
  const finalSpeed = moveSpeed * inputMag;

  const moveX = Math.sin(newRotY) * finalSpeed;
  const moveZ = Math.cos(newRotY) * finalSpeed;

  // Room bounds: 20x20 room, walls at x=±10, z=±10
  // Player radius ~0.5, so keep player at least 0.5 units from walls
  const ROOM_HALF = 10;
  const PLAYER_RADIUS = 0.5;
  const MIN_X = -ROOM_HALF + PLAYER_RADIUS;
  const MAX_X = ROOM_HALF - PLAYER_RADIUS;
  const MIN_Z = -ROOM_HALF + PLAYER_RADIUS;
  const MAX_Z = ROOM_HALF - PLAYER_RADIUS;

  let newX = current.x + moveX;
  let newZ = current.z + moveZ;

  // Clamp to room bounds
  newX = Math.max(MIN_X, Math.min(MAX_X, newX));
  newZ = Math.max(MIN_Z, Math.min(MAX_Z, newZ));

  return {
    pos: {
      x: newX,
      y: current.y,
      z: newZ,
    },
    rotY: newRotY,
    anim: 'walk',
  };
}

