import { useEffect, useRef, useState } from 'react';
import { useJoystickMovement } from '../state/movement';

const JOYSTICK_SIZE = 80;
const JOYSTICK_RADIUS = 40;
const DEADZONE = 0.1;

export function Joystick() {
  const [, setInput] = useJoystickMovement();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isActive, setIsActive] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const getTouchPos = (e: TouchEvent | MouseEvent): { x: number; y: number } => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      return { x: 0, y: 0 };
    }

    const clientX = 'touches' in e ? e.touches[0]?.clientX ?? e.changedTouches[0]?.clientX ?? 0 : e.clientX;
    const clientY = 'touches' in e ? e.touches[0]?.clientY ?? e.changedTouches[0]?.clientY ?? 0 : e.clientY;

    return {
      x: clientX - rect.left - rect.width / 2,
      y: clientY - rect.top - rect.height / 2,
    };
  };

  const updateFromPos = (x: number, y: number) => {
    const distance = Math.sqrt(x * x + y * y);
    const maxDistance = JOYSTICK_RADIUS;

    if (distance > maxDistance) {
      const angle = Math.atan2(y, x);
      x = Math.cos(angle) * maxDistance;
      y = Math.sin(angle) * maxDistance;
    }

    setPosition({ x, y });

    const normalizedX = x / maxDistance;
    const normalizedY = y / maxDistance;

    if (Math.abs(normalizedX) < DEADZONE && Math.abs(normalizedY) < DEADZONE) {
      setInput({ forward: 0, right: 0 });
    } else {
      setInput({
        forward: -normalizedY,
        right: normalizedX,
      });
    }
  };

  const handleStart = (e: TouchEvent | MouseEvent) => {
    e.preventDefault();
    setIsActive(true);
    const pos = getTouchPos(e);
    updateFromPos(pos.x, pos.y);
  };

  const handleMove = (e: TouchEvent | MouseEvent) => {
    if (!isActive) {
      return;
    }
    e.preventDefault();
    const pos = getTouchPos(e);
    updateFromPos(pos.x, pos.y);
  };

  const handleEnd = () => {
    setIsActive(false);
    setPosition({ x: 0, y: 0 });
    setInput({ forward: 0, right: 0 });
  };

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
      className="absolute bottom-6 left-6 touch-none select-none"
      style={{
        width: JOYSTICK_SIZE,
        height: JOYSTICK_SIZE,
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
          left: JOYSTICK_RADIUS / 2 + position.x,
          top: JOYSTICK_RADIUS / 2 + position.y,
          transform: 'translate(-50%, -50%)',
        }}
      />
    </div>
  );
}

