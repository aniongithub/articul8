import { type Bone, type Skeleton } from "./skeleton";
import { bindSkin, type Skin, type SkinMap } from "./skin";
import { parsePath } from "./path";
import { type Pose } from "./pose";
import { type Channel, type Track } from "./track";

interface TrackData {
  readonly channels: Readonly<Record<string, { readonly keys: Readonly<Record<string, number>> }>>;
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

const toChannel = (keys: Readonly<Record<string, number>>): Channel => {
  const times = Object.keys(keys)
    .map(Number)
    .sort((a, b) => a - b);
  return { times, values: times.map((t) => keys[String(t)]!) };
};

const toTrack = (data: TrackData): Track => {
  const channels: Record<string, Channel> = {};
  let duration = 0;
  for (const c in data.channels) {
    const ch = toChannel(data.channels[c]!.keys);
    channels[c] = ch;
    duration = Math.max(duration, ch.times[ch.times.length - 1] ?? 0);
  }
  return { duration, channels };
};

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
  for (const name in data.animation) tracks[name] = toTrack(data.animation[name]!);

  const bindEls = (els: { d: string; id?: string }[]): Skin => {
    const ids: Record<string, number> = {};
    els.forEach((e, i) => {
      if (e.id) ids[e.id] = i;
    });
    return bindSkin(skeleton, data.skin ?? {}, els.map((e) => parsePath(e.d)), ids);
  };

  function bind(svg: string): Skin;
  function bind(parent: Element, svg: string): View;
  function bind(a: string | Element, svg?: string): Skin | View {
    if (typeof a === "string") return bindEls(scan(a));
    a.innerHTML = svg!;
    const nodes = [...a.querySelectorAll<SVGPathElement>("path")];
    const skin = bindEls(nodes.map((n) => ({ d: n.getAttribute("d") ?? "", id: n.id || undefined })));
    return {
      render(pose: Pose): void {
        for (const [i, d] of skin.pose(pose)) nodes[i]!.setAttribute("d", d);
      },
    };
  }

  return { skeleton, tracks, bind };
}
