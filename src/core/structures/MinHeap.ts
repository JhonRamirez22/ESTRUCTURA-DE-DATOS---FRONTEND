export type Comparator<T> = (left: T, right: T) => number;
export type HeapId = string | number;

/**
 * Min-heap indexado por ID estable. Un Map mantiene la posición actual de cada ID,
 * así decreaseKey encuentra el elemento en O(1) aunque los swaps muevan sus índices.
 */
export class MinHeap<T, Id extends HeapId = HeapId> {
  private readonly items: T[] = [];
  private readonly indices = new Map<Id, number>();

  constructor(
    private readonly compare: Comparator<T>,
    private readonly getId: (item: T) => Id,
  ) {}

  insert(item: T): void {
    const id = this.getId(item);
    if (this.indices.has(id)) {
      throw new Error(`No se puede insertar un ID duplicado en el heap: ${String(id)}`);
    }
    this.items.push(item);
    const index = this.items.length - 1;
    this.indices.set(id, index);
    this.bubbleUp(index);
  }

  extractMin(): T | undefined {
    if (this.items.length === 0) {
      return undefined;
    }
    const minimum = this.items[0];
    this.swap(0, this.items.length - 1);
    this.items.pop();
    this.indices.delete(this.getId(minimum));
    this.bubbleDown(0);
    return minimum;
  }

  decreaseKey(id: Id, newValue: T): void {
    const index = this.indices.get(id);
    if (index === undefined) {
      throw new Error(`El ID no existe en el heap: ${String(id)}`);
    }
    if (this.getId(newValue) !== id) {
      throw new Error('decreaseKey no puede reemplazar un elemento con otro ID');
    }
    if (this.compare(newValue, this.items[index]) > 0) {
      throw new Error('decreaseKey no puede aumentar la prioridad');
    }
    this.items[index] = newValue;
    this.bubbleUp(index);
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  size(): number {
    return this.items.length;
  }

  private bubbleUp(index: number): void {
    let current = index;
    while (current > 0) {
      const parent = Math.floor((current - 1) / 2);
      if (this.compare(this.items[current], this.items[parent]) >= 0) {
        break;
      }
      this.swap(current, parent);
      current = parent;
    }
  }

  private bubbleDown(index: number): void {
    let current = index;
    for (;;) {
      const left = current * 2 + 1;
      const right = left + 1;
      let smallest = current;
      if (left < this.items.length && this.compare(this.items[left], this.items[smallest]) < 0) {
        smallest = left;
      }
      if (right < this.items.length && this.compare(this.items[right], this.items[smallest]) < 0) {
        smallest = right;
      }
      if (smallest === current) {
        return;
      }
      this.swap(current, smallest);
      current = smallest;
    }
  }

  private swap(left: number, right: number): void {
    [this.items[left], this.items[right]] = [this.items[right], this.items[left]];
    this.indices.set(this.getId(this.items[left]), left);
    this.indices.set(this.getId(this.items[right]), right);
  }
}
