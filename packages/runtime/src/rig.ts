import { type Bone, type Skeleton } from "./skeleton";
import { bindSkin, type Skin, type SkinMap } from "./skin";
import { parsePath, buildPath, type ParsedPath, type Seg } from "./path";
import { parseAttr, type Attr } from "./attr";
import { blend, type Pose } from "./pose";
import { at, type Channel, type Clip, type Wrap, type Source, hold, clamp, loop, pingpong } from "./track";
import { clip, place, type Anim } from "./layer";
import { segment, type Ease, type Handle } from "./ease";
import { generators, type Env, type Knob } from "./generator";
import { interpolate } from "polymorph-js";

/**
 * A keyframe as authored: a bare value (linear), or a value wearing Bézier
 * handles — `in` shaping how the tween arrives *at* this key, `out` how it
 * *leaves* toward the next. A segment's curve is the left key's `out` meeting
 * the right key's `in`; omit them and it is piecewise linear.
 */
interface KeyData {
  readonly value: number | string;
  readonly in?: Handle;
  readonly out?: Handle;
}
type KeyVal = number | string | KeyData;

/**
 * A knob as authored: a bare constant, or — because a knob is just a channel —
 * a nested channel spec that varies it over time. So a wave's `amp` may be a
 * number, another wave, or a key list, and *that* wave's knobs may in turn be
 * anything, arbitrarily deep. Composition is nothing but this recursion.
 */
type KnobData = number | ChannelData;

/** The four modulatable knobs of a generator, each an authored knob. */
interface KnobEnv {
  readonly bias?: KnobData;
  readonly amp?: KnobData;
  readonly phase?: KnobData;
  readonly freq?: KnobData;
}

/**
 * A channel as authored: a bag of `keys` (stored keyframes) or a `fn` naming a
 * generator plus its knobs (a procedural wave). One of the two; the runtime
 * reads keys and waves through one seam. (Blendspaces are no longer a channel —
 * placing and blending clips is a *controller's* job, not data buried in a leaf.)
 */
type ChannelData =
  | { readonly keys: Readonly<Record<string, KeyVal>> }
  | ({ readonly fn: string } & KnobEnv);

/** The named edge rules a clip may declare in JSON — its own `wrap`. */
const wraps: Readonly<Record<string, Wrap>> = { hold, clamp, loop, pingpong };

/**
 * A clip as authored: atomic keyframe data. A bag of channels and an optional
 * `wrap` (its own edge rule past its span). A clip is a **time-domain** motion —
 * its keys are milliseconds, `0` = rest through to its authored duration — that
 * knows nothing about clocks, coordinates, ranges, or who samples it. Whoever
 * *places* it (a controller) decides the coordinate it reads and, via `scale`,
 * how that coordinate maps onto the clip's ms parameter.
 */
interface ClipData {
  readonly channels: Readonly<Record<string, ChannelData>>;
  /** What a parameter past this clip's span means — defaults to `hold` (abstain). */
  readonly wrap?: string;
}

/**
 * One placement inside a controller: a clip it references, and the affine that
 * positions it on the controller's input. The controller reads its source value
 * `v` and samples the clip at `u = (v - offset) / scale`.
 *   • `offset` (default `0`) anchors the clip — the input value where `u = 0`
 *     (a phase shift for a wave, the rest coordinate for a gaze).
 *   • `scale`  (default `1`) is how many input units span one clip parameter
 *     unit; its sign mirrors the clip onto the other side of `offset`. For a
 *     gaze whose clip runs `0…1000 ms`, `scale = -0.001` reaches the far extreme
 *     (`u = 1000`) when the cursor is at `-1`. For a clock, input already *is*
 *     time, so `offset 0, scale 1` samples the clip's ms keys straight through.
 */
interface Placement {
  readonly clip: string;
  readonly offset?: number;
  readonly scale?: number;
}

