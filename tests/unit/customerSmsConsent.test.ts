import { describe, expect, it } from "vitest";
import { buildCustomerSmsConsent } from "@/lib/customerSmsConsent";

describe("buildCustomerSmsConsent", () => {
  it("never sends or stores a phone without explicit consent", () => {
    expect(buildCustomerSmsConsent("300 123 4567", false)).toEqual({
      customerPhone: null,
      smsNotificationsEnabled: false,
    });
  });

  it("normalizes a local Colombian mobile number to E.164", () => {
    expect(buildCustomerSmsConsent(" 300 123 4567 ", true)).toEqual({
