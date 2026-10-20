export class DoublyLinkedNode<T> {
  previous: DoublyLinkedNode<T> | null = null;
  next: DoublyLinkedNode<T> | null = null;

  constructor(
    readonly value: T,
    /** Identifica la lista a la que pertenece; null cuando el nodo fue retirado. */
    public owner: symbol | null,
  ) {}
}

/**
 * Lista doble: acceso O(1) a ambos extremos y a nodos que el llamador retiene.
 * Los nodos se validan contra su lista para no mezclar estructuras.
 */
export class DoublyLinkedList<T> {
  private head: DoublyLinkedNode<T> | null = null;
  private tail: DoublyLinkedNode<T> | null = null;
  private count = 0;
  private readonly owner = Symbol('DoublyLinkedList');

  append(value: T): DoublyLinkedNode<T> {
    const node = new DoublyLinkedNode(value, this.owner);
    node.previous = this.tail;
    if (this.tail === null) {
      this.head = node;
    } else {
      this.tail.next = node;
    }
    this.tail = node;
    this.count += 1;
    return node;
  }

  appendLeft(value: T): DoublyLinkedNode<T> {
    const node = new DoublyLinkedNode(value, this.owner);
    node.next = this.head;
    if (this.head === null) {
      this.tail = node;
    } else {
      this.head.previous = node;
    }
    this.head = node;
    this.count += 1;
    return node;
  }

  remove(node: DoublyLinkedNode<T>): T {
    this.assertAttached(node);
    if (node.previous === null) {
      this.head = node.next;
    } else {
      node.previous.next = node.next;
    }
    if (node.next === null) {
      this.tail = node.previous;
    } else {
      node.next.previous = node.previous;
    }
    node.previous = null;
    node.next = null;
    node.owner = null;
    this.count -= 1;
    return node.value;
  }

  moveToFront(node: DoublyLinkedNode<T>): void {
    this.assertAttached(node);
    if (node === this.head) {
      return;
    }
    if (node.previous !== null) {
      node.previous.next = node.next;
    }
    if (node.next === null) {
      this.tail = node.previous;
    } else {
      node.next.previous = node.previous;
    }
    node.previous = null;
    node.next = this.head;
    if (this.head !== null) {
      this.head.previous = node;
    }
    this.head = node;
  }

  popFront(): T | undefined {
    return this.head === null ? undefined : this.remove(this.head);
  }

  popBack(): T | undefined {
    return this.tail === null ? undefined : this.remove(this.tail);
  }

  toArray(): T[] {
    const values: T[] = [];
    for (let current = this.head; current !== null; current = current.next) {
      values.push(current.value);
    }
    return values;
  }

  size(): number {
    return this.count;
  }

  isEmpty(): boolean {
    return this.count === 0;
  }

  private assertAttached(node: DoublyLinkedNode<T>): void {
    if (node.owner !== this.owner) {
      throw new Error('El nodo no pertenece a esta lista.');
    }
  }
}
