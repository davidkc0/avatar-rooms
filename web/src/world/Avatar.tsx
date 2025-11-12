import {
  AnimationPropertiesOverride,
  Animatable,
  Mesh,
  Quaternion,
  Scene,
  Skeleton,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import { useEffect, useRef } from 'react';
import { loadRpmAvatar } from '../avatars/rpmLoader';
import { PlayerState } from '../multiplayer/playroom';
import { useScene } from './scene';

type AvatarTemplate = {
  mesh: TransformNode;
  morphTargets: Record<string, number>;
  headBoneName: string | null;
  idleRangeName?: string;
  walkRangeName?: string;
};

type AvatarInstance = {
  root: TransformNode;
  skeleton: Skeleton | null;
  headBone: ReturnType<Skeleton['getBoneByName']> | null;
  blendMeshes: Mesh[];
  morphTargets: Record<string, number>;
  lastBlend: Record<string, number>;
  currentAnim: Animatable | null;
  currentAnimState: PlayerState['anim'] | null;
  idleRangeName?: string;
  walkRangeName?: string;
};

const templateCache = new WeakMap<
  Scene,
  Promise<AvatarTemplate>
>();

const clamp01 = (value: number) =>
  Math.min(1, Math.max(0, value));

const findSkeleton = (root: TransformNode): Skeleton | null => {
  const meshWithSkeleton = root
    .getChildMeshes(false)
    .find((child) => child.skeleton);
  return meshWithSkeleton?.skeleton ?? null;
};

const gatherBlendMeshes = (root: TransformNode): Mesh[] =>
  root
    .getChildMeshes(false)
    .filter(
      (child): child is Mesh =>
        child instanceof Mesh && !!child.morphTargetManager
    );

const findAnimationRangeName = (
  skeleton: Skeleton | null,
  keyword: string
) => {
  if (!skeleton || !skeleton.getAnimationRanges) {
    return undefined;
  }

  const ranges = skeleton.getAnimationRanges() ?? [];
  const match = ranges.find((range) =>
    range.name.toLowerCase().includes(keyword)
  );
  return match?.name;
};

const loadTemplate = async (
  scene: Scene
): Promise<AvatarTemplate> => {
  let promise = templateCache.get(scene);
  if (promise) {
    return promise;
  }

  promise = (async () => {
    const avatar = await loadRpmAvatar(scene);
    avatar.mesh.setEnabled(false);
    avatar.mesh.isVisible = false;
    avatar.mesh.getChildMeshes(false).forEach((child) => {
      child.isVisible = false;
      child.isPickable = false;
    });

    avatar.animationGroups.forEach((group) => {
      group.stop();
    });

    const skeleton = findSkeleton(avatar.mesh);

    const idleRangeName = findAnimationRangeName(skeleton, 'idle');
    const walkRangeName = findAnimationRangeName(skeleton, 'walk');

    return {
      mesh: avatar.mesh,
      morphTargets: avatar.morphTargets,
      headBoneName: avatar.headBone?.name ?? null,
      idleRangeName,
      walkRangeName,
    };
  })();

  templateCache.set(scene, promise);
  return promise;
};

type AvatarProps = {
  playerId: string;
  player: PlayerState;
  isLocal?: boolean;
};

const INTERPOLATION_TIME = 0.12; // 120ms

type InterpolatedState = {
  pos: Vector3;
  rotY: number;
  headQ: Quaternion;
};

export function Avatar({ playerId, player, isLocal = false }: AvatarProps) {
  const { scene } = useScene();
  const instanceRef = useRef<AvatarInstance | null>(null);
  const playerStateRef = useRef(player);
  const interpolatedRef = useRef<InterpolatedState | null>(null);
  const targetStateRef = useRef<PlayerState>(player);

  playerStateRef.current = player;
  targetStateRef.current = player;

  useEffect(() => {
    let disposed = false;
    let template: AvatarTemplate;

    const setup = async () => {
      template = await loadTemplate(scene);
      if (disposed) {
        return;
      }

      const clone = template.mesh.clone(
        `avatar-${playerId}`,
        null,
        true
      ) as TransformNode;

      clone.setEnabled(true);
      clone.isVisible = true;
      clone.position = new Vector3();

      const skeleton = findSkeleton(clone);

      const headBone =
        (template.headBoneName && skeleton
          ? skeleton.getBoneByName(template.headBoneName)
          : null) ?? null;

      const blendMeshes = gatherBlendMeshes(clone);

      instanceRef.current = {
        root: clone,
        skeleton,
        headBone,
        blendMeshes,
        morphTargets: template.morphTargets,
        lastBlend: {},
        currentAnim: null,
        currentAnimState: null,
        idleRangeName: template.idleRangeName,
        walkRangeName: template.walkRangeName,
      };

      // Initialize interpolated state
      interpolatedRef.current = {
        pos: new Vector3(player.pos.x, player.pos.y, player.pos.z),
        rotY: player.rotY,
        headQ: Quaternion.FromArray(player.head.q),
      };
    };

    setup().catch((error) => {
      console.error('[Avatar] Failed to load avatar', error);
    });

    return () => {
      disposed = true;
      const instance = instanceRef.current;
      if (instance) {
        instance.currentAnim?.stop();
        instance.root.dispose();
      }
      instanceRef.current = null;
    };
  }, [scene, playerId]);

  useEffect(() => {
    const observer = scene.onBeforeRenderObservable.add(() => {
      const instance = instanceRef.current;
      if (!instance || !interpolatedRef.current) {
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
        instance.root.position.set(state.pos.x, state.pos.y, state.pos.z);
        instance.root.rotation.y = state.rotY;
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

        instance.root.position.copyFrom(interpolated.pos);
        instance.root.rotation.y = interpolated.rotY;
      }

      // Head rotation (always interpolate for smoothness)
      if (instance.headBone && state.head?.q) {
        const targetQ = Quaternion.FromArray(state.head.q);
        if (!instance.headBone.rotationQuaternion) {
          instance.headBone.rotationQuaternion = Quaternion.Identity();
        }
        const lerpFactor = Math.min(1, deltaTime / INTERPOLATION_TIME);
        Quaternion.SlerpToRef(
          interpolated.headQ,
          targetQ,
          lerpFactor,
          interpolated.headQ
        );
        instance.headBone.rotationQuaternion.copyFrom(interpolated.headQ);
      }

      const blend = state.blend ?? {};
      Object.entries(instance.morphTargets).forEach(
        ([arkitKey, index]) => {
          const value = clamp01(blend[arkitKey] ?? 0);
          if (instance.lastBlend[arkitKey] === value) {
            return;
          }

          instance.lastBlend[arkitKey] = value;

          instance.blendMeshes.forEach((mesh) => {
            const manager = mesh.morphTargetManager;
            const target = manager?.getTarget(index);
            if (target) {
              target.influence = value;
            }
          });
        }
      );

      if (instance.skeleton) {
        instance.skeleton.animationPropertiesOverride ??=
          new AnimationPropertiesOverride();
      }

      const desiredAnim = state.anim;
      if (desiredAnim !== instance.currentAnimState) {
        instance.currentAnim?.stop();
        instance.currentAnim = null;

        const rangeName =
          desiredAnim === 'walk'
            ? instance.walkRangeName ?? instance.idleRangeName
            : instance.idleRangeName ?? instance.walkRangeName;

        if (
          rangeName &&
          instance.skeleton?.getAnimationRange(rangeName)
        ) {
          const range =
            instance.skeleton.getAnimationRange(rangeName);
          if (range) {
            instance.currentAnim = scene.beginAnimation(
              instance.skeleton,
              range.from,
              range.to,
              true,
              desiredAnim === 'walk' ? 1.2 : 1
            );
          }
        } else if (
          instance.skeleton?.animationPropertiesOverride
        ) {
          instance.skeleton.animationPropertiesOverride.speedRatio =
            desiredAnim === 'walk' ? 1.2 : 1;
        }

        instance.currentAnimState = desiredAnim;
      } else if (
        instance.skeleton?.animationPropertiesOverride
      ) {
        instance.skeleton.animationPropertiesOverride.speedRatio =
          desiredAnim === 'walk' ? 1.2 : 1;
      }
    });

    return () => {
      scene.onBeforeRenderObservable.remove(observer);
    };
  }, [scene]);

  return null;
}

