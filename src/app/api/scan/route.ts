import { scanBusiness } from "@/lib/scanner";
import { checkBusinessAccess } from "@/lib/auth";
import { aggregateVisibilityScores } from "@/lib/scanner/aggregator";
import { detectHallucinations } from "@/lib/scanner/hallucination-detector";
import { getSupabase } from "@/lib/supabase";

export async function POST(request: Request) {
  const body = await request.json();
  const { business_id } = body;

  if (!business_id) {
    return Response.json({ error: "business_id is required" }, { status: 400 });
  }

  const access = await checkBusinessAccess(business_id, "editor");
  if (!access) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const startTime = Date.now();

  try {
    const results = await scanBusiness(business_id);

    await aggregateVisibilityScores(business_id, results);

    try {
      await detectHallucinations(business_id);
    } catch (err) {
      console.error("Hallucination detection failed:", err);
    }

    const supabase = getSupabase();
    if (supabase) {
      await supabase.from("scan_logs").insert({
        scan_type: "manual",
        businesses_scanned: 1,
        businesses_failed: 0,
        total_duration_ms: Date.now() - startTime,
        details: [{ business_id, status: "ok", queries_run: results.length }],
        started_at: new Date(startTime).toISOString(),
        completed_at: new Date().toISOString(),
      });
    }

    return Response.json({
      total_queries: results.length,
      mentioned_count: results.filter((r) => r.business_mentioned).length,
      results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scan failed";

    const supabase = getSupabase();
    if (supabase) {
      await supabase.from("scan_logs").insert({
        scan_type: "manual",
        businesses_scanned: 0,
        businesses_failed: 1,
        total_duration_ms: Date.now() - startTime,
        details: [{ business_id, status: "error", error: message }],
        started_at: new Date(startTime).toISOString(),
        completed_at: new Date().toISOString(),
      });
    }

    return Response.json({ error: message }, { status: 500 });
  }
}
