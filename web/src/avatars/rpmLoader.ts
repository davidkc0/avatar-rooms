import '@babylonjs/loaders/glTF';

import {
  AnimationGroup,
  Bone,
  Mesh,
  MorphTargetManager,
  Scene,
  Skeleton,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';

const RPM_AVATAR_URL =
  'https://models.readyplayer.me/64fa3d2f75b5dc85963d4ef5.glb';

const ARKIT_TO_MORPH: Record<string, string> = {
  browInnerUp: 'browInnerUp',
  eyeBlinkLeft: 'eyeBlinkLeft',
  eyeBlinkRight: 'eyeBlinkRight',
  eyeLookDownLeft: 'eyeLookDownLeft',
  eyeLookDownRight: 'eyeLookDownRight',
  eyeLookInLeft: 'eyeLookInLeft',
  eyeLookInRight: 'eyeLookInRight',
  eyeLookOutLeft: 'eyeLookOutLeft',
  eyeLookOutRight: 'eyeLookOutRight',
  eyeLookUpLeft: 'eyeLookUpLeft',
  eyeLookUpRight: 'eyeLookUpRight',
  eyeSquintLeft: 'eyeSquintLeft',
  eyeSquintRight: 'eyeSquintRight',
  jawOpen: 'jawOpen',
  mouthSmileLeft: 'mouthSmileLeft',
  mouthSmileRight: 'mouthSmileRight',
  mouthFrownLeft: 'mouthFrownLeft',
  mouthFrownRight: 'mouthFrownRight',
  mouthPucker: 'mouthPucker',
  mouthLeft: 'mouthLeft',
  mouthRight: 'mouthRight',
};

export type RpmAvatar = {
  mesh: TransformNode;
  morphTargets: Record<string, number>;
  headBone: Bone | null;
  animationGroups: AnimationGroup[];
};

const findMorphIndices = (mesh: Mesh): Record<string, number> => {
  const manager = mesh.morphTargetManager as MorphTargetManager | null;
  if (!manager) {
    return {};
  }

  const indexMap: Record<string, number> = {};

  manager.getTargets().forEach((target, index) => {
    const targetName = target.name;

    Object.entries(ARKIT_TO_MORPH).forEach(([arkitKey, rpmKey]) => {
      if (targetName === rpmKey) {
        indexMap[arkitKey] = index;
      }
    });
  });

  return indexMap;
};

const findHeadBone = (skeleton: Skeleton | null): Bone | null => {
  if (!skeleton) {
    return null;
  }

  const headLike = ['Head', 'head', 'HeadTop_End', 'HeadTop'];
  return (
    skeleton.bones.find((bone) => headLike.includes(bone.name)) ?? null
  );
};

export async function loadRpmAvatar(
  scene: Scene,
  url: string = RPM_AVATAR_URL
): Promise<RpmAvatar> {
  const result = await SceneLoader.ImportMeshAsync(
    '',
    url.replace(/[^/]+$/, ''),
    url.split('/').pop() ?? '',
    scene
  );

  const root = result.meshes[0];
  const skeleton = result.skeletons[0] ?? null;
  const mesh = root as TransformNode;

  mesh.scaling = new Vector3(1, 1, 1);

  const morphTargets = result.meshes.reduce<Record<string, number>>(
    (acc, current) => {
      if (current instanceof Mesh) {
        const map = findMorphIndices(current);
        Object.assign(acc, map);
      }
      return acc;
    },
    {}
  );

  return {
    mesh,
    morphTargets,
    headBone: findHeadBone(skeleton),
    animationGroups: result.animationGroups ?? [],
  };
}

