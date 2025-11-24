import {
  Quaternion,
  Vector3,
  TransformNode,
  StandardMaterial,
  VideoTexture,
  Color3,
  AbstractMesh,
} from '@babylonjs/core';
import { MeshBuilder } from '@babylonjs/core/Meshes';
import { useCallback, useEffect, useRef } from 'react';
import { createSimpleAvatar, type SimpleAvatar } from '../avatars/simpleAvatar';
import { createRpmAvatar, type RpmAvatar } from '../avatars/rpmAvatar';
import type { PlayerState } from '../multiplayer/playroom';
import { useScene } from './scene';
import { useVideoStore } from '../state/videoStore';

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

type AvatarInstance = SimpleAvatar | (RpmAvatar & { kind?: 'rpm' });

export function Avatar({ playerId, player, isLocal = false, videoElement, getLocalState }: AvatarProps) {
  const { scene } = useScene();
  const avatarRef = useRef<AvatarInstance | null>(null);
  const playerStateRef = useRef(player);
  const interpolatedRef = useRef<InterpolatedState | null>(null);
  const targetStateRef = useRef<PlayerState>(player);
  const disposedRef = useRef(false);
  const remoteVideoElement = useVideoStore((state) => state.remoteVideos[playerId]);
  const effectiveVideoElement = isLocal ? videoElement : remoteVideoElement;

  playerStateRef.current = player;
  targetStateRef.current = player;

  // Create face plane helper
  const createCameraFacePlane = useCallback(
    async (headNode: TransformNode | AbstractMesh, video: HTMLVideoElement) => {
      if (disposedRef.current || !video) {
        return;
      }
      // Ensure video is playing
      if (video.paused && video.readyState >= 2) {
        try {
          await video.play();
        } catch (err) {
          console.warn('[Avatar] Video play failed:', err);
        }
      }
      
      // Wait for video to be ready if needed
      if (video.readyState < 2) {
        video.addEventListener('loadeddata', () => {
          if (!disposedRef.current) {
            createCameraFacePlane(headNode, video);
          }
        }, { once: true });
        return;
      }
      
      // Remove existing plane/box if it exists
      const meshNames = [
        `face-box-${playerId}`,
        `face-plane-${playerId}`, // legacy name
        `face-screen-${playerId}`,
      ];
      meshNames.forEach((name) => {
        const mesh = scene.getMeshByName(name);
        if (mesh) {
          mesh.dispose();
        }
      });
      
      // 1. Create the main head box (solid color container)
      const HEAD_SIZE = 0.5;
      const faceBox = MeshBuilder.CreateBox(`face-box-${playerId}`, { size: HEAD_SIZE }, scene);
      faceBox.parent = headNode;
      faceBox.position = new Vector3(0, 0.15, 0); // Centered on head bone
      // Tilt up slightly to fix "looking down" appearance
      faceBox.rotation.x = -Math.PI / 10; 
      faceBox.alwaysSelectAsActiveMesh = true; // Prevent disappearing
      
      const boxMat = new StandardMaterial(`face-box-mat-${playerId}`, scene);
      boxMat.diffuseColor = new Color3(0.1, 0.1, 0.1); // Dark gray/black container
      boxMat.specularColor = new Color3(0, 0, 0);
      faceBox.material = boxMat;

      // 2. Create the video screen plane (attached to front of box)
      // Box front face is at z = HEAD_SIZE / 2. We place plane slightly in front.
      const faceScreen = MeshBuilder.CreatePlane(`face-screen-${playerId}`, { width: HEAD_SIZE, height: HEAD_SIZE }, scene);
      faceScreen.parent = faceBox;
      faceScreen.position = new Vector3(0, 0, (HEAD_SIZE / 2) + 0.002); // Slightly in front
      faceScreen.rotation.y = Math.PI; // Face forward

      const screenMat = new StandardMaterial(`face-screen-mat-${playerId}`, scene);
      const tex = new VideoTexture(`face-video-${playerId}`, video, scene, true);
      screenMat.diffuseTexture = tex;
      screenMat.emissiveColor = new Color3(1, 1, 1);
      screenMat.specularColor = new Color3(0, 0, 0);
      screenMat.disableLighting = true;
      
      faceScreen.material = screenMat;
      console.log('[Avatar] Created camera face box + screen for player:', playerId);
    },
    [playerId, scene]
  );

  // Cleanup helper for camera face meshes
  const disposeCameraFacePlane = useCallback(() => {
    const meshNames = [
      `face-box-${playerId}`,
      `face-plane-${playerId}`, // legacy name
      `face-screen-${playerId}`,
    ];
    meshNames.forEach((name) => {
      const mesh = scene.getMeshByName(name);
      if (mesh) {
        mesh.dispose();
      }
    });
  }, [playerId, scene]);

  // Create avatar on mount
  useEffect(() => {
    console.log('[Avatar] Creating avatar for player:', playerId, 'isLocal:', isLocal);

    let disposed = false;
    disposedRef.current = false;

    (async () => {
      try {
        const video = isLocal && effectiveVideoElement ? effectiveVideoElement : undefined;

        let avatar: AvatarInstance;
        if (player.avatarUrl) {
          try {
            // Ready Player Me avatar
            console.log('[Avatar] Attempting to load RPM avatar for player:', playerId, 'URL:', player.avatarUrl);
            const rpm = await createRpmAvatar(scene, player.avatarUrl);
            avatar = { ...rpm, kind: 'rpm' };

            console.log('[Avatar] RPM avatar loaded successfully for player:', playerId);
          } catch (rpmError) {
            console.error('[Avatar] RPM avatar failed to load, falling back to simple avatar:', rpmError);
            // Fallback to simple avatar if RPM fails
            avatar = createSimpleAvatar(scene, video);
          }
        } else {
          // Simple block avatar (local uses camera head)
          avatar = createSimpleAvatar(scene, video);
        }

        if (disposed) {
          avatar.root.dispose();
          return;
        }

        avatar.root.position = new Vector3(player.pos.x, player.pos.y, player.pos.z);
        avatar.root.rotation.y = player.rotY;

        interpolatedRef.current = {
          pos: new Vector3(player.pos.x, player.pos.y, player.pos.z),
          rotY: player.rotY,
          headQ: Quaternion.FromArray(player.head.q),
        };

        avatarRef.current = avatar;
        console.log('[Avatar] Avatar created for player:', playerId, 'isRPM:', !!(player.avatarUrl && (avatar as any).kind === 'rpm'));

        if (video && (avatar as any).head) {
          createCameraFacePlane((avatar as any).head, video);
        }
      } catch (e) {
        console.error('[Avatar] Failed to create avatar for player', playerId, e);
        // Last resort: try to create a simple avatar
        try {
          const video = isLocal && videoElement ? videoElement : undefined;
          const fallbackAvatar = createSimpleAvatar(scene, video);
          fallbackAvatar.root.position = new Vector3(player.pos.x, player.pos.y, player.pos.z);
          fallbackAvatar.root.rotation.y = player.rotY;
          avatarRef.current = fallbackAvatar;
          console.log('[Avatar] Created fallback simple avatar for player:', playerId);
        } catch (fallbackError) {
          console.error('[Avatar] Even fallback avatar failed:', fallbackError);
        }
      }
    })();

    return () => {
      disposed = true;
      disposedRef.current = true;
      console.log('[Avatar] Disposing avatar for player:', playerId);
      if (avatarRef.current) {
        avatarRef.current.root.dispose();
        avatarRef.current = null;
      }
    };
  }, [scene, playerId, isLocal, player.avatarUrl]); // Only re-run if URL changes

  // Separate effect to handle video updates
  useEffect(() => {
    const avatar = avatarRef.current;

    if (!avatar) {
      disposeCameraFacePlane();
      return;
    }

    const headNode = (avatar as any).head;
    if (!headNode) {
      disposeCameraFacePlane();
      return;
    }

    if (!effectiveVideoElement) {
      disposeCameraFacePlane();
      return;
    }

    createCameraFacePlane(headNode, effectiveVideoElement);

    return () => {
      disposeCameraFacePlane();
    };
  }, [effectiveVideoElement, createCameraFacePlane, disposeCameraFacePlane]);

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
      if (state.head?.q && (avatar as any).head) {
        const targetQ = Quaternion.FromArray(state.head.q);
        const lerpFactor = Math.min(1, deltaTime / INTERPOLATION_TIME);
        Quaternion.SlerpToRef(
          interpolated.headQ,
          targetQ,
          lerpFactor,
          interpolated.headQ
        );
        
        // Apply rotation to head mesh
        const headNode: any = (avatar as any).head;
        if (headNode) {
          if (!headNode.rotationQuaternion) {
            headNode.rotationQuaternion = Quaternion.Identity();
          }
          headNode.rotationQuaternion.copyFrom(interpolated.headQ);
        }
      }

      // Handle RPM avatar animations
      const isRpmAvatar = (avatar as any).kind === 'rpm' && (avatar as any).animationGroups;
      if (isRpmAvatar) {
        const animationGroups = (avatar as any).animationGroups as any[];
        const currentAnim = state.anim || 'idle';
        
        // Find and play appropriate animation
        const targetAnim = animationGroups.find((ag: any) => {
          const name = ag.name?.toLowerCase() || '';
          if (currentAnim === 'walk') {
            return name.includes('walk') || name.includes('run');
          } else {
            return name.includes('idle') || name.includes('tpose');
          }
        });
        
        // Stop all other animations
        animationGroups.forEach((ag: any) => {
          if (ag !== targetAnim && ag.isPlaying) {
            ag.stop();
          }
        });
        
        // Play target animation
        if (targetAnim && !targetAnim.isPlaying) {
          targetAnim.play(true); // loop
          console.log('[Avatar] Playing RPM animation:', targetAnim.name, 'for player:', playerId);
        }
      }

      const time = performance.now() / 180; // shared phase for simple animations

      // Only apply procedural body/limb animation for simple avatars
      const isSimpleAvatar =
        (avatar as any).leftArm &&
        (avatar as any).rightArm &&
        (avatar as any).leftLeg &&
        (avatar as any).rightLeg &&
        (avatar as any).body;

      if (isSimpleAvatar) {
        // Simple walk / idle animation
        if (state.anim === 'walk') {
          const walkBob = Math.sin(time * 2) * 0.05;
          // Body bob
          (avatar as any).body.position.y = 1.4 + walkBob;

          // Arm swing (opposite phase)
          const swing = Math.sin(time * 2) * 0.4;
          const counterSwing = Math.sin(time * 2 + Math.PI) * 0.4;
          (avatar as any).leftArm.rotation.x = swing;
          (avatar as any).rightArm.rotation.x = counterSwing;

          // Simple leg swing
          (avatar as any).leftLeg.rotation.x = counterSwing * 0.5;
          (avatar as any).rightLeg.rotation.x = swing * 0.5;
        } else {
          // Idle: slight breathing / sway
          const idleT = performance.now() / 1000;
          (avatar as any).body.position.y = 1.4 + Math.sin(idleT * 0.5) * 0.01;
          (avatar as any).body.rotation.x = -0.05 + Math.sin(idleT * 0.25) * 0.01;

          // Relax arms and legs towards default pose
          (avatar as any).leftArm.rotation.x *= 0.9;
          (avatar as any).rightArm.rotation.x *= 0.9;
          (avatar as any).leftLeg.rotation.x *= 0.9;
          (avatar as any).rightLeg.rotation.x *= 0.9;
        }

        // Ensure base body height when no extra bob is applied
        if (state.anim !== 'walk') {
          (avatar as any).body.position.y = 1.4;
        }
      }
    });

    return () => {
      scene.onBeforeRenderObservable.remove(observer);
    };
  }, [scene, isLocal, getLocalState]);

  return null;
}