/**
 * An interior node — combinators as data. It names other nodes to fan in (`mix`,
 * by name) and a controller to weight them (`by`, one fader per input). At every
 * frame the controller hands back a `{ input → weight }` map and the node folds
 * the sampled inputs through the one `blend` primitive. It never inspects what an
 * input *carries*: crossfading eye positions, opacity across two shapes, or a
 * geometry morph are the same call — the weights are per-*input*, never per-
 * channel. The rule is tight: the map's keys must be exactly the `mix` names, no
 * scalar shorthand, N inputs ⇒ N faders. The controller may abstain (`undefined`)
 * and the whole node casts no vote, exactly like a keyframe past its edge.
 */
interface MixData {
  readonly mix: readonly string[];
  readonly by: string;
}

/** One key, unwrapped to its value and (optional) handles. */
const key = (raw: KeyVal): KeyData => (typeof raw === "object" ? raw : { value: raw });

/** The eases of a key list, one per segment: each key's `out` meets the next's `in`. */
const easesOf = (keys: readonly { in?: Handle; out?: Handle }[]): Ease[] =>
  keys.slice(0, -1).map((k, i) => segment(k.out, keys[i + 1]!.in));

/** A key record, unwrapped to time-sorted entries (value plus its handles). */
const entriesOf = (keys: Readonly<Record<string, KeyVal>>) =>
  Object.keys(keys)
    .map((k) => {
      const kd = key(keys[k]!);
      return { t: Number(k), v: kd.value, in: kd.in, out: kd.out };
    })
    .sort((a, b) => a.t - b.t);

/**
 * Build one authored knob into a live one — a function of time. A constant
 * folds to a function that ignores its argument; a wave or a key list recurse
 * through the very same builders the top level uses, because a knob is just a
 * channel. A key-list knob is *clamped* to its end values (a wave needs a
 * number at every instant; unlike a pose channel it cannot abstain), and rides
 * the same eased interpolation as any keyframe channel.
 */
const buildKnob = (k: KnobData): Knob => {
  if (typeof k === "number") return () => k;
  if ("fn" in k) return buildGen(k);
  const e = entriesOf(k.keys);
  if (e.some((x) => typeof x.v !== "number"))
    throw new Error(`articul8: a knob key list must be numeric`);
  const ch: Channel = { times: e.map((x) => x.t), values: e.map((x) => x.v as number), eases: easesOf(e) };
  const lo = ch.times[0]!;
  const hi = ch.times[ch.times.length - 1]!;
  return (t) => at(ch, Math.max(lo, Math.min(hi, t))) as number;
};

/**
 * Build a procedural wave: look up the named leaf and hand it an envelope whose
 * knobs are each built (present ones only — an omitted knob keeps the leaf's
 * identity default). Mutually recursive with `buildKnob`, so a knob may be yet
 * another wave, nested to any depth.
 */
const buildGen = (cd: { fn: string } & KnobEnv): Knob => {
  const make = generators[cd.fn];
  if (!make) throw new Error(`articul8: no generator "${cd.fn}"`);
  const env: Env = {
    bias: cd.bias === undefined ? undefined : buildKnob(cd.bias),
    amp: cd.amp === undefined ? undefined : buildKnob(cd.amp),
    phase: cd.phase === undefined ? undefined : buildKnob(cd.phase),
    freq: cd.freq === undefined ? undefined : buildKnob(cd.freq),
  };
  return make(env);
};

/**
 * How a controller is *authored* — the WinForms `[Editor]`/`UITypeEditor` model.
 * `as` names the authoring surface; the rest configure it. This is read by the
 * property inspector and the analyzer, and NEVER by the evaluator — it is chrome
 * and intent, not mechanism.
 *  - `coordinate`: a value swept along a shared ruler. `range` is that ruler (the
 *    range clips are placed against); `default` is the rest value (and doubles as
 *    the abstain value); `step` an optional snap.
 *  - `clock`: a time source read *through* a clip. It has no coordinate ruler —
 *    a scrubber's bounds are the clip's own key span. `gate: "trigger"` means it
 *    abstains until fired (rest *is* abstain, so there is no `default`); `"free"`
 *    runs continuously.
 *  - `weights`: a fader bank feeding a `mix`/`by`. It places no clips of its own.
 */
