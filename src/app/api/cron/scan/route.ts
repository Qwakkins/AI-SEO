import { scanBusiness } from "@/lib/scanner";
import {
  computeVisibilityScores,
  saveVisibilityScores,
} from "@/lib/scanner/aggregate";
import { getSupabase } from "@/lib/supabase";

export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: "Database not configured" }, { status: 500 });
  }

  const { data: businesses, error } = await supabase
    .from("businesses")
    .select("id, name");
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  let scanned = 0;
  const errors: { business: string; error: string }[] = [];

  for (const biz of businesses ?? []) {
    try {
      const results = await scanBusiness(biz.id);
      const scores = computeVisibilityScores(results);
      await saveVisibilityScores(biz.id, scores);
      scanned++;
    } catch (err) {
      errors.push({
        business: biz.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return Response.json({ scanned, failed: errors.length, errors });
}
