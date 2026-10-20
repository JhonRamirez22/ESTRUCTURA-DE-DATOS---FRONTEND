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
      const heap = new MinHeap<Priority, string>(
        (left, right) => left.priority - right.priority,
        (item) => item.id,
      );
      return (call, args) => callMethod(heap, call, args);
    }
    default:
      throw new Error(`Estructura desconocida en vectores: ${structure}`);
  }
}

function isThrowExpectation(expected: unknown): boolean {
  return typeof expected === 'object' && expected !== null && 'throws' in expected;
}

describe('vectores compartidos con el backend', () => {
  for (const vector of vectors.cases) {
    it(vector.name, () => {
      const invoke = createInvoker(vector.structure);
      for (const operation of vector.ops) {
        const args = (operation.args ?? []) as unknown[];
        if (isThrowExpectation(operation.expect)) {
          expect(() => invoke(operation.call, args), operation.call).toThrow();
          continue;
        }
        const result = invoke(operation.call, args) ?? null;
        expect(result, operation.call).toEqual(operation.expect);
      }
    });
  }
});

describe('DoublyLinkedList (sin vectores: nodos retenidos por el llamador)', () => {
  it('retira y mueve nodos conocidos en orden correcto', () => {
    const list = new DoublyLinkedList<string>();
    const first = list.append('first');
    list.append('middle');
    const last = list.append('last');
    list.moveToFront(last);
    expect(list.toArray()).toEqual(['last', 'first', 'middle']);
    expect(list.remove(first)).toBe('first');
    expect(list.popFront()).toBe('last');
    expect(list.popBack()).toBe('middle');
    expect(list.isEmpty()).toBe(true);
  });

  it('rechaza nodos de otra lista y nodos ya retirados', () => {
    const owner = new DoublyLinkedList<number>();
    const other = new DoublyLinkedList<number>();
    const node = owner.append(7);
    expect(() => other.moveToFront(node)).toThrow('no pertenece');
    owner.remove(node);
    expect(() => owner.remove(node)).toThrow('no pertenece');
  });

  it('agrega al inicio y maneja lista vacía', () => {
    const list = new DoublyLinkedList<number>();
    expect(list.popFront()).toBeUndefined();
    list.appendLeft(2);
    list.appendLeft(1);
    expect(list.toArray()).toEqual([1, 2]);
    expect(list.size()).toBe(2);
  });
});
