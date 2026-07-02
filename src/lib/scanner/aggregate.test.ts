import { describe, it, expect } from "vitest";
import { computeVisibilityScores } from "./aggregate";

describe("computeVisibilityScores", () => {
  it("returns empty array for no results", () => {
    expect(computeVisibilityScores([])).toEqual([]);
  });

  it("groups results by platform and computes mention rate", () => {
    const scores = computeVisibilityScores([
      { platform: "chatgpt", business_mentioned: true, position_in_response: 1 },
      { platform: "chatgpt", business_mentioned: false, position_in_response: null },
      { platform: "claude", business_mentioned: true, position_in_response: 3 },
      { platform: "claude", business_mentioned: true, position_in_response: 5 },
    ]);

    const chatgpt = scores.find((s) => s.platform === "chatgpt");
    const claude = scores.find((s) => s.platform === "claude");

    expect(chatgpt).toEqual({
      platform: "chatgpt",
      total_queries: 2,
      times_mentioned: 1,
      mention_rate: 0.5,
      avg_position: 1,
    });
    expect(claude).toEqual({
      platform: "claude",
      total_queries: 2,
      times_mentioned: 2,
      mention_rate: 1,
      avg_position: 4,
    });
  });

  it("ignores null positions when averaging", () => {
    const scores = computeVisibilityScores([
      { platform: "chatgpt", business_mentioned: true, position_in_response: 2 },
      { platform: "chatgpt", business_mentioned: true, position_in_response: null },
    ]);
    expect(scores[0].avg_position).toBe(2);
  });

  it("returns null avg_position when no positions exist", () => {
    const scores = computeVisibilityScores([
      { platform: "chatgpt", business_mentioned: false, position_in_response: null },
    ]);
    expect(scores[0].avg_position).toBeNull();
    expect(scores[0].mention_rate).toBe(0);
  });
});
