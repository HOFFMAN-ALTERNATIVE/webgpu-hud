/** Fixed-capacity ring buffer of numbers backed by a Float32Array (no GC churn). */
export class RingBuffer {
  private readonly data: Float32Array;
  private head = 0;
  private size = 0;

  constructor(readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) throw new RangeError('capacity must be a positive integer');
    this.data = new Float32Array(capacity);
  }

  get length(): number {
    return this.size;
  }

  push(v: number): void {
    this.data[this.head] = v;
    this.head = (this.head + 1) % this.capacity;
    if (this.size < this.capacity) this.size++;
  }

  /** i = 0 is the oldest retained sample. */
  at(i: number): number {
    if (i < 0 || i >= this.size) throw new RangeError(`index ${i} out of range`);
    const start = (this.head - this.size + this.capacity) % this.capacity;
    return this.data[(start + i) % this.capacity]!;
  }

  last(): number | undefined {
    return this.size === 0 ? undefined : this.at(this.size - 1);
  }

  toArray(): number[] {
    return Array.from({ length: this.size }, (_, i) => this.at(i));
  }

  stats(): { min: number; max: number; mean: number } {
    if (this.size === 0) return { min: 0, max: 0, mean: 0 };
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    for (let i = 0; i < this.size; i++) {
      const v = this.at(i);
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v;
    }
    return { min, max, mean: sum / this.size };
  }
}
