import { getSupabase } from "@/lib/supabase";

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

export async function saveVisibilityScores(
  businessId: string,
  scores: PlatformScore[]
): Promise<void> {
  if (scores.length === 0) return;
  const supabase = getSupabase();
  if (!supabase) throw new Error("Database not configured");

  const today = new Date().toISOString().slice(0, 10);

  // Re-scanning the same day replaces that day's rows instead of duplicating them
  const { error: deleteError } = await supabase
    .from("visibility_scores")
    .delete()
    .eq("business_id", businessId)
    .eq("period_start", today);
  if (deleteError) throw new Error(deleteError.message);

  const rows = scores.map((s) => ({
    business_id: businessId,
    platform: s.platform,
    period_start: today,
    period_end: today,
    total_queries: s.total_queries,
    times_mentioned: s.times_mentioned,
    mention_rate: s.mention_rate,
    avg_position: s.avg_position,
  }));

  const { error } = await supabase.from("visibility_scores").insert(rows);
  if (error) throw new Error(error.message);
}
