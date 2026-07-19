import { type Bone, type Skeleton } from "./skeleton";
import { bindSkin, type Skin, type SkinMap } from "./skin";
import { parsePath, buildPath, type ParsedPath, type Seg } from "./path";
import { type Pose } from "./pose";
import { type Channel, type Track } from "./track";
import { interpolate } from "polymorph-js";

interface TrackData {
  readonly channels: Readonly<
    Record<string, { readonly keys: Readonly<Record<string, number | string>> }>
  >;
}

/**
 * The rig: a skeleton, its skin, and named animations — the art itself lives
 * in a separate SVG. Anything omitted is a default; anything at rest is simply
 * left unsaid.
 */
export interface RigData {
  readonly svg?: string;
  readonly bones?: Readonly<Record<string, Bone>>;
  readonly skin?: SkinMap;
  readonly animation?: Readonly<Record<string, TrackData>>;
}

export interface Rig {
  readonly skeleton: Skeleton;
  readonly tracks: Readonly<Record<string, Track>>;
  /** Headless: bind to an SVG document's text, get back a pose→`d` evaluator. */
  bind(svg: string): Skin;
  /** Live: inject the art into a parent element and drive it with poses. */
  bind(parent: Element, svg: string): View;
}

/** A mounted rig: hand it a pose, it moves the SVG already on the page. */
export interface View {
  render(pose: Pose): void;
}

/** A path's points, flattened to the `[x0, y0, x1, y1, …]` vector morph rides. */
const flat = (p: ParsedPath): number[] => p.points.flatMap((pt) => [pt.x, pt.y]);

/**
 * Correspondence between two arbitrary shapes is the one genuinely hard,
 * already-solved problem in morphing — so we hand it to `polymorph` rather than
 * reinvent it. It short-circuits its exact endpoints back to the raw, unequal
 * inputs, so we sample two frames just inside the interval, where its `fill`
 * has resampled both shapes onto one shared topology. Because it lerps each
 * matched point linearly, we then extrapolate those two frames back out to the
 * true `[0, 1]` ends — recovering the *pure* rest shape and *pure* target on
 * that shared topology, with none of the interior sample's drift toward the
 * other shape bleeding into the rest.
 */
const LO = 0.25;
const HI = 0.75;
const reconcile = (from: string, to: string): [base: string, morphed: string] => {
  const f = interpolate([from, to], { precision: 3, optimize: "fill" });
  const lo = parsePath(f(LO));
  const hi = parsePath(f(HI));
  if (lo.points.length !== hi.points.length)
    throw new Error(
      `articul8: could not reconcile a morph to one topology (${lo.points.length} vs ${hi.points.length} points)`,
    );
  // Straighten each matched point's line through the two samples out to `at`.
  const span = HI - LO;
  const end = (at: number): Seg[] =>
    lo.segs.map((s, i) => ({
      cmd: s.cmd,
      pts: s.pts.map((p, k) => {
        const q = hi.segs[i]!.pts[k]!;
        return { x: p.x + ((at - LO) / span) * (q.x - p.x), y: p.y + ((at - LO) / span) * (q.y - p.y) };
      }),
    }));
  return [buildPath(end(0)), buildPath(end(1))];
};

/**
 * A morph keyframe names the path it becomes — its target art lives in the SVG
 * (an artist's hidden layer), addressed like any other object. Its rest is
 * whatever the driven path draws, known only at bind, so we hold the reference
 * here and reconcile the two shapes against the bound art there.
 */
interface Morph {
  readonly channels: Record<string, Channel>; // the track's own bag, filled at bind
  readonly key: string; // the object this shape key drives
  readonly base?: string; // an explicit rest path, referenced at weight 0
  readonly time: number; // the weight at which the target is reached
  readonly target: string; // the referenced target path
}

const path = /<path\b[^>]*\bd="([^"]*)"[^>]*>/gi;
const idOf = /\bid="([^"]*)"/;

/** Paths in document order, with their ids — the skin's addressing space. */
const scan = (svg: string): { d: string; id?: string }[] => {
  const found: { d: string; id?: string }[] = [];
  let m: RegExpExecArray | null;
  path.lastIndex = 0;
  while ((m = path.exec(svg))) {
    const id = idOf.exec(m[0]);
    found.push(id ? { d: m[1]!, id: id[1]! } : { d: m[1]! });
  }
  return found;
};

