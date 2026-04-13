import { scanBusiness } from "@/lib/scanner";

export async function POST(request: Request) {
  const body = await request.json();
  const { business_id } = body;

  if (!business_id) {
    return Response.json({ error: "business_id is required" }, { status: 400 });
  }

  try {
    const results = await scanBusiness(business_id);
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
