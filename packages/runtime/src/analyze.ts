import { type RigData } from "./rig";

/**
 * `analyze` — the runtime read *structurally*, without binding. Where `rig()`
 * turns a `RigData` into live lambdas (and needs the host's controller closures
 * to do it), `analyze` reads the *same* JSON as pure shape: what each clip
 * writes, which clips a controller places, who feeds a `mix`, and where the
 * reference graph loops. It is the one thing the editor needs from *inside* the
 * runtime — everything else it does from the outside as an ordinary host. It
 * takes no host inputs and throws nothing: a malformed or cyclic rig yields a
 * *model that describes the problem* (dangling refs left in `refs`, loops listed
 * in `cycles`, role slips in `diagnostics`) rather than an exception, because a
 * design surface must show a broken rig, not crash on it. The strict, throwing
 * checks live in `rig()`; `analyze` reports.
 */

/** How a controller is read — the three seams the runtime has. */
export type ControllerUse = "clock" | "coordinate" | "weights";

/** One place a controller is named, with enough context to lint and to locate it. */
export interface ControllerUsage {
  readonly name: string; // the controller named
  readonly use: ControllerUse; // coordinate/clock (a controller's own role), weights (a mix `by`)
  readonly node: string; // the node that reads it — the controller itself, or the mix
}

/** The two authored channel shapes — mirrors the runtime's own channel branch. */
export type ChannelKind = "keys" | "fn";

/** One channel's structural facts: what it *is*, and which pose slot it writes. */
export interface ChannelModel {
  readonly kind: ChannelKind;
  /** The pose slot this channel drives — its own key. */
  readonly slots: readonly string[];
}

/** One node, read as shape: an atomic clip, a controller, or an interior mix. */
export interface NodeModel {
  readonly kind: "clip" | "controller" | "mix";
  /** Every pose slot this node drives — the union across its channels/clips/inputs. */
  readonly slots: readonly string[];
  /** The nodes this node names (a controller's placed clips ∪ a mix's inputs). */
  readonly refs: readonly string[];
  readonly channels?: Readonly<Record<string, ChannelModel>>; // clip only
  readonly by?: string; // mix only
}

/**
 * A soft finding — legal but suspicious, the class `rig()` intentionally does
 * *not* hard-fail. Today only `role-mismatch`: a controller read in a way its
 * declaration didn't advertise (a `by` naming a `coordinate`, say).
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
  /** Reference cycles among nodes; each is the loop's nodes in visit order. */
  readonly cycles: readonly (readonly string[])[];
  readonly diagnostics: readonly Diagnostic[];
}

export function analyze(data: RigData): RigModel {
  const clips = data.clips ?? {};
  const controllers = data.controllers ?? {};
  const mixes = data.mixes ?? {};

  const nodes: Record<string, NodeModel> = {};
  const usages: ControllerUsage[] = [];

  // Slots, memoised and cycle-tolerant: revisiting a node already on the stack
  // returns nothing (the loop is reported in `cycles`, not re-walked), and a
  // dangling name contributes no slots. A controller owns the union of its placed
  // clips' slots; a mix the union of its inputs' — so this recurses the authored
  // graph exactly as a design surface needs.
  const slotCache = new Map<string, readonly string[]>();
  const onStack = new Set<string>();
  const slotsOf = (nm: string): readonly string[] => {
    const hit = slotCache.get(nm);
    if (hit) return hit;
    if (onStack.has(nm)) return [];
    onStack.add(nm);
    const out = new Set<string>();
    if (nm in clips) {
      for (const c in clips[nm]!.channels) out.add(c);
    } else if (nm in controllers) {
      for (const p of controllers[nm]!.clips ?? []) for (const s of slotsOf(p.clip)) out.add(s);
    } else if (nm in mixes) {
      for (const m of mixes[nm]!.mix) for (const s of slotsOf(m)) out.add(s);
    }
    onStack.delete(nm);
    const arr = [...out];
    slotCache.set(nm, arr);
    return arr;
  };

  for (const name in clips) {
    const channels: Record<string, ChannelModel> = {};
    for (const c in clips[name]!.channels) {
      const cd = clips[name]!.channels[c]!;
      channels[c] = { kind: "fn" in cd ? "fn" : "keys", slots: [c] };
    }
    nodes[name] = { kind: "clip", slots: slotsOf(name), refs: [], channels };
  }
  for (const name in controllers) {
    const decl = controllers[name]!;
    const refs = (decl.clips ?? []).map((p) => p.clip);
    nodes[name] = { kind: "controller", slots: slotsOf(name), refs };
    const as = decl.editor?.as;
    if (as === "coordinate" || as === "clock") usages.push({ name, use: as, node: name });
  }
  for (const name in mixes) {
    const node = mixes[name]!;
    nodes[name] = { kind: "mix", slots: slotsOf(name), refs: [...node.mix], by: node.by };
    usages.push({ name: node.by, use: "weights", node: name });
  }

  // Reference cycles: a three-colour DFS over the node graph (a node's refs are
  // its placed clips ∪ its mix inputs). A grey (on-stack) target is a back edge;
  // slice the stack from that target to record the loop.
  const cycles: string[][] = [];
  const colour = new Map<string, 1 | 2>(); // grey (on stack) | black (done)
  const stack: string[] = [];
  const walk = (nm: string): void => {
    if (!nodes[nm]) return;
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
  for (const name in nodes) if (colour.get(name) === undefined) walk(name);

  // Soft role lint: a usage's seam maps 1:1 to an `editor.as` (clock↔clock,
  // coordinate↔coordinate, weights↔weights). A *declared* controller read against
  // the grain is legal but flagged. Undeclared references are the loader's hard
  // error, not repeated here.
  const diagnostics: Diagnostic[] = [];
  for (const u of usages) {
    const d = controllers[u.name];
    if (!d) continue;
    if (d.editor?.as !== u.use)
      diagnostics.push({
        severity: "warn",
        code: "role-mismatch",
        controller: u.name,
        node: u.node,
        message: `controller "${u.name}" is read as ${u.use} by "${u.node}" but declared editor.as "${d.editor?.as}"`,
      });
  }

  return { nodes, usages, cycles, diagnostics };
}
