import { useEffect, useRef, useState } from 'react';

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

export function useJoystickMovement(): [
  MovementInput,
  (input: MovementInput) => void,
] {
  const [input, setInput] = useState<MovementInput>({ forward: 0, right: 0 });
  return [input, setInput];
}

export function updatePosition(
  current: { x: number; y: number; z: number },
  rotY: number,
  input: MovementInput,
  deltaTime: number
): { x: number; y: number; z: number; rotY: number; anim: 'idle' | 'walk' } {
  const hasInput = input.forward !== 0 || input.right !== 0;

  let newRotY = rotY;
  if (hasInput) {
    const targetAngle = Math.atan2(input.right, input.forward);
    newRotY = targetAngle;
  }

  // deltaTime is in seconds (from 16.67ms = 0.01667s)
  const moveX = Math.sin(newRotY) * input.forward * SPEED * deltaTime * 60;
  const moveZ = Math.cos(newRotY) * input.forward * SPEED * deltaTime * 60;
  const strafeX = Math.cos(newRotY) * input.right * SPEED * deltaTime * 60;
  const strafeZ = -Math.sin(newRotY) * input.right * SPEED * deltaTime * 60;

  return {
    x: current.x + moveX + strafeX,
    y: current.y,
    z: current.z + moveZ + strafeZ,
    rotY: newRotY,
    anim: hasInput ? 'walk' : 'idle',
  };
}

