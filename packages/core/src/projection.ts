import type { Vec2 } from "./math.js";

/**
 * 2.5D projection. Author depth (z); scale + parallax emerge from projecting
 * animated 3D anchors through a simple pinhole camera.
 *
 * Convention: z = 0 is the projection plane (scale 1). z > 0 recedes
 * (foreshortens, scale < 1); z < 0 approaches (scale > 1). Off-center points
 * shift under z changes -> that shift IS parallax.
 */
export interface Camera {
  /** how strongly z maps to scale; larger = weaker perspective */
  focalLength: number;
  /** vanishing point in world units (usually the rig center) */
  center: Vec2;
}

export interface Projected {
  x: number;
  y: number;
  scale: number;
}

export function makeCamera(focalLength = 600, center: Vec2 = { x: 0, y: 0 }): Camera {
  return { focalLength, center };
}

/** Project a world point (x, y, z) to screen (x, y, scale). */
export function project(cam: Camera, x: number, y: number, z: number): Projected {
  const f = cam.focalLength;
  // Guard against collapse behind the camera.
  const denom = Math.max(f + z, 1e-3);
  const scale = f / denom;
  return {
    x: cam.center.x + (x - cam.center.x) * scale,
    y: cam.center.y + (y - cam.center.y) * scale,
    scale,
  };
}
