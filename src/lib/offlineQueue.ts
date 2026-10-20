import { Queue } from '@/core/structures/Queue';

/**
 * Cola FIFO de acciones pendientes cuando se pierde la conexión: se reenvían en el mismo
 * orden y, si una falla, se conserva en el frente para no adelantar las siguientes.
 */
export class OfflineQueue<T> {
  private readonly pending = new Queue<T>();

  enqueue(action: T): void {
    this.pending.enqueue(action);
  }

  get size(): number {
    return this.pending.size();
  }

  /** Devuelve cuántas acciones se enviaron antes de detenerse por un fallo. */
  async flush(send: (action: T) => Promise<void>): Promise<number> {
    let sent = 0;
    for (let action = this.pending.peek(); action !== undefined; action = this.pending.peek()) {
      try {
        await send(action);
      } catch {
        break;
      }
      this.pending.dequeue();
      sent += 1;
    }
    return sent;
  }
}
