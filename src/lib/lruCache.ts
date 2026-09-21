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
