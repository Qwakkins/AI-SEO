import { describe, expect, it } from "vitest";
import { matchFacts } from "../hallucination-detector";
import type { ExtractedFacts } from "../fact-extractor";

const truth = {
  phone: "619-555-0184",
  address_street: "1412 Market Street",
  address_city: "San Diego",
  address_state: "CA",
  address_zip: "92101",
  website_url: "https://harbordental.com",
  services: ["Cleanings", "Implants"],
};

const facts = (f: Partial<ExtractedFacts>): ExtractedFacts => ({
  phones: [],
  addresses: [],
  websites: [],
  services: [],
  ...f,
});

describe("matchFacts", () => {
  it("raises no flags when every claim matches the verified details", () => {
    const flags = matchFacts(
      facts({
        phones: ["+1 (619) 555-0184"],
        addresses: ["1412 Market St"],
        websites: ["www.harbordental.com/contact"],
        services: ["teeth cleanings", "implants"],
      }),
      truth
    );
    expect(flags).toEqual([]);
  });

  it("flags a wrong phone number as incorrect", () => {
    const flags = matchFacts(facts({ phones: ["619-555-0148"] }), truth);
    expect(flags).toContainEqual(
      expect.objectContaining({ field: "phone", flag_type: "incorrect", ai_claim: "619-555-0148" })
    );
  });

  it("tolerates small address typos but flags a different street", () => {
    const close = matchFacts(facts({ addresses: ["1412 Markt Street"] }), truth);
    expect(close.some((f) => f.field === "address")).toBe(false);

    const wrong = matchFacts(facts({ addresses: ["88 Harbor Drive"] }), truth);
    expect(wrong).toContainEqual(
      expect.objectContaining({ field: "address", flag_type: "incorrect" })
    );
  });

  it("flags a different domain as incorrect", () => {
    const flags = matchFacts(facts({ websites: ["harbor-dental.net"] }), truth);
    expect(flags).toContainEqual(
      expect.objectContaining({ field: "website", flag_type: "incorrect" })
    );
  });

  it("marks unknown services unverifiable and missing ones not mentioned", () => {
    const flags = matchFacts(facts({ services: ["Invisalign", "Cleanings"] }), truth);
    expect(flags).toContainEqual(
      expect.objectContaining({ field: "services", ai_claim: "Invisalign", flag_type: "unverifiable" })
    );
    expect(flags).toContainEqual(
      expect.objectContaining({ field: "services", ground_truth_value: "Implants", flag_type: "not_mentioned" })
    );
  });

  it("marks claims unverifiable when there is nothing to compare against", () => {
    const empty = {
      phone: null,
      address_street: null,
      address_city: null,
      address_state: null,
      address_zip: null,
      website_url: null,
      services: [],
    };
    const flags = matchFacts(facts({ phones: ["619-555-0184"], websites: ["x.com"] }), empty);
    expect(flags.map((f) => f.flag_type)).toEqual(["unverifiable", "unverifiable"]);
  });
});