export type EditorData =
  | {
      readonly as: "coordinate";
      readonly range?: readonly [number, number];
      readonly default?: number;
      readonly step?: number;
      readonly label?: string;
    }
  | { readonly as: "clock"; readonly gate?: "free" | "trigger"; readonly label?: string }
  | { readonly as: "weights"; readonly label?: string };

/**
 * A controller *declaration* — a named coordinate that references clips and
 * places them. `kind` is the runtime **currency**: the only field the evaluator
 * branches on (`number` for a coordinate/clock, `weights` for a `by`). `editor`
 * is the authoring model above. `clips` are the placements a coordinate/clock
 * controller folds — each a clip plus the `offset` that positions and scales it;
 * a `weights` controller omits `clips` (it feeds a `mix`/`by` instead). The host
 * still supplies the actual `t → value` closure (the *source*) at bind against
 * the `controllers` option, keyed by the same name; this declares *what* the rig
 * expects, the closure is *how* the value is produced. Declaring controllers here
 * makes a rig self-describing: the `.jsonc` alone tells an editor (or a reader)
 * exactly what inputs to feed it, and which clips each drives.
 */
export interface ControllerData {
  readonly kind?: "number" | "weights";
  readonly editor: EditorData;
  readonly clips?: readonly Placement[];
}

/**
 * The rig: a skeleton, its skin, a library of atomic `clips`, the `controllers`
 * that place those clips on a coordinate, and any interior `mixes` that fan
 * several nodes together — the art itself lives in a separate SVG. Anything
 * omitted is a default; anything at rest is simply left unsaid.
 */
export interface RigData {
  readonly svg?: string;
  readonly bones?: Readonly<Record<string, Bone>>;
  readonly skin?: SkinMap;
  readonly clips?: Readonly<Record<string, ClipData>>;
  readonly controllers?: Readonly<Record<string, ControllerData>>;
  readonly mixes?: Readonly<Record<string, MixData>>;
}

/**
 * The impure leaves, supplied by the host: a name → a `t → value` closure that
 * may read live state (a click, the cursor) and abstain with `undefined`. This
 * is the *only* place the outside world enters. Each name matches a declared
 * controller: a coordinate/clock source returns a `number`, a `by` source a
 * `{ input → weight }` map; either abstains with `undefined`. Provision is
 * uniform; only who reads it varies.
 */
export type Controllers = Readonly<Record<string, Source>>;

/** Host-supplied bindings for a rig: the controllers its JSON names. */
export interface RigOptions {
  readonly controllers?: Controllers;
}

export interface Rig {
  readonly skeleton: Skeleton;
  /** The atomic clip data, by name — for tests and introspection. */
  readonly clips: Readonly<Record<string, Clip>>;
  /** Every playable node as a ready lambda — an atomic clip read directly, a
   *  controller that places its clips on a coordinate, or an interior `mix` node
   *  folded through its `by` controller. This is the play API: the caller threads
   *  the clock (`anims.gazeX(ms)`) and blends the results with `mix(...)`. */
  readonly anims: Readonly<Record<string, Anim>>;
  /** Headless: bind to an SVG document's text, get back a pose→art evaluator. */
  bind(svg: string): Puppet;
  /** Live: inject the art into a parent element and drive it with poses. */
  bind(parent: Element, svg: string): View;
}

/** A value string, ready to write to an attribute. */
export type Attrs = Readonly<Record<string, string>>;

/**
 * A bound rig: geometry (`pose`, the skin) and paint (`paint`, every other
 * attribute) read the *same* sparse pose through disjoint channels. The skin
 * claims a path's `d`; the painter claims `object.attr` for every other `attr`.
 */
export interface Puppet extends Skin {
  paint(pose: Pose): Map<number, Attrs>;
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
  readonly channels: Record<string, Channel>; // the clip's own bag, filled at bind
  readonly key: string; // the object this shape channel drives
  readonly times: readonly number[]; // keyframe times
  readonly refs: readonly string[]; // per key: the object it becomes (self = rest)
  readonly eases: readonly Ease[]; // per segment
}

