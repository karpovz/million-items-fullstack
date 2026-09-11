import type { ItemId } from "@million/shared";

export class CapacityError extends Error {
  constructor(message = "Server busy. Please retry later.") {
    super(message);
  }
}

export class OperationRegistry {
  private readonly pending = new Set<string>();
  private readonly completed = new Map<string, number>();
  constructor(
    private readonly capacity = 100_000,
    private readonly ttlMs = 3_600_000,
  ) {}
  has(id: string): boolean {
    if (this.pending.has(id)) return true;
    const expiry = this.completed.get(id);
    if (expiry === undefined) return false;
    if (expiry > Date.now()) return true;
    this.completed.delete(id);
    return false;
  }
  claim(id: string): void {
    for (const [key, expiry] of this.completed) {
      if (expiry > Date.now()) break;
      this.completed.delete(key);
    }
    if (this.pending.size + this.completed.size >= this.capacity)
      throw new CapacityError();
    this.pending.add(id);
  }
  complete(id: string): void {
    this.pending.delete(id);
    this.completed.delete(id);
    this.completed.set(id, Date.now() + this.ttlMs);
  }
  release(id: string): void {
    this.pending.delete(id);
  }
}

export type Operation =
  | { id: string; kind: "add"; value: ItemId[] }
  | { id: string; kind: "selection"; value: { id: ItemId; selected: boolean } }
  | {
      id: string;
      kind: "reorder";
      value: { search: string; activeId: ItemId; overId: ItemId };
    };
type ReadJob<T> = {
  read: () => T;
  waiters: { resolve: (value: T) => void; reject: (error: unknown) => void }[];
};

export class ReadBatcher<T> {
  private readonly jobs = new Map<string, ReadJob<T>>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private closed = false;
  private waiterCount = 0;
  constructor(
    private readonly intervalMs: number,
    private readonly maxWaiters = 5000,
  ) {}
  get(key: string, read: () => T): Promise<T> {
    if (this.closed) return Promise.reject(new Error("Read batcher is closed"));
    if (this.waiterCount >= this.maxWaiters)
      return Promise.reject(new CapacityError());
    this.waiterCount++;
    // Одинаковые запросы читают состояние один раз в конце окна батчинга.
    const promise = new Promise<T>((resolve, reject) => {
      const job = this.jobs.get(key) ?? { read, waiters: [] };
      job.waiters.push({ resolve, reject });
      this.jobs.set(key, job);
    });
    if (!this.timer)
      this.timer = setTimeout(() => this.flush(), this.intervalMs);
    return promise;
  }
  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    const batch = [...this.jobs.values()];
    this.jobs.clear();
    this.waiterCount = 0;
    for (const { read, waiters } of batch) {
      try {
        const value = read();
        waiters.forEach(({ resolve }) => resolve(value));
      } catch (error) {
        waiters.forEach(({ reject }) => reject(error));
      }
    }
  }
  close(): void {
    this.closed = true;
    this.flush();
  }
}

export class OperationQueue {
  private readonly queued = new Map<string, Operation>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private closed = false;
  failed = false;
  constructor(
    private readonly intervalMs: number,
    private readonly apply: (op: Operation) => void,
    private readonly maxPending = 1000,
    private readonly onError: (error: unknown) => void = console.error,
  ) {}
  get pending(): number {
    return this.queued.size;
  }
  enqueue(operation: Operation): "queued" | "duplicate" {
    if (this.closed || this.failed)
      throw new CapacityError("Queue unavailable. Please retry later.");
    if (this.queued.has(operation.id)) return "duplicate";
    if (this.queued.size >= this.maxPending) throw new CapacityError();
    this.queued.set(operation.id, operation);
    if (!this.timer)
      this.timer = setTimeout(() => {
        void this.flush().catch(this.onError);
      }, this.intervalMs);
    return "queued";
  }
  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    try {
      for (const [id, operation] of this.queued) {
        this.apply(operation);
        this.queued.delete(id);
      }
      this.failed = false;
    } catch (error) {
      this.failed = true;
      throw error;
    }
  }
  async close(): Promise<void> {
    this.closed = true;
    await this.flush();
  }
}
