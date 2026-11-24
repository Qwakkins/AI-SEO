import { describe, expect, it } from "vitest";
import { analyzeResponse } from "../analyzer";

const answer = `Here are some highly rated dentists in San Diego:

1. **Bright Smile Dental** - known for cosmetic work.
2. **Harbor Family Dental** - great with kids.
3. **Coastal Dentistry** - open on weekends.

Harbor Family Dental also offers same-day crowns.`;

describe("analyzeResponse", () => {
  it("detects a mention case-insensitively and records the sentence", () => {
    const r = analyzeResponse(answer, "harbor family dental");
    expect(r.business_mentioned).toBe(true);
    expect(r.mention_context).toContain("Harbor Family Dental");
    expect(r.position_in_response).toBeGreaterThan(0);
  });

  it("lists competitors but never the business itself", () => {
    const r = analyzeResponse(answer, "Harbor Family Dental");
    expect(r.competitors_mentioned).toContain("Bright Smile Dental");
    expect(r.competitors_mentioned).toContain("Coastal Dentistry");
    expect(r.competitors_mentioned).not.toContain("Harbor Family Dental");
  });

  it("reports no mention, context or position when the business is absent", () => {
    const r = analyzeResponse(answer, "Pacific Orthodontics");
    expect(r).toMatchObject({
      business_mentioned: false,
      mention_context: null,
      position_in_response: null,
    });
  });

  it("caps the competitor list at 20 names", () => {
    const many = Array.from({ length: 30 }, (_, i) => `- Competitor Number ${i}`).join("\n");
    expect(analyzeResponse(many, "Nobody").competitors_mentioned).toHaveLength(20);
  });
});
