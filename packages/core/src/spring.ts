/**
 * Per-channel inertia = a critically-damped-ish spring used to add lag/overshoot
 * to any value. `stiffness` in [0,1]: 0 = frozen, 1 = snap instantly.
 */
export class Spring {
  current: number;
  velocity = 0;

  constructor(
    initial = 0,
    /** approach rate per second-ish; higher = snappier */
    public stiffness = 12,
    /** 1 = critically damped, <1 overshoots, >1 sluggish */
    public damping = 1,
  ) {
    this.current = initial;
  }

  /** Advance toward `target` by `dt` seconds. Returns the new current value. */
  step(target: number, dt: number): number {
    // Semi-implicit spring integration, stable for reasonable dt.
    const k = this.stiffness;
    const c = 2 * Math.sqrt(k) * this.damping;
    const force = k * (target - this.current) - c * this.velocity;
    this.velocity += force * dt;
    this.current += this.velocity * dt;
    return this.current;
  }

  reset(value: number): void {
    this.current = value;
    this.velocity = 0;
  }
}
