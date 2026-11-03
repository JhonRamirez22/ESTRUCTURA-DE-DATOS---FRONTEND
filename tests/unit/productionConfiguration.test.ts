import { describe, expect, it } from "vitest";
import { getProductionBackendConfigurationErrors } from "@/lib/auth/productionConfiguration";

describe("getProductionBackendConfigurationErrors", () => {
  it("acepta el origen HTTPS de AWS sin secretos de autenticación en frontend", () => {
    expect(
      getProductionBackendConfigurationErrors({
        PYTHON_API_URL: "https://api.example.com",
      }),
    ).toEqual([]);
  });

  it.each([undefined, "", "invalid", "http://api.example.com", "https://api.example.com/api", "https://api.example.com?key=private", "https://api.example.com/#route", "https://user:private@api.example.com"])("rechaza un origen inválido sin exponerlo (%s)", (value) => {
    expect(getProductionBackendConfigurationErrors({ PYTHON_API_URL: value }))
      .toEqual(["PYTHON_API_URL"]);
  });
});
