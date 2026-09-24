import { SinglyLinkedList } from './SinglyLinkedList';

/** Cola FIFO: encola al final y desencola del frente en O(1). */
export class Queue<T> {
  private readonly items = new SinglyLinkedList<T>();

  enqueue(item: T): void {
    this.items.append(item);
  }

  /** Retorna y elimina el elemento más antiguo, o undefined si está vacía. */
  dequeue(): T | undefined {
    return this.items.popFront();
  }

  peek(): T | undefined {
