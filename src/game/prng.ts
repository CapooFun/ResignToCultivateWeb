export function normalizeSeed(seed: number): number {
  const normalized = Math.abs(Math.trunc(seed)) >>> 0;
  return normalized === 0 ? 0x6d2b79f5 : normalized;
}

export function nextRandom(state: number): { state: number; value: number } {
  let x = normalizeSeed(state);
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  const next = x >>> 0;
  return { state: next, value: next / 0x100000000 };
}

export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = normalizeSeed(seed);
  }

  next(): number {
    const result = nextRandom(this.state);
    this.state = result.state;
    return result.value;
  }

  int(min: number, maxInclusive: number): number {
    return Math.floor(this.next() * (maxInclusive - min + 1)) + min;
  }

  pick<T>(values: readonly T[]): T {
    return values[this.int(0, values.length - 1)];
  }

  getState(): number {
    return this.state;
  }
}

