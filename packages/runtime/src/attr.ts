/**
 * One codec for *any* attribute, keyed on the shape of the value — never on the
 * attribute's name. An SVG attribute worth tweening is, almost always, a string
 * carrying some numbers: `"0.5"`, `"4 2"`, `"#e6394a"`. So we pull the numbers
 * out into a vector the rest of the system already knows how to lerp and blend,
 * and remember the literal text around them as a template to splice back. The
 * channel carries only the numbers; the `render` closure — captured once at
 * bind, exactly like the skin holds a path's segment structure — puts them back.
 *
 * The lone bit of value-shape knowledge is colour: hex and named colours carry
 * no decimal tokens, so a colour-valued string is canonicalised to `[r, g, b, a]`
 * and rendered as `rgba(…)`. That rule fires on the *token*, so it serves
 * `fill`, `stroke`, `stop-color`, … alike, without any of them being named.
 */
export interface Attr {
  /** The value's numbers, in order — the vector a channel actually tweens. */
  readonly nums: readonly number[];
  /** Splice a (lerped) vector back into this value's shape. */
  render(nums: readonly number[]): string;
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** A small set of CSS colour keywords — enough to be useful, easy to extend. */
const NAMED: Readonly<Record<string, readonly [number, number, number]>> = {
  black: [0, 0, 0],
  white: [255, 255, 255],
  red: [255, 0, 0],
  lime: [0, 255, 0],
  green: [0, 128, 0],
  blue: [0, 0, 255],
  yellow: [255, 255, 0],
  cyan: [0, 255, 255],
  magenta: [255, 0, 255],
  gray: [128, 128, 128],
  grey: [128, 128, 128],
  orange: [255, 165, 0],
  pink: [255, 192, 203],
};

/** Parse a colour token to `[r, g, b, a]`, or `undefined` if it is not one. */
const toColor = (s: string): [number, number, number, number] | undefined => {
  const t = s.trim().toLowerCase();
  if (t === "none" || t === "transparent") return [0, 0, 0, 0];
  const hex = HEX.exec(t);
  if (hex) {
    let h = hex[1]!;
    if (h.length === 3)
      h = h
        .split("")
        .map((c) => c + c)
        .join("");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
  }
  const rgb = /^rgba?\(([^)]+)\)$/.exec(t);
  if (rgb) {
    const p = rgb[1]!.split(/[,\s/]+/).filter(Boolean).map((x) => parseFloat(x));
    if (p.length >= 3 && p.slice(0, 3).every((n) => !Number.isNaN(n)))
      return [p[0]!, p[1]!, p[2]!, p.length > 3 && !Number.isNaN(p[3]!) ? p[3]! : 1];
  }
  const n = NAMED[t];
  return n ? [n[0], n[1], n[2], 1] : undefined;
};

const chan = (n: number): number => Math.max(0, Math.min(255, Math.round(n)));
const unit = (n: number): number => Math.max(0, Math.min(1, n));
const fmt = (n: number): string => {
  const r = Math.round(n * 1e4) / 1e4;
  return Object.is(r, -0) ? "0" : String(r);
};

const number = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;

/** Read a value string into its numbers plus a way to write those numbers back. */
export function parseAttr(s: string): Attr {
  const c = toColor(s);
  if (c)
    return {
      nums: c,
      render: (n) => `rgba(${chan(n[0]!)}, ${chan(n[1]!)}, ${chan(n[2]!)}, ${fmt(unit(n[3] ?? 1))})`,
    };

  const lits: string[] = [];
  const nums: number[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  number.lastIndex = 0;
  while ((m = number.exec(s))) {
    lits.push(s.slice(last, m.index));
    nums.push(parseFloat(m[0]));
    last = number.lastIndex;
  }
  lits.push(s.slice(last));
  return {
    nums,
    render: (n) => {
      let out = lits[0]!;
      for (let i = 0; i < n.length; i++) out += fmt(n[i]!) + (lits[i + 1] ?? "");
      return out;
    },
  };
}
