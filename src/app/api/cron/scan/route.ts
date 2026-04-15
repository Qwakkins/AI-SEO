import { getSupabase } from "@/lib/supabase";
import { scanBusiness, type ScanResult } from "@/lib/scanner";
import { aggregateVisibilityScores } from "@/lib/scanner/aggregator";

const DELAY_BETWEEN_BUSINESSES_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function GET(request: Request) {
  // Verify cron secret — Vercel sends this as Authorization header
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: "Database not configured" }, { status: 500 });
  }

  const startTime = Date.now();

  // Fetch all businesses
  const { data: businesses, error: bizError } = await supabase
    .from("businesses")
    .select("id, name")
    .order("created_at");

  if (bizError) {
    return Response.json({ error: "Failed to fetch businesses" }, { status: 500 });
  }

  if (!businesses || businesses.length === 0) {
    return Response.json({ message: "No businesses to scan", scanned: 0 });
  }

  // Process businesses sequentially with delay between each
  const results: {
    business_id: string;
    business_name: string;
    status: "ok" | "error";
    queries_run?: number;
    error?: string;
  }[] = [];

  for (let i = 0; i < businesses.length; i++) {
    const biz = businesses[i];

    // Budget check: if we've used more than 250s of the 300s timeout, stop
    if (Date.now() - startTime > 250_000) {
      results.push({
        business_id: biz.id,
        business_name: biz.name,
        status: "error",
        error: "Skipped — approaching function timeout",
      });
      continue;
    }

    try {
      const scanResults: ScanResult[] = await scanBusiness(biz.id);
      await aggregateVisibilityScores(biz.id, scanResults);

      results.push({
        business_id: biz.id,
        business_name: biz.name,
        status: "ok",
        queries_run: scanResults.length,
      });
    } catch (err) {
      results.push({
        business_id: biz.id,
        business_name: biz.name,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
      // Continue scanning other businesses — error isolation
    }

    // Delay between businesses to respect rate limits
    if (i < businesses.length - 1) {
      await sleep(DELAY_BETWEEN_BUSINESSES_MS);
    }
  }

  const totalDuration = Date.now() - startTime;
  const scannedCount = results.filter((r) => r.status === "ok").length;
  const failedCount = results.filter((r) => r.status === "error").length;

  // Log scan cycle
  await supabase.from("scan_logs").insert({
    scan_type: "cron_weekly",
    businesses_scanned: scannedCount,
    businesses_failed: failedCount,
    total_duration_ms: totalDuration,
    details: results,
    started_at: new Date(startTime).toISOString(),
    completed_at: new Date().toISOString(),
  });

  return Response.json({
    scanned: scannedCount,
    failed: failedCount,
    duration_ms: totalDuration,
    results,
  });
}
