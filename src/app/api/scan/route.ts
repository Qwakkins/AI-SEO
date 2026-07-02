import { scanBusiness } from "@/lib/scanner";
import {
  computeVisibilityScores,
  saveVisibilityScores,
} from "@/lib/scanner/aggregate";

export const maxDuration = 300;

export async function POST(request: Request) {
  const body = await request.json();
  const { business_id } = body;

  if (!business_id) {
    return Response.json({ error: "business_id is required" }, { status: 400 });
  }

  try {
    const results = await scanBusiness(business_id);

    try {
      await saveVisibilityScores(business_id, computeVisibilityScores(results));
    } catch (aggErr) {
      // Raw query_results are already saved; a failed aggregation shouldn't fail the scan
      console.error("Aggregation failed:", aggErr);
    }

    return Response.json({
      total_queries: results.length,
      mentioned_count: results.filter((r) => r.business_mentioned).length,
      results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scan failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
