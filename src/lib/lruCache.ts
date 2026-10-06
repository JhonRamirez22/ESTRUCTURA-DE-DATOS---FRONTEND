import { DoublyLinkedList, type DoublyLinkedNode } from '@/core/structures/DoublyLinkedList';

interface Entry<K, V> {
  key: K;
  value: V;
  storedAt: number;
}

/**
 * Caché LRU: la lista doble ordena por uso reciente (frente = más reciente) y un Map
 * localiza cada nodo en O(1); get mueve el nodo al frente y set expulsa por el final.
 */
export class LruCache<K, V> {
  private readonly order = new DoublyLinkedList<Entry<K, V>>();
  private readonly nodes = new Map<K, DoublyLinkedNode<Entry<K, V>>>();

  constructor(
    private readonly capacity: number,
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {
    if (capacity < 1) throw new Error('La capacidad de la caché debe ser al menos 1.');
  }

  get(key: K): V | undefined {
    const node = this.nodes.get(key);
    if (node === undefined) return undefined;
    if (this.now() - node.value.storedAt >= this.ttlMs) {
      this.delete(key);
      return undefined;
    }
    this.order.moveToFront(node);
    return node.value.value;
  }

  set(key: K, value: V): void {
    this.delete(key);
    this.nodes.set(key, this.order.appendLeft({ key, value, storedAt: this.now() }));
    while (this.nodes.size > this.capacity) {
      const evicted = this.order.popBack();
      if (evicted !== undefined) this.nodes.delete(evicted.key);
    }
  }

  delete(key: K): void {
    const node = this.nodes.get(key);
    if (node === undefined) return;
    this.order.remove(node);
    this.nodes.delete(key);
  }

  clear(): void {
    while (this.order.popFront() !== undefined) {
      // Vacía la lista doble nodo por nodo.
    }
    this.nodes.clear();
  }

  get size(): number {
    return this.nodes.size;
  }

  /** Claves de la más reciente a la más antigua. */
  keys(): K[] {
    return this.order.toArray().map((entry) => entry.key);
  }
}
