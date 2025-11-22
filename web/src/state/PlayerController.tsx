import { useEffect } from 'react';
import { useScene } from '../world/scene';
import { MovementInput, updatePosition } from './movement';
import { PlayerState } from '../multiplayer/playroom';

type Props = {
  myId: string;
  movementInput: MovementInput;
  localPlayerStateRef: React.MutableRefObject<PlayerState | null>;
  createFallbackPlayer: () => PlayerState;
};

export function PlayerController({
  myId,
  movementInput,
  localPlayerStateRef,
  createFallbackPlayer,
}: Props) {
  const { camera } = useScene();

  useEffect(() => {
    if (myId === 'none') {
      return;
    }

    let animationFrame: number;
    let lastTime = performance.now();

    const updateMovement = (currentTime: number) => {
      const deltaTime = Math.min((currentTime - lastTime) / 1000, 0.033); // Cap at 33ms
      lastTime = currentTime;

      const currentState = localPlayerStateRef.current ?? createFallbackPlayer();
      
      // Get camera rotation (alpha)
      // Default to -PI/2 if camera not ready (though it should be inside SceneRoot)
      const cameraAlpha = camera ? camera.alpha : -Math.PI / 2;

      const updated = updatePosition(
        currentState.pos,
        currentState.rotY,
        movementInput,
        deltaTime,
        cameraAlpha
      );

      const newState = {
        ...currentState,
        ...updated,
      };
      localPlayerStateRef.current = newState;

      animationFrame = requestAnimationFrame(updateMovement);
    };

    animationFrame = requestAnimationFrame(updateMovement);

    return () => {
      cancelAnimationFrame(animationFrame);
    };
  }, [myId, movementInput, camera, localPlayerStateRef, createFallbackPlayer]);

  return null;
}

