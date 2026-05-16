/**
 * Logic-only tests for the votes client helpers. The full hook wiring
 * needs a DOM and is exercised in the production smoke tests.
 */
import { describe, it, expect } from "vitest";
import { hotness, netToRubricRaw } from "@/lib/votes_client";

describe("hotness", () => {
  it("returns 0 for zero net votes", () => {
    expect(hotness(0, 0)).toBe(0);
    expect(hotness(0, 12)).toBe(0);
  });

  it("scales log-magnitude with sign", () => {
    expect(hotness(1, 0)).toBeCloseTo(0, 5);   // log10(1) = 0
    expect(hotness(10, 0)).toBeCloseTo(1, 5);
    expect(hotness(100, 0)).toBeCloseTo(2, 5);
    expect(hotness(-10, 0)).toBeCloseTo(-1, 5);
  });

  it("decays with age (older papers have lower hotness for same net)", () => {
    const fresh = hotness(10, 0);
    const yearOld = hotness(10, 12);
    const twoYearOld = hotness(10, 24);
    expect(fresh).toBeGreaterThan(yearOld);
    expect(yearOld).toBeGreaterThan(twoYearOld);
  });
});

describe("netToRubricRaw", () => {
  it("maps 0 → neutral 5", () => {
    expect(netToRubricRaw(0)).toBe(5);
  });
  it("is monotonic non-decreasing in net (positive side)", () => {
    for (let i = 0; i < 30; i++) {
      expect(netToRubricRaw(i + 1)).toBeGreaterThanOrEqual(netToRubricRaw(i));
    }
  });
  it("caps at 10 for very positive net", () => {
    expect(netToRubricRaw(10_000)).toBeLessThanOrEqual(10);
  });
  it("floors at 0 for very negative net", () => {
    expect(netToRubricRaw(-10_000)).toBeGreaterThanOrEqual(0);
  });
  it("is symmetric around the neutral point", () => {
    expect(netToRubricRaw(3) - 5).toBeCloseTo(5 - netToRubricRaw(-3), 5);
  });
});
