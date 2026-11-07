import { describe, expect, it } from "vitest";
import { formatPrice } from "./api";

describe("formatPrice", () => {
  it("formats crore", () => expect(formatPrice(21000000)).toBe("₹2.10 Cr"));
  it("formats lakh", () => expect(formatPrice(6200000)).toBe("₹62.00 L"));
  it("formats small amounts with Indian grouping", () => expect(formatPrice(45000)).toBe("₹45,000"));
});
