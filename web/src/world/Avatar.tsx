import {
  Quaternion,
  Vector3,
} from '@babylonjs/core';
import { useEffect, useRef } from 'react';
import { createSimpleAvatar, type SimpleAvatar } from '../avatars/simpleAvatar';
import type { PlayerState } from '../multiplayer/playroom';
import { useScene } from './scene';

type AvatarProps = {
  playerId: string;
  player: PlayerState;
  isLocal?: boolean;
  videoElement?: HTMLVideoElement;
  getLocalState?: () => PlayerState | null;
};

const INTERPOLATION_TIME = 0.12; // 120ms

type InterpolatedState = {
  pos: Vector3;
  rotY: number;
  headQ: Quaternion;
};

export function Avatar({ playerId, player, isLocal = false, videoElement, getLocalState }: AvatarProps) {
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

      // For local player, read directly from getLocalState if available (real-time)
      // Otherwise fall back to prop (for remote players or if getter not provided)
      const state = isLocal && getLocalState ? (getLocalState() ?? playerStateRef.current) : playerStateRef.current;
      const target = targetStateRef.current;
      const interpolated = interpolatedRef.current;
      const deltaTime = scene.getEngine().getDeltaTime() / 1000;

      // Always update target to latest state
      targetStateRef.current = state;

      if (isLocal) {
        // For local player, use the latest state directly from movement loop
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

      const time = performance.now() / 180; // shared phase for simple animations

      // Simple walk / idle animation
      if (state.anim === 'walk') {
        const walkBob = Math.sin(time * 2) * 0.05;
        // Body bob
        avatar.body.position.y = 1.4 + walkBob;

        // Arm swing (opposite phase)
        const swing = Math.sin(time * 2) * 0.4;
        const counterSwing = Math.sin(time * 2 + Math.PI) * 0.4;
        avatar.leftArm.rotation.x = swing;
        avatar.rightArm.rotation.x = counterSwing;

        // Simple leg swing
        avatar.leftLeg.rotation.x = counterSwing * 0.5;
        avatar.rightLeg.rotation.x = swing * 0.5;
      } else {
        // Idle: slight breathing / sway
        const idleT = performance.now() / 1000;
        avatar.body.position.y = 1.4 + Math.sin(idleT * 0.5) * 0.01;
        avatar.body.rotation.x = -0.05 + Math.sin(idleT * 0.25) * 0.01;

        // Relax arms and legs towards default pose
        avatar.leftArm.rotation.x *= 0.9;
        avatar.rightArm.rotation.x *= 0.9;
        avatar.leftLeg.rotation.x *= 0.9;
        avatar.rightLeg.rotation.x *= 0.9;
      }

      // Ensure base body height when no extra bob is applied
      if (state.anim !== 'walk') {
        avatar.body.position.y = 1.4;
      }
    });

    return () => {
      scene.onBeforeRenderObservable.remove(observer);
    };
  }, [scene, isLocal, getLocalState]);

  return null;
}
