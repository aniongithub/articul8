import { describe, it, expect } from "vitest";
import { blend } from "../src/pose";

describe("blend", () => {
  it("weight-averages a channel across the poses that carry it", () => {
    const out = blend([{ a: 0 }, { a: 10 }], [1, 3]);
    expect(out.a).toBeCloseTo(7.5);
  });

  it("lets an absent channel abstain — no vote for zero or rest", () => {
    // Only the first pose speaks to `a`; the second's weight must not dilute it.
    const out = blend([{ a: 5 }, { b: 100 }], [1, 9]);
    expect(out.a).toBeCloseTo(5);
    expect(out.b).toBeCloseTo(100);
  });

  it("drops channels no pose carries so they fall through to rest", () => {
    const out = blend([{ a: 1 }], [1]);
    expect("b" in out).toBe(false);
  });

  it("is a pure function of its inputs", () => {
    const poses = [{ a: 2 }, { a: 4 }];
    const weights = [1, 1];
    expect(blend(poses, weights)).toEqual(blend(poses, weights));
  });
});
