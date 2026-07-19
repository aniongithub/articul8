/**
 * Procedural channels — a time is fed in, a value comes out, exactly like a
 * keyframe list, only the shape is *computed* rather than stored. Every
 * generator wears the same four-knob envelope, so an artist tunes a sine and a
 * noise with one vocabulary:
 *
 *   bias   the value the wave rides on (its rest / centre line)
 *   amp    how far it swings either side of the bias
 *   phase  a time offset (ms) — slides the wave along, decorrelates two axes
 *   freq   cycles per second — honest Hz, not a period in disguise
 *
 * Here is the whole trick to composition: a knob is not a *number*, it is a
 * `Knob` — a time→value, exactly the same shape as a generator. So a knob may
 * be a constant, but it may equally be *another wave* or a *keyframe list*, and
 * it is read afresh every frame. Modulate `amp` and you have AM; modulate
 * `bias` and you have additive layering; modulate `freq` and you have vibrato;
 * modulate `phase` and you have jitter — all from one mechanism, nested to any
 * depth, with no combinator node in sight. A leaf never knows which; it just
 * calls its knobs.
 *
 * The whole envelope is optional: an omitted knob takes its identity default
 * (bias 0, amp 1, phase 0, freq 1), so `{ "fn": "noise" }` is a legal channel.
 */
export type Generator = (t: number) => number;

/** A knob is just a generator — a time→value feeding one slot of a wave. The
 *  two names are one type; the distinction is only which role it plays. */
export type Knob = Generator;

/** The four-knob envelope. Every knob is a function of time (a plain constant
 *  is simply a knob that ignores its argument), so any of them may itself be a
 *  wave or a sampled key list — that is the whole of composition. */
export interface Env {
  readonly bias?: Knob;
  readonly amp?: Knob;
  readonly phase?: Knob;
  readonly freq?: Knob;
}

/** The two constant knobs the identity defaults need — shared, not re-minted. */
const ZERO: Knob = () => 0;
const ONE: Knob = () => 1;

/** The one shared coordinate: elapsed time, phase-shifted, in cycles. `t` is in
 * milliseconds; `freq` is cycles/second, so the `/1000` makes the units meet. */
const coord = (t: number, phase: number, freq: number): number => ((t + phase) * freq) / 1000;

/** Graffiti's cosine interpolation — an ease-in-out between two lattice values,
 * so the noise glides through its anchors instead of kinking at them. */
const cosLerp = (a: number, b: number, f: number): number => {
  const m = (1 - Math.cos(f * Math.PI)) / 2;
  return a * (1 - m) + b * m;
};

/**
 * A deterministic hash of one integer lattice index to `[0, 1)`. This is the
 * whole reason we don't reach for `Math.random()`: the same index always hashes
 * to the same number, so the noise is a *pure function of the clock*. Scrub to
 * any time, reload the page, replay a clip — the wave is bit-identical. The
 * bit-twiddle is graffiti's, kept exact with `Math.imul` so a 32-bit multiply
 * never loses its low bits to float rounding.
 */
const hash = (n: number): number => {
  let x = (n << 13) ^ n;
  const a = Math.imul(Math.imul(x, x), 15731) + 789221;
  x = (Math.imul(x, a) + 1376312589) & 0x7fffffff;
  return x / 0x7fffffff;
};

/** A pure sine wave on the shared envelope. Each knob is read per frame, so any
 *  of them may itself sway over time (a modulated amp, a drifting bias, …). */
export const sine =
  ({ bias = ZERO, amp = ONE, phase = ZERO, freq = ONE }: Env): Generator =>
  (t) =>
    bias(t) + amp(t) * Math.sin(2 * Math.PI * coord(t, phase(t), freq(t)));

/**
 * Value noise: a smooth, deterministic wander. The envelope's coordinate is an
 * *unwrapped* lattice position (unlike the sine, we never fold it — folding
 * would make the noise periodic and defeat the point). Between the two integer
 * anchors that bracket the coordinate, we cosine-blend their hashes, then remap
 * the `[0, 1)` result to `[-1, 1)` so the deviation sits symmetrically about the
 * bias — the wave rests on its centre line just like the sine. As with the sine,
 * every knob is read per frame, so bias/amp/phase/freq may each be modulated.
 */
export const noise =
  ({ bias = ZERO, amp = ONE, phase = ZERO, freq = ONE }: Env): Generator =>
  (t) => {
    const k = coord(t, phase(t), freq(t));
    const a = Math.floor(k);
    return bias(t) + amp(t) * (2 * cosLerp(hash(a), hash(a + 1), k - a) - 1);
  };

/** The registry a rig indexes by name: `{ "fn": "noise", … }` → `noise(env)`. */
export const generators: Readonly<Record<string, (env: Env) => Generator>> = {
  sine,
  noise,
};
