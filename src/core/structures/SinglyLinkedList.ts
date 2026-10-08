interface ListNode<T> {
  value: T;
  next: ListNode<T> | null;
}

/** Lista enlazada simple: inserción y extracción en extremos en O(1); remove es O(n). */
export class SinglyLinkedList<T> {
  private head: ListNode<T> | null = null;
  private tail: ListNode<T> | null = null;
  private count = 0;

  append(value: T): void {
    const node: ListNode<T> = { value, next: null };
    if (this.tail === null) {
      this.head = node;
    } else {
      this.tail.next = node;
    }
    this.tail = node;
    this.count += 1;
  }

  prepend(value: T): void {
    this.head = { value, next: this.head };
    if (this.tail === null) {
      this.tail = this.head;
    }
    this.count += 1;
  }

  popFront(): T | undefined {
    const node = this.head;
    if (node === null) {
      return undefined;
    }
    this.head = node.next;
    if (this.head === null) {
      this.tail = null;
    }
    this.count -= 1;
    return node.value;
  }

  peekFront(): T | undefined {
    return this.head?.value;
  }

  /** Elimina la primera ocurrencia de `value`; devuelve false si no existe. */
  remove(value: T): boolean {
    let previous: ListNode<T> | null = null;
    let current = this.head;
    while (current !== null) {
      if (current.value === value) {
        if (previous === null) {
          this.head = current.next;
        } else {
          previous.next = current.next;
        }
        if (current === this.tail) {
          this.tail = previous;
        }
        this.count -= 1;
        return true;
      }
      previous = current;
      current = current.next;
    }
    return false;
  }

  toArray(): T[] {
    const values: T[] = [];
    for (let current = this.head; current !== null; current = current.next) {
      values.push(current.value);
    }
    return values;
  }

  clear(): void {
    this.head = null;
    this.tail = null;
    this.count = 0;
  }

  size(): number {
    return this.count;
  }

  isEmpty(): boolean {
    return this.count === 0;
  }
}
