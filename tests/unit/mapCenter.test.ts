import { describe, expect, it } from "vitest";
import { getPastoMapCenter } from "@/lib/mapCenter";

describe("getPastoMapCenter", () => {
  it("uses the documented Pasto center when configuration is missing", () => {
    expect(getPastoMapCenter(undefined, undefined)).toEqual([-77.2811, 1.2136]);
  });

  it("uses a valid configured center inside the Pasto service area", () => {
    expect(getPastoMapCenter("1.22", "-77.30")).toEqual([-77.3, 1.22]);
