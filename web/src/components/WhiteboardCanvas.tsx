import { useEffect, useRef } from 'react';
import { DynamicTexture } from '@babylonjs/core';
import { getMyId } from '../multiplayer/playroom';
import { broadcastStroke, type DrawingStroke } from '../multiplayer/whiteboardSync';

const TEXTURE_SIZE = 1024;
const DEFAULT_COLOR = '#000000';
const DEFAULT_LINE_WIDTH = 5;

type WhiteboardCanvasProps = {
  drawingMode: boolean;
  onExitDrawingMode: () => void;
  textureRef: React.MutableRefObject<DynamicTexture | null>;
  onTextureUpdated: () => void;
};

export function WhiteboardCanvas({ 
  drawingMode, 
  onExitDrawingMode, 
  textureRef,
  onTextureUpdated
}: WhiteboardCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const currentStrokeRef = useRef<DrawingStroke | null>(null);

  // Function to save canvas as new texture asset (like a painting)
  const saveCanvasToTexture = () => {
    if (!canvasRef.current || !textureRef.current) {
      console.error('[WhiteboardCanvas] Cannot save: canvas or texture ref is null');
      return;
    }
    
    const canvas = canvasRef.current;
    const texture = textureRef.current;
    
    try {
      // Convert canvas to image data
      const imageData = canvas.toDataURL('image/png');
      
      // Create a new image from the data URL
      const img = new Image();
      
      img.onload = () => {
        try {
          const textureCtx = texture.getContext();
          
          // Clear and draw the new image onto texture
          textureCtx.clearRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
          textureCtx.fillStyle = '#f5f5f0';
          textureCtx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
          
          // Flip horizontally (X-axis only): save context, flip, draw, restore
          textureCtx.save();
          textureCtx.scale(-1, 1);
          textureCtx.translate(-TEXTURE_SIZE, 0);
          
          // Draw the canvas image scaled to texture size (now flipped horizontally)
          textureCtx.drawImage(img, 0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
          
          textureCtx.restore();
          
          // Update the texture
          texture.update();
          
          // Force internal texture update
          const internalTexture = texture.getInternalTexture();
          if (internalTexture) {
            internalTexture.update();
          }
          
          console.log('[WhiteboardCanvas] ✅ Saved canvas as new texture asset');
          
          // Notify that texture was updated
          onTextureUpdated();
        } catch (error) {
          console.error('[WhiteboardCanvas] Error drawing image to texture', error);
        }
      };
      
      img.onerror = (error) => {
        console.error('[WhiteboardCanvas] Error loading image from canvas', error);
      };
      
      img.src = imageData;
      
    } catch (error) {
      console.error('[WhiteboardCanvas] Error converting canvas to texture', error);
    }
  };

  // Function to handle Done button
  const handleDone = () => {
    // Save any pending stroke
    if (currentStrokeRef.current && currentStrokeRef.current.points.length >= 2) {
      broadcastStroke(currentStrokeRef.current);
      currentStrokeRef.current = null;
    }
    
    // Save canvas as new texture asset
    saveCanvasToTexture();
    
    // Small delay to ensure texture update completes
    setTimeout(() => {
      // Exit drawing mode
      onExitDrawingMode();
    }, 100);
  };

  // Function to handle Cancel button
  const handleCancel = () => {
    // Just exit without saving
    onExitDrawingMode();
  };

  // Initialize canvas when entering drawing mode
  useEffect(() => {
    if (!drawingMode) return;

    // Create container for canvas and buttons
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.zIndex = '9999';
    container.style.pointerEvents = 'none';
    document.body.appendChild(container);
    containerRef.current = container;

    const canvas = document.createElement('canvas');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.backgroundColor = '#f5f5f0';
    canvas.style.cursor = 'crosshair';
    canvas.style.touchAction = 'none';
    canvas.style.pointerEvents = 'auto';
    container.appendChild(canvas);
    canvasRef.current = canvas;

    // Create button container
    const buttonContainer = document.createElement('div');
    buttonContainer.style.position = 'absolute';
    buttonContainer.style.bottom = '20px';
    buttonContainer.style.left = '50%';
    buttonContainer.style.transform = 'translateX(-50%)';
    buttonContainer.style.display = 'flex';
    buttonContainer.style.gap = '12px';
    buttonContainer.style.pointerEvents = 'auto';
    buttonContainer.style.zIndex = '10000';
    container.appendChild(buttonContainer);

    // Create Done button
    const doneButton = document.createElement('button');
    doneButton.textContent = 'Done';
    doneButton.style.padding = '12px 24px';
    doneButton.style.fontSize = '16px';
    doneButton.style.fontWeight = '600';
    doneButton.style.color = '#ffffff';
    doneButton.style.backgroundColor = '#10b981';
    doneButton.style.border = 'none';
    doneButton.style.borderRadius = '8px';
    doneButton.style.cursor = 'pointer';
    doneButton.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
    doneButton.style.transition = 'background-color 0.2s';
    doneButton.onmouseenter = () => {
      doneButton.style.backgroundColor = '#059669';
    };
    doneButton.onmouseleave = () => {
      doneButton.style.backgroundColor = '#10b981';
    };
    doneButton.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleDone();
    };
    buttonContainer.appendChild(doneButton);

    // Create Cancel button
    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.style.padding = '12px 24px';
    cancelButton.style.fontSize = '16px';
    cancelButton.style.fontWeight = '600';
    cancelButton.style.color = '#ffffff';
    cancelButton.style.backgroundColor = '#6b7280';
    cancelButton.style.border = 'none';
    cancelButton.style.borderRadius = '8px';
    cancelButton.style.cursor = 'pointer';
    cancelButton.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
    cancelButton.style.transition = 'background-color 0.2s';
    cancelButton.onmouseenter = () => {
      cancelButton.style.backgroundColor = '#4b5563';
    };
    cancelButton.onmouseleave = () => {
      cancelButton.style.backgroundColor = '#6b7280';
    };
    cancelButton.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleCancel();
    };
    buttonContainer.appendChild(cancelButton);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Initialize with beige background
    ctx.fillStyle = '#f5f5f0';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Load existing whiteboard content onto canvas
    if (textureRef.current) {
      try {
        const textureCtx = textureRef.current.getContext();
        if (textureCtx && textureCtx.canvas) {
          // Scale texture canvas to fit screen
          ctx.drawImage(textureCtx.canvas, 0, 0, canvas.width, canvas.height);
        }
      } catch (error) {
        console.error('[WhiteboardCanvas] Error loading existing texture', error);
      }
    }

    // Drawing handlers
    const getCanvasPoint = (e: MouseEvent | TouchEvent): { x: number; y: number } | null => {
      const rect = canvas.getBoundingClientRect();
      const clientX = 'touches' in e ? (e.touches[0]?.clientX ?? e.changedTouches[0]?.clientX) : (e as MouseEvent).clientX;
      const clientY = 'touches' in e ? (e.touches[0]?.clientY ?? e.changedTouches[0]?.clientY) : (e as MouseEvent).clientY;
      if (clientX === undefined || clientY === undefined) return null;
      return {
        x: clientX - rect.left,
        y: clientY - rect.top,
      };
    };

    const startDrawing = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const point = getCanvasPoint(e);
      if (!point || !ctx) return;

      isDrawingRef.current = true;
      lastPointRef.current = point;

      const myId = getMyId();
      if (!myId) return;

      // Normalize coordinates (0-1) for texture
      currentStrokeRef.current = {
        id: `${myId}-${Date.now()}-${Math.random()}`,
        points: [{ x: point.x / canvas.width, y: point.y / canvas.height }],
        color: DEFAULT_COLOR,
        lineWidth: DEFAULT_LINE_WIDTH,
        timestamp: Date.now(),
        playerId: myId,
      };
    };

    const draw = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isDrawingRef.current || !ctx || !lastPointRef.current) return;

      const point = getCanvasPoint(e);
      if (!point) return;

      // Draw on canvas
      ctx.beginPath();
      ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
      ctx.lineTo(point.x, point.y);
      ctx.strokeStyle = DEFAULT_COLOR;
      ctx.lineWidth = DEFAULT_LINE_WIDTH;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      // Add to stroke
      if (currentStrokeRef.current) {
        currentStrokeRef.current.points.push({
          x: point.x / canvas.width,
          y: point.y / canvas.height,
        });
      }

      lastPointRef.current = point;
    };

    const stopDrawing = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isDrawingRef.current) return;

      isDrawingRef.current = false;
      lastPointRef.current = null;

      if (currentStrokeRef.current && currentStrokeRef.current.points.length >= 2) {
        broadcastStroke(currentStrokeRef.current);
      }
      currentStrokeRef.current = null;
    };

    // Mouse events
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseleave', stopDrawing);

    // Touch events
    canvas.addEventListener('touchstart', startDrawing, { passive: false });
    canvas.addEventListener('touchmove', draw, { passive: false });
    canvas.addEventListener('touchend', stopDrawing, { passive: false });
    canvas.addEventListener('touchcancel', stopDrawing, { passive: false });

    // ESC key handler (still works for desktop)
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel();
      }
    };
    document.addEventListener('keydown', handleEsc);

    return () => {
      canvas.removeEventListener('mousedown', startDrawing);
      canvas.removeEventListener('mousemove', draw);
      canvas.removeEventListener('mouseup', stopDrawing);
      canvas.removeEventListener('mouseleave', stopDrawing);
      canvas.removeEventListener('touchstart', startDrawing);
      canvas.removeEventListener('touchmove', draw);
      canvas.removeEventListener('touchend', stopDrawing);
      canvas.removeEventListener('touchcancel', stopDrawing);
      document.removeEventListener('keydown', handleEsc);
      
      if (container && container.parentNode) {
        container.parentNode.removeChild(container);
      }
      canvasRef.current = null;
      containerRef.current = null;
    };
  }, [drawingMode, onExitDrawingMode, textureRef, onTextureUpdated]);

  return null;
}

