export class EMA {
  constructor(alpha = 0.2) { this.a = alpha; this.y = null; }
  apply(x) { this.y = (this.y == null) ? x : this.y + this.a * (x - this.y); return this.y; }
}
