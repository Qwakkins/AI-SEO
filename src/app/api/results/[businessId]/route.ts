import { getSupabase } from "@/lib/supabase";
import { checkBusinessAccess } from "@/lib/auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ businessId: string }> }
) {
  const { businessId } = await params;

  const access = await checkBusinessAccess(businessId);
  if (!access) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: "Database not configured" }, { status: 500 });
  }

  const { data: results, error } = await supabase
    .from("query_results")
    .select("*, tracking_queries!inner(query_template, business_id)")
    .eq("tracking_queries.business_id", businessId)
    .order("queried_at", { ascending: false })
    .limit(100);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Compute per-platform summary
  const platformSummary: Record<string, { total: number; mentioned: number }> =
    {};
  for (const r of results || []) {
    if (!platformSummary[r.platform]) {
      platformSummary[r.platform] = { total: 0, mentioned: 0 };
    }
    platformSummary[r.platform].total++;
    if (r.business_mentioned) {
      platformSummary[r.platform].mentioned++;
    }
  }

  const summary = Object.entries(platformSummary).map(([platform, stats]) => ({
    platform,
    total: stats.total,
    mentioned: stats.mentioned,
    mention_rate: stats.total > 0 ? stats.mentioned / stats.total : 0,
  }));

  return Response.json({ results, summary });
}
