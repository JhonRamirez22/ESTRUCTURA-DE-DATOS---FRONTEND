import { describe, expect, it } from "vitest";
import {
  formatNotificationMessage,
  formatOrderReference,
} from "@/lib/formatOrderReference";

describe("formatOrderReference", () => {
  it("shortens UUIDs only in their display form", () => {
    expect(formatOrderReference("9876154c-c03d-4de7-8d5a-55f0485599aa")).toBe(
      "#9876154C…99AA",
    );
  });

