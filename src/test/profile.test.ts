import { describe, expect, it } from "vitest";
import { validateProfile, type Profile } from "@/components/ProfileEditor";

const validProfile: Profile = {
  display_name: "A Customer",
  phone: "",
  gender: "",
  birth_date: "",
  address_line: "",
  locality: "",
  landmark: "",
  city: "",
  state: "",
  pincode: "",
  address_type: "Home",
};

describe("customer profile validation", () => {
  it("requires a full name", () => {
    expect(validateProfile({ ...validProfile, display_name: "   " })).toBe(
      "Please enter your full name.",
    );
  });

  it("accepts an optional Indian mobile number only when it has 10 valid digits", () => {
    expect(validateProfile({ ...validProfile, phone: "9876543210" })).toBeNull();
    expect(validateProfile({ ...validProfile, phone: "1234567890" })).toBe(
      "Mobile number must be 10 digits.",
    );
  });

  it("requires a six-digit pincode when provided", () => {
    expect(validateProfile({ ...validProfile, pincode: "560001" })).toBeNull();
    expect(validateProfile({ ...validProfile, pincode: "56001" })).toBe(
      "Pincode must be 6 digits.",
    );
  });
});
