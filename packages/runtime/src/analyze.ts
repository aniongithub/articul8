import { type RigData } from "./rig";

/**
 * `analyze` — the runtime read *structurally*, without binding. Where `rig()`
 * turns a `RigData` into live lambdas (and needs the host's controller closures
 * to do it), `analyze` reads the *same* JSON as pure shape: what each channel
 * writes, what names what, who reads which controller and how, and where the
 * reference graph loops. It is the one thing the editor needs from *inside* the
 * runtime — everything else it does from the outside as an ordinary host. It
 * takes no host inputs and throws nothing: a malformed or cyclic rig yields a
 * *model that describes the problem* (dangling refs left in `refs`, loops listed
 * in `cycles`, role slips in `diagnostics`) rather than an exception, because a
 * design surface must show a broken rig, not crash on it. The strict, throwing
 * checks live in `rig()`; `analyze` reports.
 */

/** How a controller is read at a reference site — the three seams the runtime has. */
export type ControllerUse = "clock" | "coordinate" | "weights";

/** One place a controller is named, with enough context to lint and to locate it. */
export interface ControllerUsage {
  readonly name: string; // the controller named
  readonly use: ControllerUse; // clock (track), coordinate (axis `over`), weights (mix `by`)
  readonly node: string; // the animation that reads it
  readonly channel?: string; // for a coordinate: the axis channel that reads it
}

/** The three authored channel shapes — mirrors the runtime's own channel branch. */
export type ChannelKind = "keys" | "fn" | "axis";

/** One channel's structural facts: what it *is*, and which pose slots it writes. */
export interface ChannelModel {
  readonly kind: ChannelKind;
  /** The pose slots this channel drives — its own key, or (for an axis) the union
   *  of its children's slots. This is the fact the disjointness law is stated in. */
  readonly slots: readonly string[];
  readonly over?: string; // axis: the coordinate controller it reads
  readonly refs?: readonly string[]; // axis: the animations its keys name, in key order
}

/** One animation node, read as shape: a leaf (channels) or an interior mix. */
export interface NodeModel {
  readonly kind: "leaf" | "mix";
  /** Every pose slot this node drives — the union across its channels/inputs. */
  readonly slots: readonly string[];
  /** The animations this node names (a leaf's axis children ∪ a mix's inputs). */
  readonly refs: readonly string[];
  readonly channels?: Readonly<Record<string, ChannelModel>>; // leaf only
  readonly by?: string; // mix only
}

/**
 * A soft finding — legal but suspicious, the class `rig()` intentionally does
 * *not* hard-fail. Today only `role-mismatch`: a controller read in a way its
 * declaration didn't advertise (an `over` naming a `clock`, say). The currency
 * (`kind`) mismatches are hard errors and live in the loader, not here.
 */
export interface Diagnostic {
  readonly severity: "warn";
  readonly code: "role-mismatch";
  readonly message: string;
  readonly controller: string;
  readonly node: string;
}

/** The structural model of a rig — the facts the loader and the editor share. */
export interface RigModel {
  readonly nodes: Readonly<Record<string, NodeModel>>;
  readonly usages: readonly ControllerUsage[];
  /** Reference cycles among animations; each is the loop's nodes in visit order. */
  readonly cycles: readonly (readonly string[])[];
  readonly diagnostics: readonly Diagnostic[];
}

/** A key's value, unwrapped to the animation name it references (axis keys). */
const refName = (raw: unknown): string =>
  typeof raw === "object" && raw !== null ? String((raw as { value: unknown }).value) : String(raw);

