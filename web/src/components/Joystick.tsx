import { useEffect, useRef, useState } from 'react';
import { useJoystickMovement } from '../state/movement';

const JOYSTICK_SIZE = 80;
const JOYSTICK_RADIUS = 40;
const DEADZONE = 0.1;
const SMOOTHING = 0.2; // 0-1 (higher is snappier)

type Vector = { x: number; y: number };
const lerp = (start: Vector, end: Vector, t: number): Vector => ({
  x: start.x + (end.x - start.x) * t,
  y: start.y + (end.y - start.y) * t,
});

export function Joystick() {
  const [, setInput] = useJoystickMovement();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isActive, setIsActive] = useState(false);
  const [position, setPosition] = useState<Vector>({ x: 0, y: 0 });
  const targetPositionRef = useRef<Vector>({ x: 0, y: 0 });
  const animationFrameRef = useRef<number | null>(null);

  const handleStart = (e: TouchEvent | MouseEvent) => {
    e.preventDefault();
    setIsActive(true);
    
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const clientX = 'touches' in e ? (e.touches[0]?.clientX ?? e.changedTouches[0]?.clientX) : (e as MouseEvent).clientX;
    const clientY = 'touches' in e ? (e.touches[0]?.clientY ?? e.changedTouches[0]?.clientY) : (e as MouseEvent).clientY;
    
    updateFromPos(
      clientX - rect.left - rect.width / 2,
      clientY - rect.top - rect.height / 2
    );
  };

  const handleMove = (e: TouchEvent | MouseEvent) => {
    if (!isActive) return;
    e.preventDefault();

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Use first touch for consistency, fallback to changed if needed
    const clientX = 'touches' in e ? (e.touches[0]?.clientX ?? e.changedTouches[0]?.clientX) : (e as MouseEvent).clientX;
    const clientY = 'touches' in e ? (e.touches[0]?.clientY ?? e.changedTouches[0]?.clientY) : (e as MouseEvent).clientY;

    updateFromPos(
      clientX - rect.left - rect.width / 2,
      clientY - rect.top - rect.height / 2
    );
  };

  const updateFromPos = (x: number, y: number) => {
    const distance = Math.sqrt(x * x + y * y);
    const maxDistance = JOYSTICK_RADIUS;
    
    let clampedX = x;
    let clampedY = y;

    if (distance > maxDistance) {
      const angle = Math.atan2(y, x);
      clampedX = Math.cos(angle) * maxDistance;
      clampedY = Math.sin(angle) * maxDistance;
    }

    targetPositionRef.current = { x: clampedX, y: clampedY };

    const normalizedX = clampedX / maxDistance;
    const normalizedY = clampedY / maxDistance;

    if (Math.abs(normalizedX) < DEADZONE && Math.abs(normalizedY) < DEADZONE) {
      setInput({ forward: 0, right: 0 });
    } else {
      setInput({
        forward: -normalizedY,
        right: normalizedX,
      });
    }
  };

  const handleEnd = (e: TouchEvent | MouseEvent) => {
    e.preventDefault();
    setIsActive(false);
    targetPositionRef.current = { x: 0, y: 0 };
    setInput({ forward: 0, right: 0 });
  };

  // Smooth interpolation loop
  useEffect(() => {
    const animate = () => {
      setPosition((current) => {
        const next = lerp(current, targetPositionRef.current, SMOOTHING);
        if (
          Math.abs(next.x - current.x) < 0.001 &&
          Math.abs(next.y - current.y) < 0.001
        ) {
          return targetPositionRef.current;
        }
        return next;
      });
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    container.addEventListener('touchstart', handleStart, { passive: false });
    container.addEventListener('touchmove', handleMove, { passive: false });
    container.addEventListener('touchend', handleEnd);
    container.addEventListener('touchcancel', handleEnd);
    container.addEventListener('mousedown', handleStart);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);

    return () => {
      container.removeEventListener('touchstart', handleStart);
      container.removeEventListener('touchmove', handleMove);
      container.removeEventListener('touchend', handleEnd);
      container.removeEventListener('touchcancel', handleEnd);
      container.removeEventListener('mousedown', handleStart);
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
    };
  }, [isActive]);

  return (
    <div
      ref={containerRef}
      className="absolute bottom-6 left-6 touch-none select-none z-50"
      style={{
        width: JOYSTICK_SIZE,
        height: JOYSTICK_SIZE,
        zIndex: 50,
      }}
    >
      <div
        className="absolute rounded-full bg-slate-800/60 border-2 border-slate-600"
        style={{
          width: JOYSTICK_SIZE,
          height: JOYSTICK_SIZE,
          left: 0,
          top: 0,
        }}
      />
      <div
        className="absolute rounded-full bg-slate-600/80 border-2 border-slate-400 transition-transform"
        style={{
          width: JOYSTICK_RADIUS,
          height: JOYSTICK_RADIUS,
          left: JOYSTICK_SIZE / 2 + position.x,
          top: JOYSTICK_SIZE / 2 + position.y,
          transform: 'translate(-50%, -50%)',
        }}
      />
    </div>
  );
}




