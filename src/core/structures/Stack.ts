import { SinglyLinkedList } from './SinglyLinkedList';

/** Pila LIFO: apila y desapila en la cabeza en O(1). */
export class Stack<T> {
  private readonly items = new SinglyLinkedList<T>();

  push(item: T): void {
    this.items.prepend(item);
  }

  /** Retorna y elimina el elemento superior, o undefined si está vacía. */
  pop(): T | undefined {
    return this.items.popFront();
  }

  peek(): T | undefined {
    return this.items.peekFront();
  }

  isEmpty(): boolean {
    return this.items.isEmpty();
  }

  size(): number {
    return this.items.size();
  }
}
