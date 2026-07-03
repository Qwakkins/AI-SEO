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

  const { data: flags, error } = await supabase
    .from("hallucination_flags")
    .select(
      "*, query_results(platform, queried_at, tracking_queries(query_template))"
    )
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ flags: flags || [] });
}
