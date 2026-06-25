import { describe, it, expect } from "vitest";
import { SlidingWindowLimiter } from "../src/main/riot/rateLimiter.js";

describe("SlidingWindowLimiter", () => {
  it("allows until limit then requires wait", () => {
    const lim = new SlidingWindowLimiter([[2, 10]]);
    expect(lim.timeUntilAvailable(0)).toBe(0);
    lim.record(0);
    expect(lim.timeUntilAvailable(0)).toBe(0);
    lim.record(0);
    expect(lim.timeUntilAvailable(0)).toBe(10);
  });

  it("window slides as time passes", () => {
    const lim = new SlidingWindowLimiter([[2, 10]]);
    lim.record(0);
    lim.record(0);
    expect(lim.timeUntilAvailable(10)).toBe(0);
  });

  it("two windows take the stricter wait", () => {
    const lim = new SlidingWindowLimiter([[20, 1], [3, 120]]);
    for (let i = 0; i < 3; i++) lim.record(0);
    expect(lim.timeUntilAvailable(0.5)).toBe(119.5);
  });
});
