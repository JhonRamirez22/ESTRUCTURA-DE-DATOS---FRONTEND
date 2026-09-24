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
