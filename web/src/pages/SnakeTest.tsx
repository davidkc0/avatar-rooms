import { useEffect, useRef, useState } from 'react';
import { SnakeGame } from '../games/snake/SnakeGame';
import { type Direction } from '../games/snake/types';

export default function SnakeTest() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<SnakeGame | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [gameState, setGameState] = useState<'idle' | 'playing' | 'paused' | 'gameOver'>('idle');
  const [level, setLevel] = useState(1);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Initialize game
    const game = new SnakeGame({
      gridWidth: 20,
      gridHeight: 20,
      cellSize: 20,
    });
    gameRef.current = game;

    // Set up state callbacks
    game.setOnStateChange((state) => {
      setScore(state.score);
      setHighScore(state.highScore);
      setGameState(state.state);
      setLevel(state.level);
    });

    game.setOnScoreChange((newScore) => {
      setScore(newScore);
    });

    // Get canvas context
    const ctx = canvas.getContext('2d', { willReadFrequently: false });
    if (!ctx) return;

    // Set canvas size
    const config = game.getConfig();
    canvas.width = config.gridWidth * config.cellSize;
    canvas.height = config.gridHeight * config.cellSize;

    // Render function
    const render = (ctx: CanvasRenderingContext2D, game: SnakeGame) => {
      const state = game.getState();
      const config = game.getConfig();

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
    ctx.fillStyle = '#4ade80';
    state.snake.forEach((segment, index) => {
      if (index === 0) {
        // Head
        ctx.fillStyle = '#22c55e';
      } else {
        ctx.fillStyle = '#4ade80';
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
    };

    // Game loop - simple approach: update and render every frame
    const gameLoop = () => {
      if (gameRef.current) {
        gameRef.current.update();
        render(ctx, gameRef.current);
      }
      animationFrameRef.current = requestAnimationFrame(gameLoop);
    };

    animationFrameRef.current = requestAnimationFrame(gameLoop);

    // Don't auto-start - wait for user to press Start button or arrow key

    // Keyboard controls
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!gameRef.current) return;

      const key = e.key.toLowerCase();
      let direction: Direction | null = null;

      if (key === 'arrowup' || key === 'w') direction = 'up';
      else if (key === 'arrowdown' || key === 's') direction = 'down';
      else if (key === 'arrowleft' || key === 'a') direction = 'left';
      else if (key === 'arrowright' || key === 'd') direction = 'right';
      else if (key === ' ') {
        // Space to pause/resume
        const currentState = gameRef.current.getState();
        if (currentState.state === 'playing') {
          gameRef.current.pause();
        } else if (currentState.state === 'paused') {
          gameRef.current.resume();
        }
        return;
      }

      if (direction) {
        gameRef.current.setDirection(direction);
        const currentState = gameRef.current.getState();
        if (currentState.state === 'idle' || currentState.state === 'gameOver') {
          gameRef.current.start();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    // Initial render
    render(ctx, game);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [gameState]);

  const handleStart = () => {
    if (!gameRef.current) return;
    const currentState = gameRef.current.getState();
    // Only start if idle or gameOver
    if (currentState.state === 'idle' || currentState.state === 'gameOver') {
      gameRef.current.start();
    } else if (currentState.state === 'paused') {
      // If paused, resume instead
      gameRef.current.resume();
    }
    // If already playing, do nothing
  };

  const handleReset = () => {
    if (gameRef.current) {
      gameRef.current.reset();
    }
  };

  const handlePause = () => {
    if (!gameRef.current) return;
    const currentState = gameRef.current.getState();
    // Toggle pause/resume - do NOT reset anything
    if (currentState.state === 'playing') {
      gameRef.current.pause();
    } else if (currentState.state === 'paused') {
      gameRef.current.resume();
    }
  };

  return (
    <div className="fixed inset-0 bg-black flex flex-col items-center justify-center p-4">
      <div className="mb-4 text-center">
        <h1 className="text-3xl font-bold text-white mb-2">Snake Game Test</h1>
        <div className="flex gap-4 justify-center text-white">
          <div>Score: {score}</div>
          <div>High Score: {highScore}</div>
          <div>Level: {level}</div>
        </div>
        <div className="mt-2 text-sm text-gray-400">
          {gameState === 'idle' && 'Press arrow keys or WASD to start'}
          {gameState === 'playing' && 'Playing... (Space to pause)'}
          {gameState === 'paused' && 'Paused (Space to resume)'}
          {gameState === 'gameOver' && 'Game Over! Press Start to play again'}
        </div>
      </div>

      <canvas
        ref={canvasRef}
        className="border-2 border-gray-600 bg-black"
        style={{ imageRendering: 'pixelated' }}
      />

      <div className="mt-4 flex gap-4">
        <button
          onClick={handleStart}
          disabled={gameState === 'playing'}
          className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Start
        </button>
        <button
          onClick={handlePause}
          disabled={gameState === 'idle' || gameState === 'gameOver'}
          className="px-4 py-2 bg-yellow-600 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {gameState === 'paused' ? 'Resume' : 'Pause'}
        </button>
        <button
          onClick={handleReset}
          className="px-4 py-2 bg-red-600 text-white rounded"
        >
          Reset
        </button>
      </div>

      <div className="mt-4 text-sm text-gray-400 text-center max-w-md">
        <p>Controls: Arrow keys or WASD to move</p>
        <p>Space to pause/resume</p>
      </div>
    </div>
  );
}
