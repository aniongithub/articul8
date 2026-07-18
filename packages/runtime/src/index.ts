/**
 * articul8 runtime — a pure, immediate-mode evaluator for SVG skeletal
 * animation. One primitive underneath it all: blend poses by weight. Tracks
 * produce poses, a skeleton turns a pose into transforms, a skin turns
 * transforms into moved path points. Nothing is retained; the caller owns the
 * clock and asks for a frame whenever it likes.
 */
export { blend, type Pose } from "./pose";
export { sample, type Track, type Channel } from "./track";
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
export { rig, type Rig, type RigData, type View } from "./rig";
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
