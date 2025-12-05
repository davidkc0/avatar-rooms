import { useEffect, useRef } from 'react';
import { SnakeGame } from './SnakeGame';
import { type Direction } from './types';

type SnakeGameCanvasProps = {
  gameMode: boolean;
  onExitGame: () => void;
  onGameOver: (score: number) => void;
};

export function SnakeGameCanvas({
  gameMode,
  onExitGame,
  onGameOver,
}: SnakeGameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<SnakeGame | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!gameMode) {
      // Clean up if game mode is disabled
      if (containerRef.current && containerRef.current.parentNode) {
        containerRef.current.parentNode.removeChild(containerRef.current);
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      containerRef.current = null;
      canvasRef.current = null;
      gameRef.current = null;
      return;
    }

    // Check if container already exists - prevent duplicate creation
    const existingContainer = document.getElementById('snake-game-container');
    if (existingContainer) {
      return; // Already initialized
    }

    // Create container
    const container = document.createElement('div');
    container.id = 'snake-game-container';
    container.style.position = 'fixed';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.zIndex = '9999';
    container.style.backgroundColor = '#000000';
    container.style.pointerEvents = 'none';
    document.body.appendChild(container);
    containerRef.current = container;

    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.style.touchAction = 'none';
    canvas.style.pointerEvents = 'auto';
    canvas.style.imageRendering = 'pixelated';
    container.appendChild(canvas);
    canvasRef.current = canvas;

    // Initialize game
    const game = new SnakeGame({
      gridWidth: 20,
      gridHeight: 20,
      cellSize: 20,
    });
    gameRef.current = game;

    // Get canvas context
    const ctx = canvas.getContext('2d', { willReadFrequently: false });
    if (!ctx) return;

    // Set canvas size - match SnakeTest exactly (400x400)
    const config = game.getConfig();
    const canvasSize = config.gridWidth * config.cellSize; // 20 * 20 = 400
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    canvas.style.width = `${canvasSize}px`;
    canvas.style.height = `${canvasSize}px`;
    
    // Center canvas on screen
    canvas.style.position = 'absolute';
    canvas.style.top = '50%';
    canvas.style.left = '50%';
    canvas.style.transform = 'translate(-50%, -50%)';
    canvas.style.border = '2px solid #666';

    // Set up game state callbacks
    let lastGameState = 'idle';
    game.setOnStateChange((state) => {
      if (state.state === 'gameOver' && lastGameState === 'playing') {
        onGameOver(state.score);
      }
      lastGameState = state.state;
    });

    // Render function
    const render = () => {
      if (!ctx || !gameRef.current) return;
      const state = gameRef.current.getState();
      const config = gameRef.current.getConfig();

      // Clear canvas
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw grid
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1;
      for (let x = 0; x <= config.gridWidth; x++) {
        ctx.beginPath();
        ctx.moveTo(x * config.cellSize, 0);
        ctx.lineTo(x * config.cellSize, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y <= config.gridHeight; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * config.cellSize);
        ctx.lineTo(canvas.width, y * config.cellSize);
        ctx.stroke();
      }

      // Draw snake
      state.snake.forEach((segment, index) => {
        if (index === 0) {
          ctx.fillStyle = '#22c55e'; // Head
        } else {
          ctx.fillStyle = '#4ade80'; // Body
        }
        ctx.fillRect(
          segment.x * config.cellSize + 1,
          segment.y * config.cellSize + 1,
          config.cellSize - 2,
          config.cellSize - 2
        );
      });

      // Draw food
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(
        state.food.x * config.cellSize + 1,
        state.food.y * config.cellSize + 1,
        config.cellSize - 2,
        config.cellSize - 2
      );

      // Draw score
      ctx.fillStyle = '#ffffff';
      ctx.font = '20px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`Score: ${state.score}`, 10, 30);
      ctx.fillText(`Level: ${state.level}`, 10, 55);

      // Draw game over overlay
      if (state.state === 'gameOver') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 32px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Game Over!', canvas.width / 2, canvas.height / 2 - 20);
        ctx.font = '20px monospace';
        ctx.fillText(`Final Score: ${state.score}`, canvas.width / 2, canvas.height / 2 + 20);
      }
    };

    // Game loop - simple approach: update and render every frame
    const gameLoop = () => {
      if (gameRef.current) {
        gameRef.current.update();
        render();
      }
      animationFrameRef.current = requestAnimationFrame(gameLoop);
    };

    animationFrameRef.current = requestAnimationFrame(gameLoop);

    // Don't auto-start - wait for user input

    // Keyboard controls
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!gameRef.current) return;

      // ESC to exit
      if (e.key === 'Escape') {
        onExitGame();
        return;
      }

      const key = e.key.toLowerCase();
      let direction: Direction | null = null;

      if (key === 'arrowup' || key === 'w') direction = 'up';
      else if (key === 'arrowdown' || key === 's') direction = 'down';
      else if (key === 'arrowleft' || key === 'a') direction = 'left';
      else if (key === 'arrowright' || key === 'd') direction = 'right';

      if (direction) {
        e.preventDefault();
        gameRef.current.setDirection(direction);
        const state = gameRef.current.getState();
        if (state.state === 'idle' || state.state === 'gameOver') {
          gameRef.current.start();
        }
      }
    };

    // Touch controls (swipe gestures)
    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length > 0) {
        touchStartRef.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
        };
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      if (!touchStartRef.current || !gameRef.current) return;
      if (e.changedTouches.length === 0) return;

      const touchEnd = {
        x: e.changedTouches[0].clientX,
        y: e.changedTouches[0].clientY,
      };

      const dx = touchEnd.x - touchStartRef.current.x;
      const dy = touchEnd.y - touchStartRef.current.y;
      const minSwipeDistance = 30;

      if (Math.abs(dx) > Math.abs(dy)) {
        // Horizontal swipe
        if (Math.abs(dx) > minSwipeDistance) {
          const direction = dx > 0 ? 'right' : 'left';
          gameRef.current.setDirection(direction);
          const state = gameRef.current.getState();
          if (state.state === 'idle' || state.state === 'gameOver') {
            gameRef.current.start();
          }
        }
      } else {
        // Vertical swipe
        if (Math.abs(dy) > minSwipeDistance) {
          const direction = dy > 0 ? 'down' : 'up';
          gameRef.current.setDirection(direction);
          const state = gameRef.current.getState();
          if (state.state === 'idle' || state.state === 'gameOver') {
            gameRef.current.start();
          }
        }
      }

      touchStartRef.current = null;
    };

    // Add event listeners
    window.addEventListener('keydown', handleKeyDown);
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
    canvas.addEventListener('touchcancel', handleTouchEnd, { passive: false });

    // Initial render
    render();

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (canvas) {
        canvas.removeEventListener('touchstart', handleTouchStart);
        canvas.removeEventListener('touchend', handleTouchEnd);
        canvas.removeEventListener('touchcancel', handleTouchEnd);
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (container && container.parentNode) {
        container.parentNode.removeChild(container);
      }
      canvasRef.current = null;
      containerRef.current = null;
      gameRef.current = null;
    };
  }, [gameMode, onExitGame, onGameOver]);

  return null;
}
