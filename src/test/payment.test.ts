import { describe, expect, it } from "vitest";
import { getPaymentTotal } from "@/lib/payment";

describe("online payment totals", () => {
  it("calculates INR totals from the trusted server catalog", () => {
    expect(
      getPaymentTotal([
        { id: "steel", qty: 1 },
        { id: "gold", qty: 2 },
      ]),
    ).toBe(49800);
  });

  it("prices seller-added watches using server-provided catalog prices", () => {
    expect(getPaymentTotal([{ id: "titanium-diver", qty: 2 }], { "titanium-diver": 22000 })).toBe(
      44000,
    );
  });

  it("rejects custom watches that are not present in the active catalog", () => {
    expect(() => getPaymentTotal([{ id: "unknown-watch", qty: 1 }])).toThrow();
  });

  it("rejects duplicate product lines to prevent ambiguous carts", () => {
    expect(() =>
      getPaymentTotal([
        { id: "steel", qty: 1 },
        { id: "steel", qty: 1 },
      ]),
    ).toThrow();
  });

  it("rejects invalid quantities", () => {
    expect(() => getPaymentTotal([{ id: "steel", qty: 0 }])).toThrow();
    expect(() => getPaymentTotal([{ id: "steel", qty: 21 }])).toThrow();
  });
});
