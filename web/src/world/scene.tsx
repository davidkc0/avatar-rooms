import '@babylonjs/core/Loading/loadingScreen';

import {
  ArcRotateCamera,
  Engine,
  HemisphericLight,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
  Texture,
} from '@babylonjs/core';
import {
  PropsWithChildren,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

const CAMERA_ALPHA = Math.PI / 2;
const CAMERA_BETA = Math.PI / 3;
const CAMERA_RADIUS = 6;

type SceneContextValue = {
  engine: Engine;
  scene: Scene;
  canvas: HTMLCanvasElement;
  camera: ArcRotateCamera;
};

const SceneContext = createContext<SceneContextValue | null>(null);

export const useScene = () => {
  const value = useContext(SceneContext);
  if (!value) {
    throw new Error('useScene must be used inside a <SceneRoot>');
  }
  return value;
};

const useBabylon = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [engine, setEngine] = useState<Engine | null>(null);
  const [scene, setScene] = useState<Scene | null>(null);
  const cameraRef = useRef<ArcRotateCamera | null>(null);
  const [camera, setCamera] = useState<ArcRotateCamera | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const engineInstance = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
    });
    const sceneInstance = new Scene(engineInstance);

    const camera = new ArcRotateCamera(
      'camera',
      CAMERA_ALPHA,
      CAMERA_BETA,
      CAMERA_RADIUS,
      new Vector3(0, 1, 0),
      sceneInstance
    );
    camera.attachControl(canvas, true);
    camera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput');
    camera.minZ = 0.1;
    camera.lowerBetaLimit = 0.1;
    camera.upperBetaLimit = Math.PI / 2;
    camera.panningSensibility = 0;
    cameraRef.current = camera;
    setCamera(camera);

    new HemisphericLight('light', new Vector3(0, 1, 0), sceneInstance);

    const ground = MeshBuilder.CreateGround(
      'ground',
      { width: 20, height: 20 },
      sceneInstance
    );
    const groundMaterial = new StandardMaterial('ground-mat', sceneInstance);
    groundMaterial.diffuseColor = { r: 0.4, g: 0.3, b: 0.2, a: 1 } as any; // Warm wood tone
    const woodTexture = new Texture(
      '/wood-floor.jpg',
      sceneInstance
    );
    woodTexture.uScale = 4; // Adjust based on your texture - lower = larger tiles
    woodTexture.vScale = 4;
    groundMaterial.diffuseTexture = woodTexture;
    ground.material = groundMaterial;

    // Reference cubes
    const box1 = MeshBuilder.CreateBox('box1', { size: 1 }, sceneInstance);
    box1.position.set(2, 0.5, 2);
    const mat1 = new StandardMaterial('mat1', sceneInstance);
    mat1.diffuseColor = { r: 0.8, g: 0.2, b: 0.2, a: 1 } as any;
    box1.material = mat1;

    const box2 = MeshBuilder.CreateBox('box2', { size: 1 }, sceneInstance);
    box2.position.set(-3, 0.5, 1);
    const mat2 = new StandardMaterial('mat2', sceneInstance);
    mat2.diffuseColor = { r: 0.2, g: 0.8, b: 0.2, a: 1 } as any;
    box2.material = mat2;

    const box3 = MeshBuilder.CreateBox('box3', { size: 1 }, sceneInstance);
    box3.position.set(0, 0.5, -4);
    const mat3 = new StandardMaterial('mat3', sceneInstance);
    mat3.diffuseColor = { r: 0.2, g: 0.2, b: 0.8, a: 1 } as any;
    box3.material = mat3;

    setEngine(engineInstance);
    setScene(sceneInstance);

    const resize = () => {
      engineInstance.resize();
    };

    window.addEventListener('resize', resize);

    engineInstance.runRenderLoop(() => {
      sceneInstance.render();
    });

    return () => {
      window.removeEventListener('resize', resize);
      engineInstance.stopRenderLoop();
      sceneInstance.dispose();
      engineInstance.dispose();
      cameraRef.current = null;
      setCamera(null);
    };
  }, []);

  return { canvasRef, engine, scene, camera };
};

export function SceneRoot({ children }: PropsWithChildren) {
  const { canvasRef, engine, scene, camera } = useBabylon();
  const contextValue = useMemo(() => {
    if (!engine || !scene || !canvasRef.current || !camera) {
      return null;
    }
    return {
      engine,
      scene,
      canvas: canvasRef.current,
      camera,
    };
  }, [engine, scene, camera, canvasRef]);

  return (
    <div className="relative h-full w-full">
      <canvas ref={canvasRef} className="h-full w-full" />
      {contextValue ? (
        <SceneContext.Provider value={contextValue}>
          {children}
        </SceneContext.Provider>
      ) : null}
    </div>
  );
}
