import { getSupabase } from "@/lib/supabase";
import type { ScanResult } from "@/lib/scanner";

/**
 * Aggregate scan results into visibility_scores, grouped by platform.
 * Called after both manual scans (POST /api/scan) and cron scans.
 *
 * Each call upserts one visibility_scores row per platform for the
 * given business, with period_start = period_end = today's date.
 *
 * Relies on the unique constraint from 004_visibility_scores_unique.sql:
 *   UNIQUE (business_id, platform, period_start, period_end)
 */
export async function aggregateVisibilityScores(
  businessId: string,
  scanResults: ScanResult[]
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Database not configured");

  if (scanResults.length === 0) return;

  const today = new Date().toISOString().split("T")[0]; // "YYYY-MM-DD"

  // Group results by platform
  const byPlatform = new Map<
    string,
    { total: number; mentioned: number; positions: number[] }
  >();

  for (const r of scanResults) {
    if (!byPlatform.has(r.platform)) {
      byPlatform.set(r.platform, { total: 0, mentioned: 0, positions: [] });
    }
    const stats = byPlatform.get(r.platform)!;
    stats.total++;
    if (r.business_mentioned) {
      stats.mentioned++;
      if (r.position_in_response !== null) {
        stats.positions.push(r.position_in_response);
      }
    }
  }

  // Upsert one row per platform for today.
  // The unique constraint on (business_id, platform, period_start, period_end)
  // ensures that re-scanning the same business on the same day overwrites
  // rather than duplicating. This is atomic — no delete+insert race condition.
  for (const [platform, stats] of byPlatform) {
    const mentionRate =
      stats.total > 0 ? stats.mentioned / stats.total : 0;
    const avgPosition =
      stats.positions.length > 0
        ? stats.positions.reduce((a, b) => a + b, 0) / stats.positions.length
        : null;

    const { error } = await supabase.from("visibility_scores").upsert(
      {
        business_id: businessId,
        platform,
        period_start: today,
        period_end: today,
        total_queries: stats.total,
        times_mentioned: stats.mentioned,
        mention_rate: mentionRate,
        avg_position: avgPosition,
      },
      { onConflict: "business_id,platform,period_start,period_end" }
    );

    if (error) {
      console.error(
        `Failed to upsert visibility score for ${platform}:`,
        error.message
      );
    }
  }
}
