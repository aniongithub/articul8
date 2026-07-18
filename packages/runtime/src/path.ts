/** One absolute point in a path — an anchor or a bezier handle. */
export interface Pt {
  x: number;
  y: number;
}

/** A drawing command with its command letter (absolute) and its points. */
export interface Seg {
  readonly cmd: string;
  readonly pts: Pt[];
}

/** A parsed path: its segments, and every point flattened in draw order. */
export interface ParsedPath {
  readonly segs: Seg[];
  readonly points: Pt[];
}

/** Points consumed by each absolute command. */
const arity: Record<string, number> = { M: 1, L: 1, C: 3, S: 2, Q: 2, T: 1, Z: 0 };

const token = /([a-df-z])|(-?\d*\.?\d+(?:e[-+]?\d+)?)/gi;

/**
 * Parse a `d` string into absolute segments. Relative commands are folded to
 * absolute, `H`/`V` grow into full points, and every extra pair after a
 * moveto becomes a lineto — so downstream, a point is a point is a point.
 */
export function parsePath(d: string): ParsedPath {
  const segs: Seg[] = [];
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;

  let m: RegExpExecArray | null;
  let cmd = "";
  let nums: number[] = [];
  const runs: { cmd: string; nums: number[] }[] = [];
  token.lastIndex = 0;
  while ((m = token.exec(d))) {
    if (m[1]) {
      if (cmd) runs.push({ cmd, nums });
      cmd = m[1];
      nums = [];
    } else {
      nums.push(parseFloat(m[2]!));
    }
  }
  if (cmd) runs.push({ cmd, nums });

  for (const run of runs) {
    const rel = run.cmd >= "a";
    const C = run.cmd.toUpperCase();

    if (C === "Z") {
      segs.push({ cmd: "Z", pts: [] });
      cx = sx;
      cy = sy;
      continue;
    }
    if (C === "H" || C === "V") {
      for (const v of run.nums) {
        const x = C === "H" ? (rel ? cx + v : v) : cx;
        const y = C === "V" ? (rel ? cy + v : v) : cy;
        segs.push({ cmd: "L", pts: [{ x, y }] });
        cx = x;
        cy = y;
      }
      continue;
    }

    const n = arity[C];
    if (n === undefined) throw new Error(`articul8: unsupported path command "${run.cmd}"`);

    for (let i = 0; i + 2 * n <= run.nums.length; i += 2 * n) {
      const pts: Pt[] = [];
      for (let k = 0; k < n; k++) {
        const x = rel ? cx + run.nums[i + 2 * k]! : run.nums[i + 2 * k]!;
        const y = rel ? cy + run.nums[i + 2 * k + 1]! : run.nums[i + 2 * k + 1]!;
        pts.push({ x, y });
      }
      const cmdOut = C === "M" && i > 0 ? "L" : C;
      segs.push({ cmd: cmdOut, pts });
      const end = pts[pts.length - 1]!;
      cx = end.x;
      cy = end.y;
      if (cmdOut === "M") {
        sx = cx;
        sy = cy;
      }
    }
  }

  return { segs, points: segs.flatMap((s) => s.pts) };
}

const fmt = (n: number): string => {
  const r = Math.round(n * 1e4) / 1e4;
  return Object.is(r, -0) ? "0" : String(r);
};

/** Rebuild a `d` string from (possibly mutated) segments. */
export const buildPath = (segs: readonly Seg[]): string =>
  segs
    .map((s) =>
      s.pts.length ? s.cmd + s.pts.map((p) => `${fmt(p.x)},${fmt(p.y)}`).join(" ") : s.cmd,
    )
    .join(" ");
