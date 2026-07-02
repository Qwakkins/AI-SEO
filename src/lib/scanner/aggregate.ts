export interface ResultRow {
  platform: string;
  business_mentioned: boolean;
  position_in_response: number | null;
}

export interface PlatformScore {
  platform: string;
  total_queries: number;
  times_mentioned: number;
  mention_rate: number;
  avg_position: number | null;
}

export function computeVisibilityScores(results: ResultRow[]): PlatformScore[] {
  const byPlatform = new Map<string, ResultRow[]>();
  for (const r of results) {
    const rows = byPlatform.get(r.platform) ?? [];
    rows.push(r);
    byPlatform.set(r.platform, rows);
  }

  return [...byPlatform.entries()].map(([platform, rows]) => {
    const mentioned = rows.filter((r) => r.business_mentioned);
    const positions = rows
      .map((r) => r.position_in_response)
      .filter((p): p is number => p !== null);
    return {
      platform,
      total_queries: rows.length,
      times_mentioned: mentioned.length,
      mention_rate: mentioned.length / rows.length,
      avg_position:
        positions.length > 0
          ? positions.reduce((sum, p) => sum + p, 0) / positions.length
          : null,
    };
  });
}
