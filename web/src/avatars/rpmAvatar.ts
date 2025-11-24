import {
  Scene,
  TransformNode,
  AbstractMesh,
  Vector3,
  Skeleton,
  AnimationGroup,
} from '@babylonjs/core';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import '@babylonjs/loaders';

export type RpmAvatar = {
  root: TransformNode;
  head: AbstractMesh | TransformNode;
  skeleton?: Skeleton;
  animationGroups?: AnimationGroup[];
};

/**
 * Naive Ready Player Me avatar loader for Babylon.
 * Loads a GLB from the given URL and returns a root transform plus a head node
 * (mesh whose name contains 'head', case-insensitive) for attaching the camera face.
 */
export async function createRpmAvatar(
  scene: Scene,
  avatarUrl: string
): Promise<RpmAvatar> {
  console.log('[RPM] Loading avatar from URL:', avatarUrl);
  
  try {
    const result = await SceneLoader.ImportMeshAsync(
      '',
      '',
      avatarUrl,
      scene
    );

    console.log('[RPM] Loaded meshes:', result.meshes.length, 'names:', result.meshes.map(m => m.name));
    console.log('[RPM] Loaded skeletons:', result.skeletons.length);
    console.log('[RPM] Loaded animation groups:', result.animationGroups.length);

    // Create a single root transform to control position/rotation
    const root = new TransformNode('rpm-avatar-root', scene);

    // Parent the model to our container (preserve hierarchy!)
    // We only re-parent the root mesh/node of the imported model.
    // Usually this is result.meshes[0] (__root__).
    if (result.meshes.length > 0) {
      result.meshes[0].setParent(root);
    } else {
      // Fallback: parent any root-level nodes
      result.transformNodes.forEach(node => {
        if (!node.parent) {
          node.setParent(root);
        }
      });
    }

    // Find the skeleton (RPM avatars typically have one)
    const skeleton = result.skeletons[0];

    // Load external animations (Idle, Walk) if skeleton exists
    const extraAnims: AnimationGroup[] = [];
    if (skeleton) {
      const loadAnim = async (name: string, filename: string) => {
        try {
          // Load the animation file (which contains a dummy mesh + skeleton + animation)
          const animResult = await SceneLoader.ImportMeshAsync('', '/animations/', filename, scene);
          
          // Hide the loaded dummy meshes so they don't clutter the scene
          animResult.meshes.forEach(m => {
            m.setEnabled(false);
            // Ensure we don't pick them
            m.isPickable = false;
          });

          const ag = animResult.animationGroups[0];
          if (ag) {
            ag.stop();
            ag.name = name; // Rename for easier lookup in Avatar.tsx
            
            // Retarget animation to the RPM avatar's skeleton
            // Mixamo animations often use "mixamorig:BoneName", RPM uses "BoneName"
            ag.targetedAnimations.forEach((ta) => {
              const targetName = ta.target.name;
              const cleanName = targetName.split(':').pop()!; // e.g. "Hips" from "mixamorig:Hips"
              
              // Find corresponding bone in RPM skeleton
              // Exact match or ends with
              const targetBone = skeleton.bones.find(b => 
                b.name === cleanName || 
                b.name === `mixamorig:${cleanName}` ||
                b.name.endsWith(`:${cleanName}`)
              );
              
              if (targetBone) {
                // Babylon GLTF loader links bones to TransformNodes
                const transformNode = targetBone.getTransformNode();
                if (transformNode) {
                  ta.target = transformNode;
                }
              }
            });
            
            extraAnims.push(ag);
            console.log(`[RPM] Loaded and retargeted animation: ${name}`);
          }
        } catch (e) {
          console.warn(`[RPM] Failed to load animation: ${filename}`, e);
        }
      };

      // Load concurrently
      await Promise.all([
        loadAnim('Idle', 'idle.glb'),
        loadAnim('Walking', 'walk.glb')
      ]);
    }

    // Try to find a head-like mesh or bone
    let head: AbstractMesh | TransformNode | null = null;
    
    // 1. Try finding a TransformNode named "Head" (standard in RPM/GLTF)
    // This is the most reliable way to get the head's position/rotation
    head = result.transformNodes.find(n => n.name === 'Head' || n.name === 'Neck') || null;

    // 2. If not found, try via skeleton bones
    if (!head && skeleton) {
      const headBone = skeleton.bones.find((b) => /head/i.test(b.name));
      if (headBone) {
        head = headBone.getTransformNode();
      }
    }
    
    // 3. Fallback: Create a dummy head node at standard height
    if (!head) {
      console.warn('[RPM] Head node not found, creating fallback head at height 1.6m');
      const dummyHead = new TransformNode('dummy-head', scene);
      dummyHead.parent = root;
      dummyHead.position = new Vector3(0, 1.6, 0); // Standard head height
      head = dummyHead;
    }

    console.log('[RPM] Using head:', head.name, 'type:', head.constructor.name);

    // Start at origin
    root.position = new Vector3(0, 0, 0);

    return {
      root,
      head,
      skeleton,
      animationGroups: [...result.animationGroups, ...extraAnims],
    };
  } catch (error) {
    console.error('[RPM] Failed to load avatar from URL:', avatarUrl, error);
    throw error;
  }
}


