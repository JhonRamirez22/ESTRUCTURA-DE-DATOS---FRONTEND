import { describe, expect, it } from "vitest";
import {
  containsForeignCityReference,
  isWithinPastoServiceArea,
  normalizePastoAddress,
} from "@/lib/pastoArea";

describe("pastoArea", () => {
  it("normaliza abreviaturas comunes de direcciones colombianas", () => {
    expect(normalizePastoAddress("cra. 27 #18-09")).toBe("Carrera 27 # 18-09");
    expect(normalizePastoAddress("cll 18 no. 24-12")).toBe(
      "Calle 18 # 24-12",
    );
    expect(normalizePastoAddress("carrera 25 num 4 sur 65")).toBe(
      "Carrera 25 # 4 sur 65",
    );
