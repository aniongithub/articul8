import type { RigDocument } from "@articul8/core";

/** A flattened outline row shown left of the dope-sheet, 1:1 with a timeline row. */
export interface OutlineEntry {
  id: string;
  depth: number;
  kind: "group" | "channel";
  label: string;
  /** secondary label (animation name for channels, entity kind for groups) */
  sub?: string;
  /** channel keyframes in seconds (empty for group rows) */
  keyframes: { time: number; value: number }[];
  /** for selection back to a bone/slot/rig entity */
  entity?: Selection;
}

export type Selection =
  | { kind: "bone"; id: string }
  | { kind: "slot"; id: string }
  | { kind: "rig"; id: "rig" }
  | null;

interface Bucket {
  key: string;
  label: string;
  sub: string;
  entity: Selection;
  channels: OutlineEntry[];
}

/**
 * Fold every authored channel into a treeview grouped by rig entity (a top `rig`
 * node for globals/inputs, then bones, then slots). This is the "inspector in the
 * timeline" — values live only as channels, never as a scalar panel.
 */
export function buildOutline(doc: RigDocument): OutlineEntry[] {
  const buckets = new Map<string, Bucket>();
  const ensure = (key: string, label: string, entity: Selection): Bucket => {
    let b = buckets.get(key);
    if (!b) {
      b = { key, label, sub: key.split(":")[0] ?? "", entity, channels: [] };
      buckets.set(key, b);
    }
    return b;
  };

  for (const anim of doc.animations ?? []) {
    for (const ch of anim.channels) {
      const t = ch.target;
      let key: string;
      let label: string;
      let entity: Selection;
      if (t.kind === "bone") {
        key = `bone:${t.bone}`;
        label = `${t.bone}.${t.property}`;
        entity = { kind: "bone", id: t.bone };
      } else if (t.kind === "slot") {
        key = `slot:${t.slot}`;
        label = `${t.slot}.${t.property}`;
        entity = { kind: "slot", id: t.slot };
      } else if (t.kind === "input") {
        key = "rig";
        label = `${t.input}.${t.property}`;
        entity = { kind: "rig", id: "rig" };
      } else {
        key = "rig";
        label = t.property;
        entity = { kind: "rig", id: "rig" };
      }
      const bucket = ensure(key, key.includes(":") ? key.split(":")[1]! : "rig", entity);
      bucket.channels.push({
        id: `${key}#${anim.name}#${label}`,
        depth: 1,
        kind: "channel",
        label,
        sub: anim.name,
        entity,
        keyframes: ch.data.keyframes.map((k) => ({ time: k.time, value: k.value })),
      });
    }
  }

  // stable order: rig, bones (skeleton order), slots (draw order)
  const order: string[] = ["rig"];
  for (const b of doc.skeleton.bones) order.push(`bone:${b.name}`);
  for (const s of [...doc.slots].sort((a, b) => a.drawOrder - b.drawOrder)) order.push(`slot:${s.name}`);

  const out: OutlineEntry[] = [];
  for (const key of order) {
    const bucket = buckets.get(key);
    if (!bucket) continue;
    out.push({
      id: `group:${key}`,
      depth: 0,
      kind: "group",
      label: bucket.label,
      sub: bucket.sub,
      entity: bucket.entity,
      keyframes: [],
    });
    out.push(...bucket.channels);
  }
  return out;
}

/** Longest keyframe time across the outline, in seconds (min 1s). */
export function outlineDuration(entries: OutlineEntry[]): number {
  let max = 1;
  for (const e of entries) {
    for (const k of e.keyframes) max = Math.max(max, k.time);
  }
  return max;
}
