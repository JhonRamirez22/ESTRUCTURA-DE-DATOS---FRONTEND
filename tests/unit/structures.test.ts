import { describe, expect, it } from 'vitest';
import vectors from '../fixtures/structures-vectors.json';
import { DoublyLinkedList } from '@/core/structures/DoublyLinkedList';
import { MinHeap } from '@/core/structures/MinHeap';
import { Queue } from '@/core/structures/Queue';
import { Stack } from '@/core/structures/Stack';
import { SinglyLinkedList } from '@/core/structures/SinglyLinkedList';

type Priority = { id: string; priority: number };
type Invoke = (call: string, args: unknown[]) => unknown;

/** Llama a un método TypeScript usando el nombre snake_case compartido con Python. */
function callMethod(target: object, call: string, args: unknown[]): unknown {
  const name = call.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
  const method = (target as Record<string, (...values: unknown[]) => unknown>)[name];
  return method.apply(target, args);
}

function createInvoker(structure: string): Invoke {
  switch (structure) {
    case 'queue': {
      const queue = new Queue<unknown>();
      return (call, args) => callMethod(queue, call, args);
    }
    case 'stack': {
      const stack = new Stack<unknown>();
      return (call, args) => callMethod(stack, call, args);
    }
    case 'singly_linked_list': {
      const list = new SinglyLinkedList<unknown>();
      return (call, args) => callMethod(list, call, args);
    }
    case 'min_heap': {
