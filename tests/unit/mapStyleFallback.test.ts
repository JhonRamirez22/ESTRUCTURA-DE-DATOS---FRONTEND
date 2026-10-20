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
  });

  it("does not switch map styles for unrelated errors", () => {
    expect(isMapStyleAuthorizationError({ error: new Error("tile timed out") })).toBe(false);
    expect(isMapStyleAuthorizationError({ message: "forbidden" })).toBe(false);
    expect(isMapStyleAuthorizationError(null)).toBe(false);
  });

  it("uses a keyless dark fallback and never points at CARTO", () => {
    expect(KEYLESS_DARK_MAP_STYLE_URL).toBe("https://tiles.openfreemap.org/styles/dark");
    expect(KEYLESS_DARK_MAP_STYLE_URL).not.toContain("carto");
    expect(KEYLESS_DARK_MAP_STYLE_URL).not.toContain("api_key");
  });
});
