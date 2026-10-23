// Chování jedné vrstvy v čase: jak reaguje na zvuk (drive, údery, fáze) a plynulé zapnutí/vypnutí.
// Logika je převzatá ze sandboxu (updateSlot), aby se vizuály chovaly stejně.
import type { AudioFrame, Band, ShaderHeader } from '../../shared/types';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const NONE: Band = { v: 0, hit: false };

export class LayerRuntime {
  fade = 0;
  phase = 0;
  dphase = 0;
  hitCount = 0;
  prevHitCount = 0;
  sinceHit = 9;
  readonly hitAges = new Float32Array(8).fill(99);
  drive = 0;
  hit = 0;
  ang = 0;

  /** dt v sekundách. Nic nealokuje — volá se každý snímek. */
  update(d: ShaderHeader['defaults'], audio: AudioFrame, on: boolean, dt: number) {
    const h = d.hard;
    const b = d.drive === 'none' ? NONE : audio[d.drive];
    this.drive += (b.v - this.drive) * Math.min(1, lerp(6, 80, h) * dt);
    this.prevHitCount = this.hitCount;
    const fadeTime = lerp(0.35, 0.04, h);
    if (on) this.fade = Math.min(1, this.fade + dt / fadeTime);
    else this.fade = Math.max(0, this.fade - dt / fadeTime);
    if (b.hit && on) {
      this.hitCount++; this.sinceHit = 0; this.hit = 1;
      for (let i = 7; i > 0; i--) this.hitAges[i] = this.hitAges[i - 1];
      this.hitAges[0] = 0;
      this.ang += h * 0.6;
    } else {
      this.hit *= Math.exp(-dt * lerp(6, 30, h));
    }
    this.sinceHit += dt;
    for (let i = 0; i < 8; i++) this.hitAges[i] += dt;
    const dp = dt * d.speed * (1 + this.drive * 1.5);
    this.phase += dp; this.dphase = dp;
    this.ang += dt * d.speed * 0.6;
  }
}
