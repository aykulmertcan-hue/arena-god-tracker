import { describe, it, expect } from "vitest";
import { resolveRouting, routingForPlatform, SERVERS } from "../src/main/riot/routing.js";

describe("routing", () => {
  it("maps known servers to regional routing", () => {
    expect(resolveRouting("TR1")).toEqual(["europe", "tr1"]);
    expect(resolveRouting("euw1")).toEqual(["europe", "euw1"]);
    expect(resolveRouting("NA1")).toEqual(["americas", "na1"]);
    expect(resolveRouting("KR")).toEqual(["asia", "kr"]);
  });

  it("throws on unknown server", () => {
    expect(() => resolveRouting("ZZZ")).toThrow();
  });

  it("routingForPlatform resolves cluster", () => {
    expect(routingForPlatform("TR1")).toBe("europe");
    expect(routingForPlatform("kr")).toBe("asia");
  });

  it("SERVERS is non-empty and uppercase", () => {
    expect(SERVERS).toContain("TR1");
    expect(SERVERS.every((s) => s === s.toUpperCase())).toBe(true);
  });
});
