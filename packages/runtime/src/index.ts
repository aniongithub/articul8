/**
 * articul8 runtime — a pure, immediate-mode evaluator for SVG skeletal
 * animation. One primitive underneath it all: blend poses by weight. Tracks
 * produce poses, a skeleton turns a pose into transforms, a skin turns
 * transforms into moved path points. Nothing is retained; the caller owns the
 * clock and asks for a frame whenever it likes.
 */
export { blend, type Pose, type Value } from "./pose";
export { sample, at, type Track, type Channel, type Axis, type Controller } from "./track";
export { sine, noise, generators, type Env, type Knob, type Generator } from "./generator";
export {
  linear,
  bezier,
  segment,
  type Ease,
  type Handle,
} from "./ease";
export {
  clip,
  sampler,
  place,
  axis,
  mix,
  hold,
  clamp,
  loop,
  pingpong,
  type Anim,
  type Wrap,
} from "./layer";
export { world, type Bone, type Skeleton } from "./skeleton";
export { parsePath, buildPath, type ParsedPath, type Pt, type Seg } from "./path";
export { bindSkin, type Skin, type SkinMap } from "./skin";
export { rig, type Rig, type RigData, type RigOptions, type Controllers, type View, type Puppet, type Attrs } from "./rig";
export { parseRig } from "./load";
export { parseAttr, type Attr } from "./attr";
export {
  identity,
  translate,
  rotate,
  scale,
  mul,
  apply,
  invert,
  type Mat,
} from "./matrix";