export function rig(data: RigData): Rig {
  const skeleton: Skeleton = data.bones ?? {};
  const tracks: Record<string, Track> = {};
  const morphs: Morph[] = [];

  for (const name in data.animation) {
    const channels: Record<string, Channel> = {};
    let duration = 0;
    const src = data.animation[name]!.channels;
    for (const c in src) {
      const entries = Object.keys(src[c]!.keys)
        .map((k) => ({ t: Number(k), v: src[c]!.keys[k]! }))
        .sort((a, b) => a.t - b.t);

      // A string value is a morph: it references the path this channel becomes.
      if (entries.some((e) => typeof e.v === "string")) {
        if (entries.some((e) => typeof e.v !== "string"))
          throw new Error(`articul8: channel "${c}" mixes geometry and scalar keys`);
        const geo = entries as { t: number; v: string }[];
        const rest = geo[0]!.t === 0 && geo.length > 1 ? geo[0]! : undefined;
        const shots = rest ? geo.slice(1) : geo;
        if (shots.length !== 1)
          throw new Error(`articul8: morph channel "${c}" needs exactly one target (for now)`);
        channels[c] = { times: [], values: [] }; // placeholder, resolved at bind
        morphs.push({ channels, key: c, base: rest?.v, time: shots[0]!.t, target: shots[0]!.v });
        duration = Math.max(duration, shots[0]!.t);
        continue;
      }

      const times = entries.map((e) => e.t);
      channels[c] = { times, values: entries.map((e) => e.v as number) };
      duration = Math.max(duration, times[times.length - 1] ?? 0);
    }
    tracks[name] = { duration, channels };
  }

  const bindEls = (els: { d: string; id?: string }[]): Skin => {
    const ids: Record<string, number> = {};
    els.forEach((e, i) => {
      if (e.id) ids[e.id] = i;
    });
    const ref = (s: string): number => {
      const i = /^\d+$/.test(s) ? Number(s) : ids[s];
      if (i === undefined || !els[i]) throw new Error(`articul8: morph "${s}" names no object`);
      return i;
    };

    // Resolve each shape key against the art it drives: `polymorph` reconciles
    // the driven path and its target to one topology, and the driven object
    // rebinds to that base — so the skin and the morph ride one point vector.
    for (const mo of morphs) {
      const i = ref(mo.key);
      const [base, morphed] = reconcile(mo.base ? els[ref(mo.base)]!.d : els[i]!.d, els[ref(mo.target)]!.d);
      mo.channels[mo.key] = { times: [0, mo.time], values: [flat(parsePath(base)), flat(parsePath(morphed))] };
      els[i] = { ...els[i]!, d: base };
    }

    const parsed = els.map((e) => parsePath(e.d));

    // Reconciliation guarantees a geometry channel carries exactly its object's
    // point vector; assert it, so a future change can't silently break skinning.
    for (const name in tracks)
      for (const c in tracks[name]!.channels) {
        const v0 = tracks[name]!.channels[c]!.values[0];
        if (!Array.isArray(v0)) continue;
        const need = parsed[ref(c)]!.points.length * 2;
        if (v0.length !== need)
          throw new Error(`articul8: morph channel "${c}" has ${v0.length} coords, object needs ${need}`);
      }

    return bindSkin(skeleton, data.skin ?? {}, parsed, ids);
  };

  function bind(svg: string): Skin;
  function bind(parent: Element, svg: string): View;
  function bind(a: string | Element, svg?: string): Skin | View {
    if (typeof a === "string") return bindEls(scan(a));
    a.innerHTML = svg!;
    const nodes = [...a.querySelectorAll<SVGPathElement>("path")];
    const skin = bindEls(nodes.map((n) => ({ d: n.getAttribute("d") ?? "", id: n.id || undefined })));
    for (const [i, d] of skin.pose({})) nodes[i]!.setAttribute("d", d); // paint the reconciled rest
    return {
      render(pose: Pose): void {
        for (const [i, d] of skin.pose(pose)) nodes[i]!.setAttribute("d", d);
      },
    };
  }

  return { skeleton, tracks, bind };
}
