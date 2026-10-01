'use client';

import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
  type SpringOptions,
} from 'framer-motion';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

const BASE_SIZE = 44;
const DockContext = createContext<{
  mouseX: MotionValue<number>;
  spring: SpringOptions;
  distance: number;
  magnification: number;
  staticMotion: boolean;
} | null>(null);
const ItemContext = createContext<{ width: MotionValue<number>; hovered: boolean } | null>(null);

function useDock() {
  const context = useContext(DockContext);
  if (!context) throw new Error('DockItem debe estar dentro de Dock.');
  return context;
}
function useDockItem() {
  const context = useContext(ItemContext);
  if (!context) throw new Error('DockIcon y DockLabel deben estar dentro de DockItem.');
  return context;
}

export function Dock({
  children,
  className,
  distance = 150,
  panelHeight = 64,
  magnification = 68,
  spring = { mass: 0.1, stiffness: 150, damping: 18 },
  ariaLabel = 'Navegación rápida',
}: {
  children?: ReactNode;
  className?: string;
  distance?: number;
  panelHeight?: number;
  magnification?: number;
  spring?: SpringOptions;
  ariaLabel?: string;
}) {
  const mouseX = useMotionValue(Infinity);
  const reducedMotion = useReducedMotion();
  const [coarsePointer, setCoarsePointer] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(pointer: coarse)');
    const update = () => setCoarsePointer(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const safeMagnification = Number.isFinite(magnification)
    ? Math.min(80, Math.max(BASE_SIZE, magnification))
    : 68;
  const safeDistance = Number.isFinite(distance) && distance > 0 ? distance : 150;
  const staticMotion = Boolean(reducedMotion || coarsePointer);
  return (
    <nav className={cn('ui-dock', className)} aria-label={ariaLabel}>
      <motion.div
        className="ui-dock-panel"
        style={{ minHeight: Number.isFinite(panelHeight) ? Math.max(BASE_SIZE, panelHeight) : 64 }}
        onPointerMove={(event) =>
          mouseX.set(staticMotion || event.pointerType === 'touch' ? Infinity : event.clientX)
        }
        onPointerLeave={() => mouseX.set(Infinity)}
      >
        <DockContext.Provider
          value={{
            mouseX,
            spring,
            distance: safeDistance,
            magnification: safeMagnification,
