import { useEffect, useRef } from 'react';
import { useScene } from './scene';
import {
  MeshBuilder,
  StandardMaterial,
  Vector3,
  AbstractMesh,
  ActionManager,
  ExecuteCodeAction,
} from '@babylonjs/core';

type WhiteboardButtonProps = {
  whiteboardMesh: AbstractMesh | null;
  onToggleDrawingMode: () => void;
  isDrawingMode: boolean;
};

export function WhiteboardButton({ whiteboardMesh, onToggleDrawingMode, isDrawingMode }: WhiteboardButtonProps) {
  const { scene } = useScene();
  const buttonRef = useRef<AbstractMesh | null>(null);
  const toggleCallbackRef = useRef(onToggleDrawingMode);
  
  // Update callback ref when it changes
  useEffect(() => {
    toggleCallbackRef.current = onToggleDrawingMode;
  }, [onToggleDrawingMode]);

  useEffect(() => {
    if (!whiteboardMesh) return;
    
    // Check if button already exists in scene
    const existingButton = scene.getMeshByName('whiteboardButton');
    if (existingButton) {
      buttonRef.current = existingButton as AbstractMesh;
      return;
    }

    // Create button mesh - small box positioned on the whiteboard
    const button = MeshBuilder.CreateBox(
      'whiteboardButton',
      { width: 0.8, height: 0.4, depth: 0.1 },
      scene
    );
    
    // Position button on the whiteboard (slightly in front, top-right area)
    // Whiteboard is at z = -10, so button at z = -9.95 (slightly forward)
    button.position = new Vector3(8, 3.2, -9.95);
    
    // Create material for button
    const buttonMaterial = new StandardMaterial('whiteboardButtonMaterial', scene);
    buttonMaterial.diffuseColor = isDrawingMode 
      ? { r: 0.8, g: 0.2, b: 0.2, a: 1 } as any // Red when in drawing mode
      : { r: 0.2, g: 0.6, b: 0.9, a: 1 } as any; // Blue when not in drawing mode
    buttonMaterial.emissiveColor = isDrawingMode
      ? { r: 0.8, g: 0.2, b: 0.2, a: 1 } as any
      : { r: 0.2, g: 0.6, b: 0.9, a: 1 } as any;
    buttonMaterial.disableLighting = true;
    button.material = buttonMaterial;
    
    // Enable picking
    button.isPickable = true;
    
    // Add action manager for click detection
    button.actionManager = new ActionManager(scene);
    
    // Add click action - use OnPickDownTrigger for better reliability
    button.actionManager.registerAction(
      new ExecuteCodeAction(
        ActionManager.OnPickDownTrigger,
        (evt) => {
          evt.sourceEvent?.stopPropagation?.();
          evt.sourceEvent?.preventDefault?.();
          toggleCallbackRef.current();
        }
      )
    );
    
    buttonRef.current = button;

    return () => {
      // Don't dispose on cleanup - let it persist
      // Only dispose if component unmounts completely
    };
  }, [scene, whiteboardMesh]);

  // Update button color when drawing mode changes
  useEffect(() => {
    if (!buttonRef.current || !buttonRef.current.material) return;
    
    const material = buttonRef.current.material as StandardMaterial;
    if (isDrawingMode) {
      material.diffuseColor = { r: 0.8, g: 0.2, b: 0.2, a: 1 } as any; // Red
      material.emissiveColor = { r: 0.8, g: 0.2, b: 0.2, a: 1 } as any;
    } else {
      material.diffuseColor = { r: 0.2, g: 0.6, b: 0.9, a: 1 } as any; // Blue
      material.emissiveColor = { r: 0.2, g: 0.6, b: 0.9, a: 1 } as any;
    }
    material.markAsDirty();
  }, [isDrawingMode]);

  return null;
}

