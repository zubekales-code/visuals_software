// Měření času na grafice po vrstvách (EXT_disjoint_timer_query_webgl2).
// Některé grafiky / ovladače rozšíření nenabízí — pak vrací null a panel ukáže jen čas snímku.

interface Pending { q: WebGLQuery; slot: number }

export class GpuTimer {
  private gl: WebGL2RenderingContext;
  private ext: any;
  private free: WebGLQuery[] = [];
  private pending: Pending[] = [];
  private active: Pending | null = null;
  /** Vyhlazené výsledky v ms, index = slot. */
  readonly ms: Float64Array;
  readonly seen: Uint8Array;

  constructor(gl: WebGL2RenderingContext, slots: number) {
    this.gl = gl;
    this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this.ms = new Float64Array(slots);
    this.seen = new Uint8Array(slots);
  }

  get available() { return !!this.ext; }

  begin(slot: number) {
    if (!this.ext || this.active || this.pending.length > 64) return;
    const q = this.free.pop() ?? this.gl.createQuery()!;
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
    this.active = { q, slot };
  }

  end() {
    if (!this.active) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.push(this.active);
    this.active = null;
  }

  /** Vyzvedne hotové výsledky (zpožděné o pár snímků — tak to u GPU chodí). */
  poll() {
    if (!this.ext) return;
    const gl = this.gl;
    const disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT);
    while (this.pending.length) {
      const p = this.pending[0];
      if (!gl.getQueryParameter(p.q, gl.QUERY_RESULT_AVAILABLE)) break;
      this.pending.shift();
      if (!disjoint) {
        const v = gl.getQueryParameter(p.q, gl.QUERY_RESULT) / 1e6;
        this.ms[p.slot] = this.seen[p.slot] ? this.ms[p.slot] * 0.9 + v * 0.1 : v;
        this.seen[p.slot] = 1;
      }
      this.free.push(p.q);
    }
  }

  value(slot: number): number | null { return this.ext && this.seen[slot] ? this.ms[slot] : null; }
  forget(slot: number) { this.seen[slot] = 0; }
}