/**
 * A paint channel drives one presentation attribute of one object — `eyeR.fill`,
 * `halo.opacity`. Like a morph, its keys are resolved at bind: a literal value,
 * or a reference to another object's *same* attribute (property-directed sugar).
 * Its rest is the object's authored attribute if it has one, else the channel
 * must supply an explicit key at weight 0.
 */
interface Paint {
  readonly channels: Record<string, Channel>; // the clip's own bag, filled at bind
  readonly key: string; // the pose channel, e.g. "eyeR.fill"
  readonly obj: string; // the object it paints, e.g. "eyeR"
  readonly attr: string; // the attribute it drives, e.g. "fill"
  readonly entries: { t: number; v: number | string; in?: Handle; out?: Handle }[];
}

const path = /<path\b[^>]*\bd="([^"]*)"[^>]*>/gi;
const attr = /([\w:-]+)\s*=\s*"([^"]*)"/g;

/** One object: its geometry, id, and a reader for any authored attribute. */
interface Obj {
  readonly d: string;
  readonly id?: string;
  readonly attr: (name: string) => string | undefined;
}

/** Split an inline `style="a:1;b:2"` into a lookup. */
const declrs = (style: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const part of style.split(";")) {
    const k = part.indexOf(":");
    if (k > 0) out[part.slice(0, k).trim()] = part.slice(k + 1).trim();
  }
  return out;
};

/** Paths in document order — the skin's addressing space, plus their attrs. */
const scan = (svg: string): Obj[] => {
  const found: Obj[] = [];
  let m: RegExpExecArray | null;
  path.lastIndex = 0;
  while ((m = path.exec(svg))) {
    const map: Record<string, string> = {};
    let a: RegExpExecArray | null;
    attr.lastIndex = 0;
    while ((a = attr.exec(m[0]!))) map[a[1]!] = a[2]!;
    const style = map["style"] ? declrs(map["style"]) : {};
    found.push({
      d: m[1]!,
      id: map["id"],
      attr: (name) => style[name] ?? map[name], // inline style wins, like the DOM
    });
  }
  return found;
};

