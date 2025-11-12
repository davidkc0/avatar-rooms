import '@babylonjs/core/Loading/loadingScreen';

import {
  ArcRotateCamera,
  Engine,
  HemisphericLight,
  MeshBuilder,
  Scene,
  Vector3,
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
    camera.minZ = 0.1;
    camera.lowerBetaLimit = 0.1;
    camera.upperBetaLimit = Math.PI / 2;
    camera.panningSensibility = 0;

    new HemisphericLight('light', new Vector3(0, 1, 0), sceneInstance);

    MeshBuilder.CreateGround(
      'ground',
      { width: 20, height: 20 },
      sceneInstance
    );

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
    };
  }, []);

  return { canvasRef, engine, scene };
};

export function SceneRoot({ children }: PropsWithChildren) {
  const { canvasRef, engine, scene } = useBabylon();
  const contextValue = useMemo(() => {
    if (!engine || !scene || !canvasRef.current) {
      return null;
    }
    return {
      engine,
      scene,
      canvas: canvasRef.current,
    };
  }, [engine, scene]);

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

