import { useEffect, useRef } from 'react';
import { useScene } from './scene';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import '@babylonjs/loaders';
import { Vector3, AbstractMesh } from '@babylonjs/core';

type FurnitureProps = {
  modelPath: string;
  modelName: string;
  position: Vector3;
  rotation?: Vector3;
  scale?: Vector3;
};

export function Furniture({ 
  modelPath, 
  modelName, 
  position, 
  rotation = Vector3.Zero(),
  scale = new Vector3(1, 1, 1)
}: FurnitureProps) {
  const { scene } = useScene();
  const loadedMeshesRef = useRef<AbstractMesh[]>([]);

  useEffect(() => {
    if (!scene) return;

    let disposed = false;

    (async () => {
      try {
        console.log(`[Furniture] Loading ${modelName} from ${modelPath}`);
        
        const result = await SceneLoader.ImportMeshAsync(
          '', // Load all meshes
          modelPath,
          modelName,
          scene
        );

        if (disposed) {
          // Clean up if component was unmounted during load
          result.meshes.forEach(mesh => mesh.dispose());
          return;
        }

        console.log(`[Furniture] Loaded ${result.meshes.length} meshes for ${modelName}`);

        // Create a root transform node to control position/rotation/scale
        const rootMesh = result.meshes[0];
        if (rootMesh) {
          // Set position, rotation, and scale
          rootMesh.position = position.clone();
          rootMesh.rotation = rotation.clone();
          rootMesh.scaling = scale.clone();

          // Enable collision detection
          rootMesh.checkCollisions = true;

          // Fix blinking/z-fighting issues
          // Use renderingGroupId 0 (same as walls) so furniture renders behind avatars
          rootMesh.renderingGroupId = 0;
          
          // Configure all meshes with zOffset and pre-compile shaders
          const materialPromises: Promise<any>[] = [];
          result.meshes.forEach(mesh => {
            mesh.renderingGroupId = 0; // Render with background objects, not in front
            // Apply zOffset to materials to prevent z-fighting
            if (mesh.material) {
              const material = mesh.material as any;
              material.zOffset = 1.5; // Even higher zOffset to prevent z-fighting with negative scale
              material.backFaceCulling = false; // Disable back face culling
              // Mark material as always active to prevent flickering
              material.needDepthPrePass = true;
              // Ensure proper depth testing
              material.disableDepthWrite = false;
              // Force material to be marked as dirty to ensure updates
              material.markAsDirty();
              // Pre-compile shader to prevent flickering during initial rendering
              if (material.forceCompilationAsync) {
                materialPromises.push(
                  material.forceCompilationAsync(mesh).catch((err: any) => {
                    console.warn(`[Furniture] Shader compilation warning:`, err);
                  })
                );
              }
            }
          });
          
          // Wait for all shaders to compile before continuing
          await Promise.all(materialPromises);

          // Store reference for cleanup
          loadedMeshesRef.current = result.meshes;

          console.log(`[Furniture] Positioned ${modelName} at`, position);
        }
      } catch (error) {
        console.error(`[Furniture] Failed to load ${modelName}:`, error);
      }
    })();

    return () => {
      disposed = true;
      // Cleanup: dispose all loaded meshes
      loadedMeshesRef.current.forEach(mesh => {
        if (mesh && !mesh.isDisposed()) {
          mesh.dispose();
        }
      });
      loadedMeshesRef.current = [];
    };
  }, [scene, modelPath, modelName, position, rotation, scale]);

  return null;
}

