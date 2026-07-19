declare module "polymorph-js" {
  export interface InterpolateOptions {
    readonly precision?: number;
    readonly optimize?: "none" | "fill";
    readonly origin?: { readonly x: number; readonly y: number };
  }
  /** Build a shape tween: `f(t)` is the morphed `d` string at `t ∈ [0, 1]`. */
  export function interpolate(
    paths: readonly string[],
    options?: InterpolateOptions,
  ): (offset: number) => string;
}
