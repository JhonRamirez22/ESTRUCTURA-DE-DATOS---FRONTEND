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
