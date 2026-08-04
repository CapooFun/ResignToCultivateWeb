import { SeededRandom } from './prng';

/** 二维梯度噪声（柏林风格）+ 分形布朗运动，输出约在 [-1, 1]。 */
export class Noise2D {
  private readonly perm: Uint8Array;

  constructor(seed: number) {
    const rng = new SeededRandom(seed);
    const source = new Uint8Array(256);
    for (let i = 0; i < 256; i += 1) source[i] = i;
    for (let i = 255; i > 0; i -= 1) {
      const j = rng.int(0, i);
      const tmp = source[i];
      source[i] = source[j];
      source[j] = tmp;
    }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i += 1) this.perm[i] = source[i & 255];
  }

  /** 单频噪声，约 [-1, 1] */
  sample(x: number, y: number): number {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const xf = x - x0;
    const yf = y - y0;
    const u = fade(xf);
    const v = fade(yf);
    const aa = this.hash(x0, y0);
    const ab = this.hash(x0, y0 + 1);
    const ba = this.hash(x0 + 1, y0);
    const bb = this.hash(x0 + 1, y0 + 1);
    const x1 = lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u);
    const x2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u);
    return lerp(x1, x2, v);
  }

  /** 多八度叠加，约 [-1, 1] */
  fbm(x: number, y: number, octaves = 4, lacunarity = 2, gain = 0.5): number {
    let amplitude = 1;
    let frequency = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i += 1) {
      sum += this.sample(x * frequency, y * frequency) * amplitude;
      norm += amplitude;
      amplitude *= gain;
      frequency *= lacunarity;
    }
    return sum / norm;
  }

  private hash(x: number, y: number): number {
    const xi = ((x % 256) + 256) % 256;
    const yi = ((y % 256) + 256) % 256;
    return this.perm[this.perm[xi] + yi];
  }
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** 四个对角梯度之一的点积 */
function grad(hash: number, x: number, y: number): number {
  switch (hash & 3) {
    case 0: return x + y;
    case 1: return -x + y;
    case 2: return x - y;
    default: return -x - y;
  }
}
