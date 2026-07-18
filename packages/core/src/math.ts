/**
 * Pure math primitives. No DOM, no backend awareness.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export function vec2(x = 0, y = 0): Vec2 {
  return { x, y };
}

export function vec3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * A 2D affine transform stored as a 2x3 matrix:
 *   | a c tx |
 *   | b d ty |
 * Column-major-ish; maps (x, y) -> (a*x + c*y + tx, b*x + d*y + ty).
 */
export interface Mat2D {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

export function matIdentity(): Mat2D {
  return { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
}

/** Compose parent * child (apply child first, then parent). */
export function matMul(p: Mat2D, c: Mat2D): Mat2D {
  return {
    a: p.a * c.a + p.c * c.b,
    b: p.b * c.a + p.d * c.b,
    c: p.a * c.c + p.c * c.d,
    d: p.b * c.c + p.d * c.d,
    tx: p.a * c.tx + p.c * c.ty + p.tx,
    ty: p.b * c.tx + p.d * c.ty + p.ty,
  };
}

/** Build an affine from translate / rotate(deg) / scale. */
export function matFromTRS(
  x: number,
  y: number,
  rotationDeg: number,
  sx: number,
  sy: number,
): Mat2D {
  const r = degToRad(rotationDeg);
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return {
    a: cos * sx,
    b: sin * sx,
    c: -sin * sy,
    d: cos * sy,
    tx: x,
    ty: y,
  };
}

/** Apply an affine to a point. */
export function matApply(m: Mat2D, p: Vec2): Vec2 {
  return {
    x: m.a * p.x + m.c * p.y + m.tx,
    y: m.b * p.x + m.d * p.y + m.ty,
  };
}