export function analyze(data: RigData): RigModel {
  const anims = data.animations ?? {};
  const decls = data.controllers ?? {};

  // The pose slots a node drives, memoised and cycle-tolerant: revisiting a node
  // already on the stack returns nothing (the loop is reported in `cycles`, not
  // re-walked), and a dangling name contributes no slots. An axis owns the union
  // of its children's slots, so this recurses the authored graph exactly as the
  // loader's disjointness law requires — this is the pass `rig()` reuses.
  const slotCache = new Map<string, readonly string[]>();
  const onStack = new Set<string>();
  const slotsOf = (nm: string): readonly string[] => {
    const hit = slotCache.get(nm);
    if (hit) return hit;
    if (onStack.has(nm)) return [];
    const node = anims[nm];
    if (!node) return [];
    onStack.add(nm);
    const out = new Set<string>();
    if ("mix" in node) {
      for (const m of node.mix) for (const s of slotsOf(m)) out.add(s);
    } else {
      for (const c in node.channels) {
        const cd = node.channels[c]!;
        if ("over" in cd) for (const raw of Object.values(cd.keys)) for (const s of slotsOf(refName(raw))) out.add(s);
        else out.add(c); // a plain / fn channel is its own single slot
      }
    }
    onStack.delete(nm);
    const arr = [...out];
    slotCache.set(nm, arr);
    return arr;
  };

  const nodes: Record<string, NodeModel> = {};
  const usages: ControllerUsage[] = [];
  for (const name in anims) {
    const node = anims[name]!;
    if ("mix" in node) {
      nodes[name] = { kind: "mix", slots: slotsOf(name), refs: [...node.mix], by: node.by };
      usages.push({ name: node.by, use: "weights", node: name });
      continue;
    }
    const channels: Record<string, ChannelModel> = {};
    const refs = new Set<string>();
    if (node.controller) usages.push({ name: node.controller, use: "clock", node: name });
    for (const c in node.channels) {
      const cd = node.channels[c]!;
      if ("over" in cd) {
        const cRefs = Object.values(cd.keys).map(refName);
        cRefs.forEach((r) => refs.add(r));
        const slots = new Set<string>();
        for (const r of cRefs) for (const s of slotsOf(r)) slots.add(s);
        channels[c] = { kind: "axis", slots: [...slots], over: cd.over, refs: cRefs };
        usages.push({ name: cd.over, use: "coordinate", node: name, channel: c });
      } else if ("fn" in cd) {
        channels[c] = { kind: "fn", slots: [c] };
      } else {
        channels[c] = { kind: "keys", slots: [c] };
      }
    }
    nodes[name] = { kind: "leaf", slots: slotsOf(name), refs: [...refs], channels };
  }

  // Reference cycles: a three-colour DFS over the animation graph (a node's refs
  // are its axis children ∪ mix inputs). A grey (on-stack) target is a back edge;
  // slice the stack from that target to record the loop. Each node is walked once,
  // so each back edge is seen once.
  const cycles: string[][] = [];
  const colour = new Map<string, 1 | 2>(); // grey (on stack) | black (done)
  const stack: string[] = [];
  const walk = (nm: string): void => {
    if (!anims[nm]) return;
    colour.set(nm, 1);
    stack.push(nm);
    for (const r of nodes[nm]?.refs ?? []) {
      const c = colour.get(r);
      if (c === undefined) walk(r);
      else if (c === 1) {
        const i = stack.indexOf(r);
        if (i >= 0) cycles.push(stack.slice(i));
      }
    }
    stack.pop();
    colour.set(nm, 2);
  };
  for (const name in anims) if (colour.get(name) === undefined) walk(name);

  // Soft role lint: a usage's seam maps 1:1 to an `editor.as` (clock↔clock,
  // coordinate↔coordinate, weights↔weights). A *declared* controller read against
  // the grain is legal but flagged. Undeclared references are the loader's hard
  // error, not repeated here.
  const diagnostics: Diagnostic[] = [];
  for (const u of usages) {
    const d = decls[u.name];
    if (!d) continue;
    if (d.editor?.as !== u.use)
      diagnostics.push({
        severity: "warn",
        code: "role-mismatch",
        controller: u.name,
        node: u.node,
        message: `controller "${u.name}" is read as ${u.use} by "${u.node}"${
          u.channel ? ` (channel "${u.channel}")` : ""
        } but declared editor.as "${d.editor?.as}"`,
      });
  }

  return { nodes, usages, cycles, diagnostics };
}
