// Filtro One Euro (Casiez et al. 2012): suaviza tremor quando a mão está
// parada e reduz atraso quando ela se move rápido.

function alpha(cutoff, dt) {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

export class OneEuro {
  constructor(minCutoff, beta, dCutoff) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.x = null;
    this.dx = 0;
    this.t = 0;
  }

  reset() { this.x = null; this.dx = 0; }

  filter(value, tSec) {
    if (this.x === null) { this.x = value; this.t = tSec; return value; }
    const dt = Math.max(1e-3, tSec - this.t);
    this.t = tSec;
    const dxRaw = (value - this.x) / dt;
    this.dx += alpha(this.dCutoff, dt) * (dxRaw - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += alpha(cutoff, dt) * (value - this.x);
    return this.x;
  }
}

// Filtro para um Vector3 (3 filtros escalares).
export class OneEuro3 {
  constructor(cfg) {
    this.f = [0, 1, 2].map(() => new OneEuro(cfg.MIN_CUTOFF, cfg.BETA, cfg.D_CUTOFF));
  }
  reset() { this.f.forEach((f) => f.reset()); }
  filter(v, tSec) {
    v.x = this.f[0].filter(v.x, tSec);
    v.y = this.f[1].filter(v.y, tSec);
    v.z = this.f[2].filter(v.z, tSec);
    return v;
  }
}
