import {
  Mesh,
  Quaternion,
  Scene,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import { useEffect, useRef } from 'react';
import { createSimpleAvatar, SimpleAvatar } from '../avatars/simpleAvatar';
import { PlayerState } from '../multiplayer/playroom';
import { useScene } from './scene';

type AvatarProps = {
  playerId: string;
  player: PlayerState;
  isLocal?: boolean;
  videoElement?: HTMLVideoElement;
};

const INTERPOLATION_TIME = 0.12; // 120ms

type InterpolatedState = {
  pos: Vector3;
  rotY: number;
  headQ: Quaternion;
};

export function Avatar({ playerId, player, isLocal = false, videoElement }: AvatarProps) {
  const { scene } = useScene();
  const avatarRef = useRef<SimpleAvatar | null>(null);
  const playerStateRef = useRef(player);
  const interpolatedRef = useRef<InterpolatedState | null>(null);
  const targetStateRef = useRef<PlayerState>(player);

  playerStateRef.current = player;
  targetStateRef.current = player;

  // Create avatar on mount
  useEffect(() => {
    console.log('[Avatar] Creating avatar for player:', playerId, 'isLocal:', isLocal);
    
    // Only use video element for local player (and only if it's ready)
    const video = isLocal && videoElement ? videoElement : undefined;
    const avatar = createSimpleAvatar(scene, video);
    
    avatar.root.position = new Vector3(player.pos.x, player.pos.y, player.pos.z);
    avatar.root.rotation.y = player.rotY;
    
    // Initialize interpolated state
    interpolatedRef.current = {
      pos: new Vector3(player.pos.x, player.pos.y, player.pos.z),
      rotY: player.rotY,
      headQ: Quaternion.FromArray(player.head.q),
    };
    
    avatarRef.current = avatar;
    console.log('[Avatar] Avatar created for player:', playerId, 'with video:', !!video);

    return () => {
      console.log('[Avatar] Disposing avatar for player:', playerId);
      if (avatarRef.current) {
        avatarRef.current.root.dispose();
        avatarRef.current = null;
      }
    };
  }, [scene, playerId, isLocal, videoElement]);

  // Update avatar position, rotation, and head rotation each frame
  useEffect(() => {
    const observer = scene.onBeforeRenderObservable.add(() => {
      const avatar = avatarRef.current;
      if (!avatar || !interpolatedRef.current) {
        return;
      }

      const state = playerStateRef.current;
      const target = targetStateRef.current;
      const interpolated = interpolatedRef.current;
      const deltaTime = scene.getEngine().getDeltaTime() / 1000;

      // Update target when state changes
      if (
        target.pos.x !== state.pos.x ||
        target.pos.y !== state.pos.y ||
        target.pos.z !== state.pos.z ||
        target.rotY !== state.rotY ||
        JSON.stringify(target.head.q) !== JSON.stringify(state.head.q)
      ) {
        targetStateRef.current = state;
      }

      if (isLocal) {
        // Direct updates for local player
        avatar.root.position.set(state.pos.x, state.pos.y, state.pos.z);
        avatar.root.rotation.y = state.rotY;
        interpolated.pos.set(state.pos.x, state.pos.y, state.pos.z);
        interpolated.rotY = state.rotY;
      } else {
        // Interpolate remote players
        const lerpFactor = Math.min(1, deltaTime / INTERPOLATION_TIME);
        const targetPos = new Vector3(target.pos.x, target.pos.y, target.pos.z);
        interpolated.pos = Vector3.Lerp(interpolated.pos, targetPos, lerpFactor);
        interpolated.rotY +=
          ((target.rotY - interpolated.rotY + Math.PI) %
            (2 * Math.PI) -
            Math.PI) *
          lerpFactor;

        avatar.root.position.copyFrom(interpolated.pos);
        avatar.root.rotation.y = interpolated.rotY;
      }

      // Head rotation (apply quaternion to head mesh)
      if (state.head?.q) {
        const targetQ = Quaternion.FromArray(state.head.q);
        const lerpFactor = Math.min(1, deltaTime / INTERPOLATION_TIME);
        Quaternion.SlerpToRef(
          interpolated.headQ,
          targetQ,
          lerpFactor,
          interpolated.headQ
        );
        
        // Apply rotation to head mesh
        if (!avatar.head.rotationQuaternion) {
          avatar.head.rotationQuaternion = Quaternion.Identity();
        }
        avatar.head.rotationQuaternion.copyFrom(interpolated.headQ);
      }

      // Simple walk animation: slightly bob the body up and down when walking
      if (state.anim === 'walk') {
        const walkBob = Math.sin(Date.now() / 200) * 0.05; // Small vertical bob
        avatar.body.position.y = 0.6 + walkBob;
      } else {
        avatar.body.position.y = 0.6;
      }
    });

    return () => {
      scene.onBeforeRenderObservable.remove(observer);
    };
  }, [scene, isLocal]);

  return null;
}