export function rig(data: RigData, opts: RigOptions = {}): Rig {
  const skeleton: Skeleton = data.bones ?? {};

  // Controller declarations, validated once. A rig *may* declare its controllers
  // (name → currency + authoring editor + the clips it places); when it does, the
  // declarations are authoritative — every controller a `by` names must appear
  // here, so a typo is a load error rather than a silent dead input. The block is
  // optional. Currency (`kind`) is recorded but not yet enforced.
  const decls = data.controllers;
  if (decls) {
    for (const n in decls) {
      const d = decls[n]!;
      if (d.kind !== undefined && d.kind !== "number" && d.kind !== "weights")
        throw new Error(`articul8: controller "${n}" declares unknown kind "${d.kind}"`);
      const as = d.editor?.as;
      if (as !== "coordinate" && as !== "clock" && as !== "weights")
        throw new Error(`articul8: controller "${n}" declares unknown editor "as" "${as}"`);
    }
  }
  /** When a `controllers` block is present, a named controller must be declared. */
  const requireDeclared = (name: string, site: string): void => {
    if (decls && !(name in decls))
      throw new Error(`articul8: ${site} names controller "${name}" not declared in \`controllers\``);
  };

  const clips: Record<string, Clip> = {};
  const morphs: Morph[] = [];
  const paints: Paint[] = [];

  for (const name in data.clips) {
    const node = data.clips[name]!;
    const channels: Record<string, Channel> = {};
    let span = 0;
    const src = node.channels;
    for (const c in src) {
      const cd = src[c]!;

      // A `fn` channel is a procedural wave, not stored keys: build the named
      // generator (its knobs may themselves be waves or key lists) and let it
      // vote every frame. A wave is born infinite — it owns no span and lends
      // the clip no span, and `sampleClip` hands it the raw parameter, never the
      // clip's wrap — so it reads its coordinate exactly as authored whether or
      // not any keyframe channel beside it loops.
      if ("fn" in cd) {
        channels[c] = { times: [], values: [], fn: buildGen(cd) };
        continue;
      }

      const entries = entriesOf(cd.keys);

      const dot = c.indexOf(".");
      const prop = dot >= 0 ? c.slice(dot + 1) : "";
      const transform =
        prop === "x" || prop === "y" || prop === "rotation" || prop === "sx" || prop === "sy";

      // A dotted, non-transform channel paints an attribute — fill, opacity,
      // stroke-width. Its keys are literals or references, resolved at bind
      // (against the art), exactly like a morph. The skeleton never sees it.
      if (dot >= 0 && !transform) {
        channels[c] = { times: [], values: [] }; // placeholder, resolved at bind
        paints.push({ channels, key: c, obj: c.slice(0, dot), attr: prop, entries });
        span = Math.max(span, entries[entries.length - 1]?.t ?? 0);
        continue;
      }

      // A bare string value is a morph: each key names the path this channel
      // *becomes* — the driven object itself (rest) or a target in the SVG. It
      // plays as a clip, so a lone target key gets an implicit rest at 0 (the
      // object naming itself), exactly like a paint channel's implicit key 0.
      if (entries.some((e) => typeof e.v === "string")) {
        if (entries.some((e) => typeof e.v !== "string"))
          throw new Error(`articul8: channel "${c}" mixes geometry and scalar keys`);
        const geo = entries as { t: number; v: string; in?: Handle; out?: Handle }[];
        if (geo[0]!.t !== 0) geo.unshift({ t: 0, v: c }); // rest at 0 = self-reference
        channels[c] = { times: [], values: [] }; // placeholder, resolved at bind
        morphs.push({
          channels,
          key: c,
          times: geo.map((e) => e.t),
          refs: geo.map((e) => e.v),
          eases: easesOf(geo),
        });
        span = Math.max(span, geo[geo.length - 1]!.t);
        continue;
      }

      const times = entries.map((e) => e.t);
      channels[c] = { times, values: entries.map((e) => e.v as number), eases: easesOf(entries) };
      span = Math.max(span, times[times.length - 1] ?? 0);
    }
    let wrap: Wrap | undefined;
    if (node.wrap) {
      wrap = wraps[node.wrap];
      if (!wrap) throw new Error(`articul8: clip "${name}" names no wrap "${node.wrap}"`);
    }
    clips[name] = { channels, wrap, span };
  }

  /**
   * Every playable node as a ready lambda, built lazily and memoised so a node
   * names its children by string and the wiring is order-free (cycles caught):
   *   • a **clip** reads directly as `clip(data)` — a pure `parameter → Pose`.
   *   • a **controller** reads its source `v` and folds its placed clips: each is
   *     sampled at `u = (v - offset) / scale`, then `blend`ed at equal weight (the
   *     abstain + carrier-normalization laws make two half-axis clips resolve to
   *     one value).
   *   • an interior **mix** node fans in its inputs and folds them through its
   *     `by` controller's per-input weights.
   * Clip / controller / mix names share one namespace; a collision is a build
   * error, so `resolve` looks each name up in exactly one map.
   */
  const anims: Record<string, Anim> = {};
  const building = new Set<string>();

  const controllerSource = (name: string, site: string): Source => {
    requireDeclared(name, site);
    const src = opts.controllers?.[name];
    if (!src) throw new Error(`articul8: ${site} names controller "${name}" with no source supplied`);
    return src;
  };

  const resolve = (name: string): Anim => {
    if (anims[name]) return anims[name]!;
    if (building.has(name)) throw new Error(`articul8: node "${name}" is cyclic`);
    building.add(name);
    let anim: Anim;

    if (name in clips) {
      anim = clip(clips[name]!);
    } else if (decls && name in decls && decls[name]!.clips) {
      // A controller: place its clips on the coordinate its source returns.
      const decl = decls[name]!;
      const placed = decl.clips!.map((p) => {
        if (!(p.clip in clips))
          throw new Error(`articul8: controller "${name}" places unknown clip "${p.clip}"`);
        // The affine that positions the clip on the controller's input: sample it
        // at `u = (v - offset) / scale`. `offset` anchors it (a phase shift for a
        // wave, the rest coordinate for a gaze); `scale` is how many input units
        // span one clip parameter unit, its sign mirroring the clip. A clock is
        // just the identity placement (offset 0, scale 1): input ms → clip ms.
        return place(resolve(p.clip), { offset: p.offset ?? 0, scale: p.scale ?? 1 });
      });
      const src = controllerSource(name, `controller "${name}"`);
      const ones = placed.map(() => 1);
      anim = (t) => {
        const v = src(t);
        if (v === undefined) return {}; // the source abstains → the controller abstains
        if (typeof v !== "number")
          throw new Error(`articul8: controller "${name}" must return a coordinate, not weights`);
        return blend(placed.map((pl) => pl(v)), ones);
      };
    } else if (data.mixes && name in data.mixes) {
      const node = data.mixes[name]!;
      const inputs = node.mix;
      const set = new Set(inputs);
      const children = inputs.map(resolve); // may name clips, controllers, or other mixes
      const by = controllerSource(node.by, `node "${name}"`);
      anim = (t) => {
        const w = by(t);
        if (w === undefined) return {}; // the controller abstains → the node abstains
        if (typeof w === "number")
          throw new Error(`articul8: controller "${node.by}" must return per-input weights, not a scalar`);
        for (const k in w)
          if (!set.has(k)) throw new Error(`articul8: controller "${node.by}" weights unknown input "${k}" of node "${name}"`);
        for (const k of inputs)
          if (!(k in w)) throw new Error(`articul8: controller "${node.by}" omits weight for input "${k}" of node "${name}"`);
        return blend(children.map((c) => c(t)), inputs.map((k) => w[k]!));
      };
    } else {
      throw new Error(`articul8: node "${name}" not found`);
    }

    building.delete(name);
    return (anims[name] = anim);
  };

  for (const name in clips) resolve(name);
  if (decls) for (const name in decls) if (decls[name]!.clips) resolve(name);
  if (data.mixes) for (const name in data.mixes) resolve(name);

  const bindEls = (els: Obj[]): Puppet => {
    const ids: Record<string, number> = {};
    els.forEach((e, i) => {
      if (e.id) ids[e.id] = i;
    });
    const ref = (s: string): number => {
      const i = /^\d+$/.test(s) ? Number(s) : ids[s];
      if (i === undefined || !els[i]) throw new Error(`articul8: "${s}" names no object`);
      return i;
    };
    const known = (s: string): boolean => (/^\d+$/.test(s) ? !!els[Number(s)] : s in ids);

    // Resolve each shape key against the art it drives: `polymorph` reconciles
    // the driven path and its target to one topology, and the driven object
    // rebinds to that base — so the skin and the morph ride one point vector.
    for (const mo of morphs) {
      const i = ref(mo.key);
      // Every key names an object: the driven object itself (rest) or the one
      // distinct target it blooms to. Reconcile self↔target once, to a shared
      // topology; then each key rides that vector — rest→base, target→morphed.
      const targets = [...new Set(mo.refs.filter((r) => ref(r) !== i))];
      if (targets.length > 1)
        throw new Error(`articul8: morph channel "${mo.key}" blooms to ${targets.length} targets (one for now)`);
      const [base, morphed] = targets.length
        ? reconcile(els[i]!.d, els[ref(targets[0]!)]!.d)
        : [els[i]!.d, els[i]!.d];
      const rest = flat(parsePath(base));
      const target = flat(parsePath(morphed));
      mo.channels[mo.key] = {
        times: mo.times,
        values: mo.refs.map((r) => (ref(r) === i ? rest : target)),
        eases: mo.eases,
      };
      els[i] = { ...els[i]!, d: base };
    }

    // Resolve each paint channel the same way: read its object's authored value
    // as rest, then each key as a literal or a reference to another object's
    // *same* attribute. The codec turns every value into one number vector plus
    // a `render` closure that writes it back in the value's own shape.
    interface PB {
      readonly i: number;
      readonly key: string;
      readonly attr: string;
      readonly render: Attr["render"];
    }
    const painters: PB[] = [];
    for (const pa of paints) {
      const i = ref(pa.obj);
      const authored = els[i]!.attr(pa.attr);
      let render: Attr["render"] | undefined = authored !== undefined ? parseAttr(authored).render : undefined;
      const times: number[] = [];
      const values: number[][] = [];
      const handles: { in?: Handle; out?: Handle }[] = [];
      const add = (t: number, raw: number | string, h: { in?: Handle; out?: Handle }): void => {
        const src = typeof raw === "string" && known(raw) ? els[ref(raw)]!.attr(pa.attr) : String(raw);
        if (src === undefined)
          throw new Error(`articul8: "${raw}" has no ${pa.attr} for "${pa.key}" to wear`);
        const a = parseAttr(src);
        render ??= a.render;
        times.push(t);
        values.push([...a.nums]);
        handles.push(h);
      };
      if (pa.entries[0]!.t !== 0) {
        if (authored === undefined)
          throw new Error(`articul8: paint channel "${pa.key}" needs a key at 0 (no authored ${pa.attr})`);
        add(0, authored, {}); // implicit rest key — linear on both sides
      }
      for (const e of pa.entries) add(e.t, e.v, { in: e.in, out: e.out });
      const len = values[0]!.length;
      if (values.some((v) => v.length !== len))
        throw new Error(`articul8: paint channel "${pa.key}" mixes value shapes`);
      pa.channels[pa.key] = { times, values, eases: easesOf(handles) };
      painters.push({ i, key: pa.key, attr: pa.attr, render: render! });
    }

    const parsed = els.map((e) => parsePath(e.d));

    // Reconciliation guarantees a geometry channel carries exactly its object's
    // point vector; assert it, so a future change can't silently break skinning.
    // Dotted channels are paint, not geometry — they name no path, so skip them.
    for (const name in clips)
      for (const c in clips[name]!.channels) {
        if (c.includes(".")) continue;
        const v0 = clips[name]!.channels[c]!.values[0];
        if (!Array.isArray(v0)) continue;
        const need = parsed[ref(c)]!.points.length * 2;
        if (v0.length !== need)
          throw new Error(`articul8: morph channel "${c}" has ${v0.length} coords, object needs ${need}`);
      }

    const geo = bindSkin(skeleton, data.skin ?? {}, parsed, ids);
    const paint = (pose: Pose): Map<number, Attrs> => {
      const out = new Map<number, Record<string, string>>();
      for (const p of painters) {
        const v = pose[p.key];
        if (v === undefined) continue; // abstaining channel → keep authored value
        const group = out.get(p.i) ?? {};
        group[p.attr] = p.render(typeof v === "number" ? [v] : v);
        out.set(p.i, group);
      }
      return out;
    };
    return { pose: (pose) => geo.pose(pose), paint };
  };

  function bind(svg: string): Puppet;
  function bind(parent: Element, svg: string): View;
  function bind(a: string | Element, svg?: string): Puppet | View {
    if (typeof a === "string") return bindEls(scan(a));
    a.innerHTML = svg!;
    const nodes = [...a.querySelectorAll<SVGPathElement>("path")];
    const puppet = bindEls(
      nodes.map((n) => ({
        d: n.getAttribute("d") ?? "",
        id: n.id || undefined,
        attr: (name) => n.getAttribute(name) ?? (n.style.getPropertyValue(name) || undefined),
      })),
    );
    const draw = (pose: Pose): void => {
      for (const [i, d] of puppet.pose(pose)) nodes[i]!.setAttribute("d", d);
      for (const [i, at] of puppet.paint(pose)) for (const k in at) nodes[i]!.setAttribute(k, at[k]!);
    };
    draw({}); // paint the reconciled rest + any driven attrs at pose 0
    return { render: (pose) => draw(pose) };
  }

  return { skeleton, clips, anims, bind };
}
