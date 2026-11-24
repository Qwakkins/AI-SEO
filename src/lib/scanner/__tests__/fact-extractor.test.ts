import { describe, expect, it } from "vitest";
import { extractFacts } from "../fact-extractor";

describe("extractFacts", () => {
  it("dedupes phone numbers written in different formats", () => {
    const f = extractFacts("Call (619) 555-0184 or +1 619-555-0184, or 858.555.0100.");
    expect(f.phones).toHaveLength(2);
    expect(f.phones[0]).toContain("555-0184");
  });

  it("extracts street addresses with a suite number", () => {
    const f = extractFacts("Visit us at 1412 Market Street Suite 200, San Diego.");
    expect(f.addresses).toEqual(["1412 Market Street Suite 200"]);
  });

  it("collapses URLs and bare domains that point at the same site", () => {
    const f = extractFacts(
      "See https://www.harbordental.com/about or harbordental.com, and also smiles.io."
    );
    expect(f.websites).toEqual(["https://www.harbordental.com/about", "smiles.io"]);
  });

  it("reads services from list items and inline phrases", () => {
    const f = extractFacts(
      "The practice offers cleanings, whitening and implants.\n- **Emergency care**\n- Invisalign"
    );
    expect(f.services).toEqual(
      expect.arrayContaining(["cleanings", "whitening", "implants", "Emergency care", "Invisalign"])
    );
  });

  it("returns empty lists for text with no facts", () => {
    expect(extractFacts("No details are available.")).toEqual({
      phones: [],
      addresses: [],
      websites: [],
      services: [],
    });
  });
});
