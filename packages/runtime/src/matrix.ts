/**
 * A 2x3 affine transform `[a, b, c, d, e, f]`, mapping a point (x, y) to
 * `(a·x + c·y + e,  b·x + d·y + f)`. Enough for position, rotation and scale
 * in a plane — the whole vocabulary a 2D skeleton needs.
 */
export type Mat = readonly [number, number, number, number, number, number];

export const identity: Mat = [1, 0, 0, 1, 0, 0];

export const translate = (x: number, y: number): Mat => [1, 0, 0, 1, x, y];

export const rotate = (deg: number): Mat => {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [c, s, -s, c, 0, 0];
};

export const scale = (sx: number, sy: number): Mat => [sx, 0, 0, sy, 0, 0];

/** Compose: `mul(a, b)` applies `b`, then `a`. */
export const mul = (a: Mat, b: Mat): Mat => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];

export const apply = (m: Mat, x: number, y: number): [number, number] => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];

export const invert = (m: Mat): Mat => {
  const id = 1 / (m[0] * m[3] - m[1] * m[2]);
  return [
    m[3] * id,
    -m[1] * id,
    -m[2] * id,
    m[0] * id,
    (m[2] * m[5] - m[3] * m[4]) * id,
    (m[1] * m[4] - m[0] * m[5]) * id,
  ];
};
