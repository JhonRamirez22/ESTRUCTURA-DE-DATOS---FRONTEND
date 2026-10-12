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
            staticMotion,
          }}
        >
          {children}
        </DockContext.Provider>
      </motion.div>
    </nav>
  );
}

export function DockItem({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { mouseX, spring, distance, magnification, staticMotion } = useDock();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const targetWidth = useTransform(mouseX, (value) => {
    if (staticMotion) return BASE_SIZE;
    if (focused) return magnification;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return BASE_SIZE;
    // clientX y getBoundingClientRect comparten coordenadas incluso al hacer scroll.
    const proximity = Math.max(0, 1 - Math.abs(value - rect.x - rect.width / 2) / distance);
    return BASE_SIZE + (magnification - BASE_SIZE) * proximity * proximity;
  });
  const width = useSpring(targetWidth, spring);
  return (
    <motion.div
      ref={ref}
      className={cn('ui-dock-item', className)}
      style={{ width: staticMotion ? BASE_SIZE : width }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocusCapture={() => {
        setFocused(true);
        targetWidth.set(staticMotion ? BASE_SIZE : magnification);
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setFocused(false);
          targetWidth.set(BASE_SIZE);
        }
      }}
    >
      <ItemContext.Provider value={{ width, hovered: hovered || focused }}>
        {children}
      </ItemContext.Provider>
    </motion.div>
  );
}

export function DockLabel({ children, className }: { children: ReactNode; className?: string }) {
  const { hovered } = useDockItem();
  const { staticMotion } = useDock();
  return (
    <AnimatePresence>
      {hovered ? (
        <motion.span
          className={cn('ui-dock-label', className)}
          aria-hidden="true"
          initial={{ opacity: staticMotion ? 1 : 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: staticMotion ? 0 : 0.15 }}
        >
          {children}
        </motion.span>
      ) : null}
    </AnimatePresence>
  );
}
export function DockIcon({ children, className }: { children: ReactNode; className?: string }) {
  const { width } = useDockItem();
  const { staticMotion } = useDock();
  const iconWidth = useTransform(width, (value) => value / 2);
  return (
    <motion.span
      className={cn('ui-dock-icon', className)}
      style={{ width: staticMotion ? BASE_SIZE / 2 : iconWidth }}
      aria-hidden="true"
    >
      {children}
    </motion.span>
  );
}
