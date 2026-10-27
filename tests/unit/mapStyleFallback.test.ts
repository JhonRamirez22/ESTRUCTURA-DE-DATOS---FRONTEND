import { describe, expect, it } from "vitest";
import {
  isMapStyleAuthorizationError,
  KEYLESS_DARK_MAP_STYLE_URL,
} from "@/components/mapStyleFallback";

describe("isMapStyleAuthorizationError", () => {
  it.each([401, 403])("detects HTTP %i tile authorization failures", (status) => {
    expect(isMapStyleAuthorizationError({ error: { status } })).toBe(true);
  });

  it("detects a provider's API-key-required tile message", () => {
    expect(
      isMapStyleAuthorizationError({ error: new Error("API KEY REQUIRED") }),
    ).toBe(true);
