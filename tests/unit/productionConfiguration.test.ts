import { describe, expect, it } from "vitest";
import { getProductionBackendConfigurationErrors } from "@/lib/auth/productionConfiguration";

describe("getProductionBackendConfigurationErrors", () => {
  it("acepta el origen HTTPS de AWS sin secretos de autenticación en frontend", () => {
    expect(
      getProductionBackendConfigurationErrors({
        PYTHON_API_URL: "https://api.example.com",
      }),
