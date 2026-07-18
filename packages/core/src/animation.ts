import { type ChannelData, channelDuration, sampleChannel } from "./channel.js";
import type { BoneLocal } from "./bone.js";
import type { Skeleton } from "./skeleton.js";

/** Which value a channel drives. */
export type ChannelTarget =
  | { kind: "bone"; bone: string; property: keyof BoneLocal }
  | { kind: "slot"; slot: string; property: "alpha" | `morph.${string}` }
  | { kind: "input"; input: string; property: "x" | "y" | "z" }
  | { kind: "rig"; property: string };

export interface AnimationChannel {
  target: ChannelTarget;
  data: ChannelData;
  /** additive channels sum onto the current pose; override channels replace it */
  additive?: boolean;
}

export interface AnimationData {
  name: string;
  /** default additive flag for channels that don't specify one */
  additive?: boolean;
  channels: AnimationChannel[];
}

export class Animation {
  readonly name: string;
  readonly additive: boolean;
  readonly channels: AnimationChannel[];
  readonly duration: number;

  constructor(data: AnimationData) {
    this.name = data.name;
    this.additive = data.additive ?? false;
    this.channels = data.channels;
    this.duration = data.channels.reduce(
      (m, c) => Math.max(m, channelDuration(c.data)),
      0,
    );
  }

  /** Apply this animation at local time `t` with `weight` onto the skeleton. */
  apply(skeleton: Skeleton, t: number, weight = 1): void {
    for (const ch of this.channels) {
      const additive = ch.additive ?? this.additive;
      const v = sampleChannel(ch.data, t);
      applyChannel(skeleton, ch.target, v, additive, weight);
    }
  }
}

function applyChannel(
  skeleton: Skeleton,
  target: ChannelTarget,
  value: number,
  additive: boolean,
  weight: number,
): void {
  switch (target.kind) {
    case "bone": {
      const bone = skeleton.bones.get(target.bone);
      if (!bone) return;
      const prop = target.property;
      const cur = bone.local[prop];
      bone.local[prop] = additive ? cur + value * weight : mix(cur, value, weight);
      return;
    }
    case "slot": {
      const slot = skeleton.slots.find((s) => s.name === target.slot);
      if (!slot) return;
      if (target.property === "alpha") {
        slot.alpha = additive ? slot.alpha + value * weight : mix(slot.alpha, value, weight);
      } else {
        const key = target.property.slice("morph.".length);
        const cur = slot.morph[key] ?? 0;
        slot.morph[key] = additive ? cur + value * weight : mix(cur, value, weight);
      }
      return;
    }
    case "input": {
      const inp = skeleton.getInputTarget(target.input);
      const cur = inp[target.property];
      inp[target.property] = additive ? cur + value * weight : mix(cur, value, weight);
      return;
    }
    case "rig": {
      const cur = skeleton.globals[target.property] ?? 0;
      skeleton.globals[target.property] = additive
        ? cur + value * weight
        : mix(cur, value, weight);
      return;
    }
  }
}

function mix(a: number, b: number, w: number): number {
  return a + (b - a) * w;
}
