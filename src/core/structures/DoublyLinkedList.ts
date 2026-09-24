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
